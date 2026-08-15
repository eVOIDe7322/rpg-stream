import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export interface ApplicationConfig {
    readonly port: number;
    readonly publicHost: string;
    readonly databaseFile: string;
    readonly publicDirectory: string;
    readonly uploadsDirectory: string;
    readonly temporaryDirectory: string;
    readonly maximumUploadSize: number;
    readonly adminUsername: string | null;
    readonly adminPassword: string | null;
    readonly queueConcurrency: number;
    readonly trashRetentionDays: number;
    readonly backupDirectory: string;
    readonly tlsCertificateFile: string | null;
    readonly tlsKeyFile: string | null;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '../..');
const environmentFile = path.join(projectRoot, '.env');

function loadEnvironment(): void {
    if (existsSync(environmentFile)) {
        loadEnvFile(environmentFile);
    }
}

function readPort(value: string | undefined): number {
    const port = Number(value ?? 8080);

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('A variável PORT deve conter uma porta válida.');
    }

    return port;
}

function readPositiveInteger(
    value: string | undefined,
    fallback: number,
    name: string,
): number {
    const result = Number(value ?? fallback);

    if (!Number.isInteger(result) || result < 1) {
        throw new Error(`A variável ${name} deve ser um inteiro positivo.`);
    }

    return result;
}

function resolveOptionalFile(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized
        ? path.resolve(projectRoot, normalized)
        : null;
}

export function loadApplicationConfig(): ApplicationConfig {
    loadEnvironment();

    return {
        port: readPort(process.env.PORT),
        publicHost: process.env.PUBLIC_HOST ?? 'localhost',
        databaseFile: path.join(projectRoot, 'database.db'),
        publicDirectory: path.join(projectRoot, 'public'),
        uploadsDirectory: path.join(projectRoot, 'videos_data'),
        temporaryDirectory: path.join(projectRoot, 'temp'),
        maximumUploadSize: 40 * 1024 * 1024 * 1024,
        adminUsername:
            process.env.ADMIN_USERNAME?.trim() ||
            (process.env.ACCESS_PIN ? 'admin' : null),
        adminPassword:
            process.env.ADMIN_PASSWORD?.trim() ||
            process.env.ACCESS_PIN?.trim() ||
            null,
        queueConcurrency: readPositiveInteger(
            process.env.QUEUE_CONCURRENCY,
            1,
            'QUEUE_CONCURRENCY',
        ),
        trashRetentionDays: readPositiveInteger(
            process.env.TRASH_RETENTION_DAYS,
            30,
            'TRASH_RETENTION_DAYS',
        ),
        backupDirectory: path.join(projectRoot, 'backups'),
        tlsCertificateFile: resolveOptionalFile(process.env.TLS_CERT_FILE),
        tlsKeyFile: resolveOptionalFile(process.env.TLS_KEY_FILE),
    };
}
