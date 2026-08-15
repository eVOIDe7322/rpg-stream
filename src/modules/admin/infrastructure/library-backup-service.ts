import {
    access,
    mkdir,
    readFile,
    rename,
    rm,
    statfs,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import { SqliteDatabase } from '../../../shared/infrastructure/database/sqlite-database.js';
import { DomainValidationError } from '../../../shared/domain/errors.js';

async function exists(target: string): Promise<boolean> {
    try {
        await access(target);
        return true;
    } catch {
        return false;
    }
}

export async function applyPendingRestore(input: {
    databaseFile: string;
    uploadsDirectory: string;
    backupDirectory: string;
}): Promise<boolean> {
    const pending = path.join(input.backupDirectory, 'pending');
    const ready = path.join(pending, 'READY');

    if (!(await exists(ready))) {
        return false;
    }

    const restoredDatabase = path.join(pending, 'database.db');
    const restoredVideos = path.join(pending, 'videos_data');

    if (
        !(await exists(restoredDatabase)) ||
        !(await exists(restoredVideos))
    ) {
        throw new Error('O pacote de restauração pendente está incompleto.');
    }

    const rollback = path.join(
        input.backupDirectory,
        `rollback-${Date.now()}`,
    );
    const rollbackDatabase = path.join(rollback, 'database.db');
    const rollbackVideos = path.join(rollback, 'videos_data');
    await mkdir(rollback, { recursive: true });

    try {
        if (await exists(input.databaseFile)) {
            await rename(input.databaseFile, rollbackDatabase);
        }

        if (await exists(input.uploadsDirectory)) {
            await rename(input.uploadsDirectory, rollbackVideos);
        }

        await rename(restoredDatabase, input.databaseFile);
        await rename(restoredVideos, input.uploadsDirectory);
        await rm(pending, { recursive: true, force: true });
        console.log(`Biblioteca restaurada. Cópia anterior: ${rollback}`);
        return true;
    } catch (error) {
        await rm(input.databaseFile, { force: true });
        await rm(input.uploadsDirectory, { recursive: true, force: true });

        if (await exists(rollbackDatabase)) {
            await rename(rollbackDatabase, input.databaseFile);
        }

        if (await exists(rollbackVideos)) {
            await rename(rollbackVideos, input.uploadsDirectory);
        }

        throw error;
    }
}

export class LibraryBackupService {
    constructor(
        private readonly database: SqliteDatabase,
        private readonly databaseFile: string,
        private readonly uploadsDirectory: string,
        private readonly backupDirectory: string,
    ) {}

    async streamBackup(response: Response): Promise<void> {
        await mkdir(this.backupDirectory, { recursive: true });
        const snapshot = path.join(
            this.backupDirectory,
            `snapshot-${randomUUID()}.db`,
        );
        const escapedSnapshot = snapshot.replaceAll("'", "''");
        await this.database.execute(`VACUUM INTO '${escapedSnapshot}'`);

        response.attachment(
            `rpgstream-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        );
        response.type('application/zip');
        const archive = new ZipArchive({ store: true });

        archive.once('error', (error: Error) => {
            response.destroy(error);
        });
        archive.once('end', () => {
            void rm(snapshot, { force: true });
        });
        response.once('close', () => {
            void rm(snapshot, { force: true });
        });
        archive.pipe(response);
        archive.append(
            JSON.stringify(
                {
                    format: 'rpgstream-backup',
                    version: 1,
                    createdAt: new Date().toISOString(),
                },
                null,
                2,
            ),
            { name: 'manifest.json' },
        );
        archive.file(snapshot, { name: 'database.db' });
        archive.directory(this.uploadsDirectory, 'videos_data');
        await archive.finalize();
    }

    async prepareRestore(zipFile: string): Promise<void> {
        await mkdir(this.backupDirectory, { recursive: true });
        const staging = path.join(
            this.backupDirectory,
            `restore-${randomUUID()}`,
        );
        const pending = path.join(this.backupDirectory, 'pending');

        try {
            const archive = await unzipper.Open.file(zipFile);

            if (archive.files.length > 1_000_000) {
                throw new DomainValidationError(
                    'O backup possui arquivos demais.',
                );
            }

            let uncompressedBytes = 0;

            for (const entry of archive.files) {
                const normalized = entry.path.replaceAll('\\', '/');
                const segments = normalized.split('/');

                if (
                    path.posix.isAbsolute(normalized) ||
                    segments.includes('..') ||
                    normalized.includes('\0') ||
                    (entry.type !== 'File' && entry.type !== 'Directory')
                ) {
                    throw new DomainValidationError(
                        'O backup contém um caminho inseguro.',
                    );
                }

                uncompressedBytes += entry.uncompressedSize;
            }

            const disk = await statfs(this.backupDirectory);
            const availableBytes = disk.bavail * disk.bsize;

            if (uncompressedBytes > availableBytes * 0.9) {
                throw new DomainValidationError(
                    'Não há espaço suficiente para extrair este backup.',
                );
            }

            await archive.extract({ path: staging });
            const manifestFile = path.join(staging, 'manifest.json');
            const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));

            if (
                manifest.format !== 'rpgstream-backup' ||
                manifest.version !== 1 ||
                !(await exists(path.join(staging, 'database.db'))) ||
                !(await exists(path.join(staging, 'videos_data')))
            ) {
                throw new DomainValidationError(
                    'O arquivo não é um backup RPGStream válido.',
                );
            }

            await rm(pending, { recursive: true, force: true });
            await rename(staging, pending);
            await writeFile(path.join(pending, 'READY'), 'ready');
        } finally {
            await rm(zipFile, { force: true });
            await rm(staging, { recursive: true, force: true });
        }
    }
}
