import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export interface TemporaryCleanupResult {
    readonly filesRemoved: number;
    readonly bytesRemoved: number;
    readonly filesSkipped: number;
}

export async function cleanupTemporaryFiles(
    directory: string,
    maximumAgeMilliseconds: number,
    protectedFiles: ReadonlySet<string> = new Set(),
): Promise<TemporaryCleanupResult> {
    const cutoff = Date.now() - maximumAgeMilliseconds;
    const entries = await readdir(directory, { withFileTypes: true });
    let filesRemoved = 0;
    let bytesRemoved = 0;
    let filesSkipped = 0;

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const file = path.join(directory, entry.name);

        if (protectedFiles.has(path.resolve(file))) {
            continue;
        }

        const information = await stat(file);

        if (information.mtimeMs >= cutoff) {
            continue;
        }

        try {
            await rm(file);
            filesRemoved += 1;
            bytesRemoved += information.size;
        } catch {
            filesSkipped += 1;
        }
    }

    return { filesRemoved, bytesRemoved, filesSkipped };
}
