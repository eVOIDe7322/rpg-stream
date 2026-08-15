import { Video, VideoMediaMetadata } from './video.js';

export interface VideoRepository {
    add(video: Video): Promise<void>;
    findById(id: string): Promise<Video | null>;
    save(video: Video): Promise<void>;
    updateProgress(id: string, progress: number): Promise<void>;
    updateMetadata(id: string, metadata: VideoMediaMetadata): Promise<void>;
    findIdsMissingMetadata(): Promise<string[]>;
    delete(id: string): Promise<boolean>;
    failInterrupted(message: string): Promise<number>;
    markDeleted(
        id: string,
        deletedAt: string,
        purgeAfter: string,
    ): Promise<boolean>;
    restoreDeleted(id: string): Promise<boolean>;
    findDeleted(): Promise<readonly TrashedVideo[]>;
    findExpiredDeleted(now: string): Promise<readonly string[]>;
}

export interface TrashedVideo {
    readonly id: string;
    readonly title: string;
    readonly deletedAt: string;
    readonly purgeAfter: string;
    readonly sizeBytes: number | null;
}
