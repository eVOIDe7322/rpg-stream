export interface VideoOutput {
    readonly directory: string;
    readonly playlistFile: string;
    readonly thumbnailFile: string;
    readonly thumbnailDraftFile: string;
    readonly publicPlaylistPath: string;
}

export interface VideoStorage {
    prepareOutput(videoId: string): Promise<VideoOutput>;
    getOutput(videoId: string): VideoOutput;
    replaceThumbnail(
        temporaryThumbnail: string,
        thumbnail: string,
    ): Promise<void>;
    deleteVideo(videoId: string): Promise<boolean>;
    deleteTemporaryFile(file: string): Promise<void>;
    getAvailableBytes(): Promise<number>;
    getStorageStats(): Promise<{
        readonly totalBytes: number;
        readonly availableBytes: number;
    }>;
    resetOutput(videoId: string): Promise<VideoOutput>;
    temporaryFileExists(file: string): Promise<boolean>;
    moveToTrash(videoId: string): Promise<boolean>;
    restoreFromTrash(videoId: string): Promise<boolean>;
    purgeVideo(videoId: string): Promise<boolean>;
}
