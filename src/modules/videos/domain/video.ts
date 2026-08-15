import { DomainValidationError } from '../../../shared/domain/errors.js';

export type VideoStatus =
    | 'aguardando'
    | 'processando'
    | 'pausado'
    | 'cancelado'
    | 'concluido'
    | 'erro';

export interface VideoMediaMetadata {
    readonly durationSeconds: number;
    readonly width: number;
    readonly height: number;
    readonly sizeBytes: number;
}

export interface RestoreVideoProperties {
    readonly id: string;
    readonly title: string;
    readonly playlistPath: string | null;
    readonly categoryId: number | null;
    readonly uploadedAt: string;
    readonly status: VideoStatus;
    readonly progress: number;
    readonly durationSeconds: number | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly sizeBytes: number | null;
    readonly errorMessage: string | null;
}

export interface UpdateVideoProperties {
    readonly title?: string;
    readonly categoryId?: number | null;
}

export class Video {
    private constructor(
        public readonly id: string,
        private videoTitle: string,
        private videoPlaylistPath: string | null,
        private videoCategoryId: number | null,
        public readonly uploadedAt: string,
        private videoStatus: VideoStatus,
        private videoProgress: number,
        private videoDurationSeconds: number | null,
        private videoWidth: number | null,
        private videoHeight: number | null,
        private videoSizeBytes: number | null,
        private videoErrorMessage: string | null,
    ) {}

    static createProcessing(
        id: string,
        title: string,
        categoryId: number | null,
        metadata: VideoMediaMetadata,
    ): Video {
        return new Video(
            id,
            Video.normalizeTitle(title),
            null,
            Video.normalizeCategoryId(categoryId),
            new Date().toISOString(),
            'processando',
            0,
            metadata.durationSeconds,
            metadata.width,
            metadata.height,
            metadata.sizeBytes,
            null,
        );
    }

    static createQueued(
        id: string,
        title: string,
        categoryId: number | null,
        metadata: VideoMediaMetadata,
    ): Video {
        const video = Video.createProcessing(
            id,
            title,
            categoryId,
            metadata,
        );
        video.markAsQueued();
        return video;
    }

    static restore(properties: RestoreVideoProperties): Video {
        return new Video(
            properties.id,
            properties.title,
            properties.playlistPath,
            properties.categoryId,
            properties.uploadedAt,
            properties.status,
            properties.progress,
            properties.durationSeconds,
            properties.width,
            properties.height,
            properties.sizeBytes,
            properties.errorMessage,
        );
    }

    get title(): string {
        return this.videoTitle;
    }

    get playlistPath(): string | null {
        return this.videoPlaylistPath;
    }

    get categoryId(): number | null {
        return this.videoCategoryId;
    }

    get status(): VideoStatus {
        return this.videoStatus;
    }

    get progress(): number {
        return this.videoProgress;
    }

    get durationSeconds(): number | null {
        return this.videoDurationSeconds;
    }

    get width(): number | null {
        return this.videoWidth;
    }

    get height(): number | null {
        return this.videoHeight;
    }

    get sizeBytes(): number | null {
        return this.videoSizeBytes;
    }

    get errorMessage(): string | null {
        return this.videoErrorMessage;
    }

    update(properties: UpdateVideoProperties): void {
        if (properties.title !== undefined) {
            this.videoTitle = Video.normalizeTitle(properties.title);
        }

        if (properties.categoryId !== undefined) {
            this.videoCategoryId = Video.normalizeCategoryId(
                properties.categoryId,
            );
        }
    }

    markAsCompleted(playlistPath: string): void {
        this.videoPlaylistPath = playlistPath;
        this.videoStatus = 'concluido';
        this.videoProgress = 100;
        this.videoErrorMessage = null;
    }

    markAsQueued(): void {
        this.videoStatus = 'aguardando';
        this.videoProgress = 0;
        this.videoErrorMessage = null;
    }

    markAsProcessing(): void {
        this.videoStatus = 'processando';
        this.videoProgress = 0;
        this.videoErrorMessage = null;
    }

    markAsPaused(): void {
        this.videoStatus = 'pausado';
    }

    markAsCancelled(): void {
        this.videoStatus = 'cancelado';
    }

    updateProgress(progress: number): void {
        if (this.videoStatus !== 'processando' || !Number.isFinite(progress)) {
            return;
        }

        this.videoProgress = Math.max(
            this.videoProgress,
            Math.min(99, Math.round(progress)),
        );
    }

    markAsFailed(message: string): void {
        this.videoStatus = 'erro';
        this.videoErrorMessage = message.trim().slice(0, 300);
    }

    private static normalizeTitle(title: string): string {
        const normalizedTitle =
            typeof title === 'string' ? title.trim() : '';

        if (!normalizedTitle) {
            throw new DomainValidationError(
                'Título do vídeo é obrigatório.',
            );
        }

        return normalizedTitle;
    }

    private static normalizeCategoryId(
        categoryId: number | null,
    ): number | null {
        if (categoryId === null) {
            return null;
        }

        if (!Number.isInteger(categoryId) || categoryId < 1) {
            throw new DomainValidationError('Categoria inválida.');
        }

        return categoryId;
    }
}
