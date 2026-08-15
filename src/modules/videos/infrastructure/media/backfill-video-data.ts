import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { VideoRepository } from '../../domain/video-repository.js';
import { FfmpegVideoTranscoder } from './ffmpeg-video-transcoder.js';

async function fileExists(file: string): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

async function calculateDirectorySize(directory: string): Promise<number> {
    const entries = await readdir(directory, { withFileTypes: true });
    let total = 0;

    for (const entry of entries) {
        if (entry.isFile()) {
            total += (await stat(path.join(directory, entry.name))).size;
        }
    }

    return total;
}

export async function backfillVideoData(
    uploadsDirectory: string,
    transcoder: FfmpegVideoTranscoder,
    videos: VideoRepository,
): Promise<void> {
    const missingMetadata = new Set(
        await videos.findIdsMissingMetadata(),
    );
    const entries = await readdir(uploadsDirectory, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const videoDirectory = path.join(uploadsDirectory, entry.name);
        const playlistFile = path.join(videoDirectory, 'playlist.m3u8');
        const thumbnailFile = path.join(videoDirectory, 'thumbnail.jpg');

        if (!(await fileExists(playlistFile))) {
            continue;
        }

        if (!(await fileExists(thumbnailFile))) {
            try {
                await transcoder.generateThumbnail(
                    playlistFile,
                    thumbnailFile,
                );
                console.log(`Capa gerada para o vídeo ${entry.name}.`);
            } catch (error) {
                console.error(
                    `Não foi possível gerar a capa do vídeo ${entry.name}:`,
                    error,
                );
            }
        }

        if (missingMetadata.has(entry.name)) {
            try {
                const [metadata, sizeBytes] = await Promise.all([
                    transcoder.inspect(playlistFile),
                    calculateDirectorySize(videoDirectory),
                ]);
                await videos.updateMetadata(entry.name, {
                    ...metadata,
                    sizeBytes,
                });
                console.log(`Metadados recuperados para o vídeo ${entry.name}.`);
            } catch (error) {
                console.error(
                    `Não foi possível recuperar os metadados do vídeo ${entry.name}:`,
                    error,
                );
            }
        }
    }
}
