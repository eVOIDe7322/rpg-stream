import { EntityNotFoundError } from '../../../shared/domain/errors.js';
import { VideoRepository } from '../domain/video-repository.js';
import { Video } from '../domain/video.js';
import { ProcessingHistoryRepository } from './ports/processing-history-repository.js';
import {
    VideoJob,
    VideoJobRepository,
} from './ports/video-job-repository.js';
import { VideoStorage } from './ports/video-storage.js';
import { VideoTranscoder } from './ports/video-transcoder.js';
import { ProcessingEventBus } from './processing-event-bus.js';

type StopAction = 'pausado' | 'cancelado';

export class VideoProcessingQueue {
    private readonly active = new Map<string, AbortController>();
    private readonly activeTasks = new Map<string, Promise<void>>();
    private readonly stopActions = new Map<string, StopAction>();
    private pumping = false;
    private shuttingDown = false;

    constructor(
        private readonly videos: VideoRepository,
        private readonly jobs: VideoJobRepository,
        private readonly storage: VideoStorage,
        private readonly transcoder: VideoTranscoder,
        private readonly history: ProcessingHistoryRepository,
        private readonly events: ProcessingEventBus,
        private readonly concurrency: number,
    ) {}

    async initialize(): Promise<void> {
        const interrupted = await this.jobs.findByStates(['processando']);

        for (const job of interrupted) {
            await this.jobs.updateState(job.videoId, 'aguardando');
            const video = await this.videos.findById(job.videoId);

            if (video) {
                video.markAsQueued();
                await this.videos.save(video);
                await this.history.add({
                    videoId: job.videoId,
                    level: 'warning',
                    event: 'recovered',
                    message: 'Conversão recolocada na fila após reinício.',
                });
            }
        }

        this.notify();
    }

    notify(): void {
        if (this.shuttingDown) {
            return;
        }

        void this.pump();
    }

    async shutdown(): Promise<void> {
        this.shuttingDown = true;

        for (const controller of this.active.values()) {
            controller.abort();
        }

        await Promise.allSettled(this.activeTasks.values());
    }

    async pause(videoId: string): Promise<void> {
        await this.stop(videoId, 'pausado');
    }

    async cancel(videoId: string): Promise<void> {
        await this.stop(videoId, 'cancelado');
    }

    async resume(videoId: string): Promise<void> {
        const job = await this.requireJob(videoId);

        if (!(await this.storage.temporaryFileExists(job.temporaryFile))) {
            throw new Error(
                'O arquivo original não está mais disponível para retomar.',
            );
        }

        const video = await this.requireVideo(videoId);
        video.markAsQueued();
        await this.videos.save(video);
        await this.jobs.updateState(videoId, 'aguardando');
        await this.history.add({
            videoId,
            level: 'info',
            event: 'queued',
            message: 'Conversão adicionada novamente à fila.',
        });
        this.events.publish({ type: 'queue', videoId, title: video.title });
        this.notify();
    }

    private async stop(videoId: string, action: StopAction): Promise<void> {
        const job = await this.requireJob(videoId);
        const video = await this.requireVideo(videoId);
        const controller = this.active.get(videoId);

        if (controller) {
            this.stopActions.set(videoId, action);
            controller.abort();
            await this.activeTasks.get(videoId);
        } else {
            await this.jobs.updateState(videoId, action);
            action === 'pausado'
                ? video.markAsPaused()
                : video.markAsCancelled();
            await this.videos.save(video);
        }

        await this.history.add({
            videoId,
            level: 'info',
            event: action,
            message:
                action === 'pausado'
                    ? 'Conversão pausada pelo usuário.'
                    : 'Conversão cancelada pelo usuário.',
            details: `Estado anterior: ${job.state}.`,
        });
    }

    private async pump(): Promise<void> {
        if (this.pumping) {
            return;
        }

        this.pumping = true;

        try {
            while (this.active.size < this.concurrency) {
                const [next] = await this.jobs.findByStates(['aguardando']);

                if (!next || this.active.has(next.videoId)) {
                    break;
                }

                const controller = new AbortController();
                this.active.set(next.videoId, controller);
                const task = this.process(next, controller).finally(() => {
                    this.active.delete(next.videoId);
                    this.activeTasks.delete(next.videoId);
                    this.stopActions.delete(next.videoId);
                    this.notify();
                });
                this.activeTasks.set(next.videoId, task);
            }
        } finally {
            this.pumping = false;
        }
    }

    private async process(
        job: VideoJob,
        controller: AbortController,
    ): Promise<void> {
        const video = await this.requireVideo(job.videoId);
        let progressWrites = Promise.resolve();
        let savedProgress = 0;

        try {
            if (!(await this.storage.temporaryFileExists(job.temporaryFile))) {
                throw new Error('O arquivo original da conversão não existe.');
            }

            const output = await this.storage.resetOutput(job.videoId);
            video.markAsProcessing();
            await this.videos.save(video);
            await this.jobs.startAttempt(job.videoId);
            await this.history.add({
                videoId: job.videoId,
                level: 'info',
                event: 'started',
                message: 'FFmpeg iniciou a conversão.',
                details: `Tentativa ${job.attempts + 1}.`,
            });

            await this.transcoder.transcode(
                job.temporaryFile,
                output.playlistFile,
                output.thumbnailFile,
                (progress) => {
                    video.updateProgress(progress);

                    if (
                        video.progress < savedProgress + 5 &&
                        video.progress < 99
                    ) {
                        return;
                    }

                    savedProgress = video.progress;
                    progressWrites = progressWrites.then(() =>
                        this.videos.updateProgress(
                            video.id,
                            video.progress,
                        ),
                    );
                },
                controller.signal,
            );
            await progressWrites;
            video.markAsCompleted(output.publicPlaylistPath);
            await this.videos.save(video);
            await this.jobs.delete(video.id);
            await this.storage.deleteTemporaryFile(job.temporaryFile);
            await this.history.add({
                videoId: video.id,
                level: 'info',
                event: 'completed',
                message: 'Conversão concluída com sucesso.',
            });
            this.events.publish({
                type: 'completed',
                videoId: video.id,
                title: video.title,
            });
        } catch (error) {
            await progressWrites.catch(() => undefined);

            if (this.shuttingDown) {
                return;
            }

            const stopAction = this.stopActions.get(video.id);

            if (stopAction) {
                await this.jobs.updateState(video.id, stopAction);
                stopAction === 'pausado'
                    ? video.markAsPaused()
                    : video.markAsCancelled();
                await this.videos.save(video);
                return;
            }

            const details = this.describeError(error);
            video.markAsFailed(details.summary);
            await this.videos.save(video);
            await this.jobs.updateState(video.id, 'erro');
            await this.history.add({
                videoId: video.id,
                level: 'error',
                event: 'failed',
                message: details.summary,
                details: details.details,
            });
            this.events.publish({
                type: 'failed',
                videoId: video.id,
                title: video.title,
                message: details.summary,
            });
        }
    }

    private describeError(error: unknown): {
        summary: string;
        details: string;
    } {
        const details =
            error instanceof Error ? error.stack ?? error.message : String(error);
        return {
            summary:
                details.split(/\r?\n/, 1)[0]?.trim().slice(0, 300) ||
                'Não foi possível processar o vídeo.',
            details: details.slice(0, 20_000),
        };
    }

    private async requireVideo(videoId: string): Promise<Video> {
        const video = await this.videos.findById(videoId);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        return video;
    }

    private async requireJob(videoId: string): Promise<VideoJob> {
        const job = await this.jobs.find(videoId);

        if (!job) {
            throw new EntityNotFoundError(
                'Este vídeo não possui uma conversão controlável.',
            );
        }

        return job;
    }
}
