import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import {
    VideoJob,
    VideoJobRepository,
    VideoJobState,
} from '../../application/ports/video-job-repository.js';

interface VideoJobRow {
    readonly video_id: string;
    readonly arquivo_temporario: string;
    readonly estado: VideoJobState;
    readonly tentativas: number;
    readonly criado_em: string;
    readonly atualizado_em: string;
}

function mapJob(row: VideoJobRow): VideoJob {
    return {
        videoId: row.video_id,
        temporaryFile: row.arquivo_temporario,
        state: row.estado,
        attempts: row.tentativas,
        createdAt: row.criado_em,
        updatedAt: row.atualizado_em,
    };
}

export class SqliteVideoJobRepository implements VideoJobRepository {
    constructor(private readonly database: SqliteDatabase) {}

    async add(videoId: string, temporaryFile: string): Promise<void> {
        const now = new Date().toISOString();
        await this.database.execute(
            `INSERT INTO video_jobs
                (video_id, arquivo_temporario, estado, tentativas, criado_em, atualizado_em)
             VALUES (?, ?, 'aguardando', 0, ?, ?)`,
            [videoId, temporaryFile, now, now],
        );
    }

    async find(videoId: string): Promise<VideoJob | null> {
        const row = await this.database.get<VideoJobRow>(
            `SELECT * FROM video_jobs WHERE video_id = ?`,
            [videoId],
        );
        return row ? mapJob(row) : null;
    }

    async findByStates(
        states: readonly VideoJobState[],
    ): Promise<VideoJob[]> {
        if (states.length === 0) {
            return [];
        }

        const placeholders = states.map(() => '?').join(', ');
        const rows = await this.database.all<VideoJobRow>(
            `SELECT *
             FROM video_jobs
             WHERE estado IN (${placeholders})
             ORDER BY criado_em`,
            states,
        );
        return rows.map(mapJob);
    }

    async updateState(
        videoId: string,
        state: VideoJobState,
    ): Promise<void> {
        await this.database.execute(
            `UPDATE video_jobs
             SET estado = ?, atualizado_em = ?
             WHERE video_id = ?`,
            [state, new Date().toISOString(), videoId],
        );
    }

    async startAttempt(videoId: string): Promise<void> {
        await this.database.execute(
            `UPDATE video_jobs
             SET estado = 'processando',
                 tentativas = tentativas + 1,
                 atualizado_em = ?
             WHERE video_id = ?`,
            [new Date().toISOString(), videoId],
        );
    }

    async delete(videoId: string): Promise<void> {
        await this.database.execute(
            'DELETE FROM video_jobs WHERE video_id = ?',
            [videoId],
        );
    }

    async findProtectedTemporaryFiles(): Promise<string[]> {
        const rows = await this.database.all<{
            readonly arquivo_temporario: string;
        }>(
            `SELECT arquivo_temporario
             FROM video_jobs
             WHERE estado IN ('aguardando', 'processando', 'pausado', 'cancelado', 'erro')`,
        );
        return rows.map((row) => row.arquivo_temporario);
    }
}
