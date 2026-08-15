import { randomUUID } from 'node:crypto';
import {
    DomainValidationError,
    EntityNotFoundError,
} from '../../../shared/domain/errors.js';
import { VideoRepository } from '../domain/video-repository.js';
import { Video } from '../domain/video.js';
import {
    VideoDetails,
    VideoListItem,
    VideoQuery,
} from './ports/video-query.js';
import { VideoStorage } from './ports/video-storage.js';
import { VideoTranscoder } from './ports/video-transcoder.js';
import { VideoJobRepository } from './ports/video-job-repository.js';
import { ProcessingHistoryRepository } from './ports/processing-history-repository.js';
import { VideoMarkerRepository } from './ports/video-marker-repository.js';
import { VideoProcessingQueue } from './video-processing-queue.js';

export class ListVideos {
    constructor(private readonly videos: VideoQuery) {}

    execute(categoryId?: number): Promise<VideoListItem[]> {
        return this.videos.findAll(categoryId);
    }
}

export class GetVideoDetails {
    constructor(private readonly videos: VideoQuery) {}

    async execute(id: string): Promise<VideoDetails> {
        const video = await this.videos.findDetails(id);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        return video;
    }
}

export class UpdateVideo {
    constructor(private readonly videos: VideoRepository) {}

    async execute(
        id: string,
        changes: { title?: string; categoryId?: number | null },
    ): Promise<void> {
        const video = await this.videos.findById(id);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        video.update(changes);
        await this.videos.save(video);
    }
}

export class UpdateVideoThumbnail {
    constructor(
        private readonly videos: VideoRepository,
        private readonly storage: VideoStorage,
        private readonly transcoder: VideoTranscoder,
    ) {}

    async execute(id: string, timestampSeconds: number): Promise<void> {
        if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
            throw new DomainValidationError(
                'O momento escolhido para a capa é inválido.',
            );
        }

        const video = await this.videos.findById(id);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        if (video.status !== 'concluido' || !video.playlistPath) {
            throw new DomainValidationError(
                'A capa só pode ser alterada após o processamento.',
            );
        }

        if (
            video.durationSeconds !== null &&
            timestampSeconds >= video.durationSeconds
        ) {
            throw new DomainValidationError(
                'O momento escolhido ultrapassa a duração do vídeo.',
            );
        }

        const output = this.storage.getOutput(id);
        await this.storage.deleteTemporaryFile(output.thumbnailDraftFile);

        try {
            await this.transcoder.generateThumbnail(
                output.playlistFile,
                output.thumbnailDraftFile,
                timestampSeconds,
            );
            await this.storage.replaceThumbnail(
                output.thumbnailDraftFile,
                output.thumbnailFile,
            );
        } catch (error) {
            await this.storage.deleteTemporaryFile(
                output.thumbnailDraftFile,
            );
            throw error;
        }
    }
}

export class DeleteVideo {
    constructor(
        private readonly videos: VideoRepository,
        private readonly storage: VideoStorage,
        private readonly jobs: VideoJobRepository,
        private readonly queue: VideoProcessingQueue,
        private readonly retentionDays: number,
    ) {}

    async execute(id: string): Promise<{ filesRemoved: boolean }> {
        const video = await this.videos.findById(id);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        const job = await this.jobs.find(id);

        if (job) {
            await this.queue.cancel(id);
            await this.storage.deleteTemporaryFile(job.temporaryFile);
            await this.jobs.delete(id);
        }

        const deletedAt = new Date();
        const purgeAfter = new Date(
            deletedAt.getTime() + this.retentionDays * 24 * 60 * 60 * 1000,
        );
        const filesRemoved = await this.storage.moveToTrash(id);

        try {
            const marked = await this.videos.markDeleted(
                id,
                deletedAt.toISOString(),
                purgeAfter.toISOString(),
            );

            if (!marked) {
                throw new EntityNotFoundError(
                    'Vídeo não encontrado ou já está na lixeira.',
                );
            }
        } catch (error) {
            if (filesRemoved) {
                await this.storage.restoreFromTrash(id);
            }

            throw error;
        }

        return { filesRemoved };
    }
}

export class ListTrash {
    constructor(private readonly videos: VideoRepository) {}

    execute() {
        return this.videos.findDeleted();
    }
}

export class RestoreVideoFromTrash {
    constructor(
        private readonly videos: VideoRepository,
        private readonly storage: VideoStorage,
    ) {}

    async execute(id: string): Promise<void> {
        const deleted = (await this.videos.findDeleted()).some(
            (video) => video.id === id,
        );

        if (!deleted) {
            throw new EntityNotFoundError('Vídeo não encontrado na lixeira.');
        }

        const restoredFiles = await this.storage.restoreFromTrash(id);

        if (!restoredFiles) {
            throw new Error('Os arquivos do vídeo não existem mais na lixeira.');
        }

        try {
            const restoredRecord = await this.videos.restoreDeleted(id);

            if (!restoredRecord) {
                throw new EntityNotFoundError(
                    'Vídeo não encontrado na lixeira.',
                );
            }
        } catch (error) {
            await this.storage.moveToTrash(id);
            throw error;
        }
    }
}

export class PurgeVideo {
    constructor(
        private readonly videos: VideoRepository,
        private readonly storage: VideoStorage,
    ) {}

    async execute(id: string): Promise<void> {
        const deleted = (await this.videos.findDeleted()).some(
            (video) => video.id === id,
        );

        if (!deleted) {
            throw new EntityNotFoundError('Vídeo não encontrado na lixeira.');
        }

        await this.storage.purgeVideo(id);
        await this.videos.delete(id);
    }

    async purgeExpired(): Promise<number> {
        const ids = await this.videos.findExpiredDeleted(
            new Date().toISOString(),
        );

        for (const id of ids) {
            await this.storage.purgeVideo(id);
            await this.videos.delete(id);
        }

        return ids.length;
    }
}

export class ManageVideoMarkers {
    constructor(
        private readonly videos: VideoRepository,
        private readonly markers: VideoMarkerRepository,
    ) {}

    list(videoId: string) {
        return this.markers.list(videoId);
    }

    async add(
        videoId: string,
        title: string,
        timeSeconds: number,
        userId: number | null,
    ) {
        const video = await this.videos.findById(videoId);

        if (!video) {
            throw new EntityNotFoundError('Vídeo não encontrado.');
        }

        const normalizedTitle = String(title ?? '').trim();

        if (!normalizedTitle || normalizedTitle.length > 120) {
            throw new DomainValidationError(
                'O título do marcador deve ter entre 1 e 120 caracteres.',
            );
        }

        if (
            !Number.isFinite(timeSeconds) ||
            timeSeconds < 0 ||
            (video.durationSeconds !== null &&
                timeSeconds > video.durationSeconds)
        ) {
            throw new DomainValidationError(
                'O momento do marcador é inválido.',
            );
        }

        return this.markers.add({
            videoId,
            title: normalizedTitle,
            timeSeconds,
            createdBy: userId,
        });
    }

    async delete(videoId: string, markerId: number): Promise<void> {
        if (!(await this.markers.delete(markerId, videoId))) {
            throw new EntityNotFoundError('Marcador não encontrado.');
        }
    }
}

export class ListProcessingHistory {
    constructor(private readonly history: ProcessingHistoryRepository) {}

    execute(videoId: string) {
        return this.history.list(videoId);
    }
}

export interface UploadVideoInput {
    readonly temporaryFile: string;
    readonly title?: string;
    readonly categoryId?: string | number | null;
}

export class UploadVideo {
    private static readonly minimumFreeBytes = 512 * 1024 * 1024;

    constructor(
        private readonly videos: VideoRepository,
        private readonly storage: VideoStorage,
        private readonly transcoder: VideoTranscoder,
        private readonly jobs: VideoJobRepository,
        private readonly history: ProcessingHistoryRepository,
        private readonly queue: VideoProcessingQueue,
    ) {}

    async execute(
        input: UploadVideoInput,
    ): Promise<{ videoId: string }> {
        const videoId = randomUUID();
        let outputPrepared = false;

        try {
            const title = input.title?.trim() || `Vídeo ${videoId}`;
            const categoryId = this.parseCategoryId(input.categoryId);
            const metadata = await this.inspectVideo(input.temporaryFile);
            await this.ensureStorageCapacity(metadata.durationSeconds);
            const output = await this.storage.prepareOutput(videoId);
            outputPrepared = true;
            const video = Video.createQueued(
                videoId,
                title,
                categoryId,
                metadata,
            );

            await this.videos.add(video);
            await this.jobs.add(video.id, input.temporaryFile);
            await this.history.add({
                videoId: video.id,
                level: 'info',
                event: 'uploaded',
                message: 'Upload concluído e adicionado à fila.',
            });
            this.queue.notify();

            return { videoId };
        } catch (error) {
            if (outputPrepared) {
                await this.storage.deleteVideo(videoId);
            }
            await this.storage.deleteTemporaryFile(input.temporaryFile);
            throw error;
        }
    }

    private async inspectVideo(temporaryFile: string) {
        try {
            return await this.transcoder.inspect(temporaryFile);
        } catch {
            throw new DomainValidationError(
                'O arquivo enviado não contém um vídeo válido.',
            );
        }
    }

    private async ensureStorageCapacity(
        durationSeconds: number,
    ): Promise<void> {
        const estimatedBytes =
            Math.ceil(durationSeconds * 280_000) +
            UploadVideo.minimumFreeBytes;
        const availableBytes = await this.storage.getAvailableBytes();

        if (availableBytes < estimatedBytes) {
            throw new DomainValidationError(
                'Não há espaço livre suficiente para processar este vídeo.',
            );
        }
    }

    private parseCategoryId(
        value: string | number | null | undefined,
    ): number | null {
        if (value === undefined || value === null || value === '') {
            return null;
        }

        const categoryId = Number(value);

        if (!Number.isInteger(categoryId) || categoryId < 1) {
            throw new DomainValidationError('Categoria inválida.');
        }

        return categoryId;
    }

}
