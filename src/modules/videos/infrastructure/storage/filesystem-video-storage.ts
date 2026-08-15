import path from 'node:path';
import {
    access,
    mkdir,
    rename,
    rm,
    statfs,
} from 'node:fs/promises';
import {
    VideoOutput,
    VideoStorage,
} from '../../application/ports/video-storage.js';

export class FilesystemVideoStorage implements VideoStorage {
    constructor(
        private readonly uploadsDirectory: string,
        private readonly trashDirectory = path.join(
            uploadsDirectory,
            '.trash',
        ),
    ) {}

    private resolveDirectory(root: string, videoId: string): string {
        const normalizedRoot = path.resolve(root);
        const directory = path.resolve(normalizedRoot, videoId);

        if (path.dirname(directory) !== normalizedRoot) {
            throw new Error('Identificador de vídeo inválido.');
        }

        return directory;
    }

    async prepareOutput(videoId: string): Promise<VideoOutput> {
        const directory = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );
        await mkdir(directory);

        return this.getOutput(videoId);
    }

    getOutput(videoId: string): VideoOutput {
        const directory = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );

        return {
            directory,
            playlistFile: path.join(directory, 'playlist.m3u8'),
            thumbnailFile: path.join(directory, 'thumbnail.jpg'),
            thumbnailDraftFile: path.join(
                directory,
                'thumbnail.next.jpg',
            ),
            publicPlaylistPath: `/videos/${videoId}/playlist.m3u8`,
        };
    }

    async replaceThumbnail(
        temporaryThumbnail: string,
        thumbnail: string,
    ): Promise<void> {
        await rm(thumbnail, { force: true });
        await rename(temporaryThumbnail, thumbnail);
    }

    async deleteVideo(videoId: string): Promise<boolean> {
        const directory = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );

        try {
            await rm(directory, { recursive: true });
            return true;
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT'
            ) {
                return false;
            }

            throw error;
        }
    }

    async deleteTemporaryFile(file: string): Promise<void> {
        await rm(file, { force: true });
    }

    async getAvailableBytes(): Promise<number> {
        return (await this.getStorageStats()).availableBytes;
    }

    async getStorageStats(): Promise<{
        totalBytes: number;
        availableBytes: number;
    }> {
        const statistics = await statfs(this.uploadsDirectory);
        return {
            totalBytes: statistics.blocks * statistics.bsize,
            availableBytes: statistics.bavail * statistics.bsize,
        };
    }

    async resetOutput(videoId: string): Promise<VideoOutput> {
        const directory = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
        return this.getOutput(videoId);
    }

    async temporaryFileExists(file: string): Promise<boolean> {
        try {
            await access(file);
            return true;
        } catch {
            return false;
        }
    }

    async moveToTrash(videoId: string): Promise<boolean> {
        const source = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );
        const destination = this.resolveDirectory(
            this.trashDirectory,
            videoId,
        );

        if (!(await this.temporaryFileExists(source))) {
            return false;
        }

        await mkdir(this.trashDirectory, { recursive: true });
        await rm(destination, { recursive: true, force: true });
        await rename(source, destination);
        return true;
    }

    async restoreFromTrash(videoId: string): Promise<boolean> {
        const source = this.resolveDirectory(this.trashDirectory, videoId);
        const destination = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );

        if (!(await this.temporaryFileExists(source))) {
            return false;
        }

        await rm(destination, { recursive: true, force: true });
        await rename(source, destination);
        return true;
    }

    async purgeVideo(videoId: string): Promise<boolean> {
        const activeDirectory = this.resolveDirectory(
            this.uploadsDirectory,
            videoId,
        );
        const trashedDirectory = this.resolveDirectory(
            this.trashDirectory,
            videoId,
        );
        const existed =
            (await this.temporaryFileExists(activeDirectory)) ||
            (await this.temporaryFileExists(trashedDirectory));
        await rm(activeDirectory, { recursive: true, force: true });
        await rm(trashedDirectory, { recursive: true, force: true });
        return existed;
    }
}
