import ffmpeg from 'fluent-ffmpeg';
import { VideoTranscoder } from '../../application/ports/video-transcoder.js';
import { VideoMediaMetadata } from '../../domain/video.js';

function describeFfmpegFailure(
    error: Error,
    stdout?: string | null,
    stderr?: string | null,
): Error {
    const sections = [error.message];

    if (stderr?.trim()) {
        sections.push(`FFmpeg (stderr):\n${stderr.trim()}`);
    }

    if (stdout?.trim()) {
        sections.push(`FFmpeg (stdout):\n${stdout.trim()}`);
    }

    const detailed = new Error(sections.join('\n\n'));
    detailed.name = error.name;
    return detailed;
}

export class FfmpegVideoTranscoder implements VideoTranscoder {
    inspect(inputFile: string): Promise<VideoMediaMetadata> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputFile, (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }

                const videoStream = data.streams.find(
                    (stream) => stream.codec_type === 'video',
                );
                const durationSeconds = Number(
                    data.format.duration ?? videoStream?.duration,
                );
                const width = Number(videoStream?.width);
                const height = Number(videoStream?.height);
                const sizeBytes = Number(data.format.size ?? 0);

                if (
                    !videoStream ||
                    !Number.isFinite(durationSeconds) ||
                    durationSeconds <= 0 ||
                    !Number.isInteger(width) ||
                    width <= 0 ||
                    !Number.isInteger(height) ||
                    height <= 0
                ) {
                    reject(new Error('O arquivo não contém um vídeo válido.'));
                    return;
                }

                resolve({
                    durationSeconds,
                    width,
                    height,
                    sizeBytes: Number.isFinite(sizeBytes)
                        ? Math.max(0, sizeBytes)
                        : 0,
                });
            });
        });
    }

    async transcode(
        inputFile: string,
        outputPlaylist: string,
        outputThumbnail: string,
        onProgress?: (progress: number) => void,
        signal?: AbortSignal,
    ): Promise<void> {
        signal?.throwIfAborted();
        await this.generateThumbnail(
            inputFile,
            outputThumbnail,
            undefined,
            signal,
        );
        signal?.throwIfAborted();
        await this.transcodeToHls(
            inputFile,
            outputPlaylist,
            onProgress,
            signal,
        );
    }

    async generateThumbnail(
        inputFile: string,
        outputThumbnail: string,
        timestampSeconds?: number,
        signal?: AbortSignal,
    ): Promise<void> {
        const metadata = await this.inspect(inputFile);
        const timestamp = Math.max(
            0,
            timestampSeconds ?? metadata.durationSeconds * 0.1,
        );

        return new Promise((resolve, reject) => {
            const command = ffmpeg(inputFile)
                .seekInput(timestamp)
                .videoFilters([
                    'scale=640:360:force_original_aspect_ratio=decrease',
                    'pad=640:360:(ow-iw)/2:(oh-ih)/2',
                ])
                .outputOptions([
                    '-frames:v 1',
                    '-update 1',
                    '-q:v 3',
                ])
                .output(outputThumbnail);
            const onAbort = () => command.kill('SIGKILL');
            signal?.addEventListener('abort', onAbort, { once: true });
            command
                .once('end', () => {
                    signal?.removeEventListener('abort', onAbort);
                    resolve();
                })
                .once('error', (error, stdout, stderr) => {
                    signal?.removeEventListener('abort', onAbort);
                    reject(describeFfmpegFailure(error, stdout, stderr));
                })
                .run();
        });
    }

    private transcodeToHls(
        inputFile: string,
        outputPlaylist: string,
        onProgress?: (progress: number) => void,
        signal?: AbortSignal,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg(inputFile)
                .videoFilters([
                    'scale=1280:720:force_original_aspect_ratio=decrease',
                    'pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                ])
                .outputOptions([
                    '-c:v libx264',
                    '-b:v 1800k',
                    '-maxrate 2000k',
                    '-bufsize 4000k',
                    '-c:a aac',
                    '-b:a 128k',
                    '-keyint_min 48',
                    '-g 48',
                    '-sc_threshold 0',
                    '-preset veryfast',
                    '-threads 0',
                    '-f hls',
                    '-hls_time 6',
                    '-hls_list_size 0',
                    '-hls_playlist_type vod',
                    '-hls_flags independent_segments',
                ])
                .output(outputPlaylist)
                .on('progress', (progress) => {
                    const percent = Number(progress.percent);

                    if (Number.isFinite(percent)) {
                        onProgress?.(percent);
                    }
                })
                .once('end', () => {
                    signal?.removeEventListener('abort', onAbort);
                    resolve();
                })
                .once('error', (error, stdout, stderr) => {
                    signal?.removeEventListener('abort', onAbort);
                    reject(describeFfmpegFailure(error, stdout, stderr));
                });
            const onAbort = () => command.kill('SIGKILL');
            signal?.addEventListener('abort', onAbort, { once: true });
            command.run();
        });
    }
}
