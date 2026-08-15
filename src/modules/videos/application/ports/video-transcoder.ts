import { VideoMediaMetadata } from '../../domain/video.js';

export type VideoProgressCallback = (progress: number) => void;

export interface VideoTranscoder {
    inspect(inputFile: string): Promise<VideoMediaMetadata>;
    generateThumbnail(
        inputFile: string,
        outputThumbnail: string,
        timestampSeconds?: number,
        signal?: AbortSignal,
    ): Promise<void>;
    transcode(
        inputFile: string,
        outputPlaylist: string,
        outputThumbnail: string,
        onProgress?: VideoProgressCallback,
        signal?: AbortSignal,
    ): Promise<void>;
}
