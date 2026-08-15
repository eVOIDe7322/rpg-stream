import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import {
    ProcessingHistoryEntry,
    ProcessingHistoryLevel,
    ProcessingHistoryRepository,
} from '../../application/ports/processing-history-repository.js';

interface HistoryRow {
    readonly id: number;
    readonly video_id: string;
    readonly nivel: ProcessingHistoryLevel;
    readonly evento: string;
    readonly mensagem: string;
    readonly detalhes: string | null;
    readonly criado_em: string;
}

export class SqliteProcessingHistoryRepository
    implements ProcessingHistoryRepository
{
    constructor(private readonly database: SqliteDatabase) {}

    async add(input: {
        videoId: string;
        level: ProcessingHistoryLevel;
        event: string;
        message: string;
        details?: string | null;
    }): Promise<void> {
        await this.database.execute(
            `INSERT INTO video_processing_history
                (video_id, nivel, evento, mensagem, detalhes, criado_em)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                input.videoId,
                input.level,
                input.event,
                input.message,
                input.details ?? null,
                new Date().toISOString(),
            ],
        );
    }

    async list(videoId: string): Promise<ProcessingHistoryEntry[]> {
        const rows = await this.database.all<HistoryRow>(
            `SELECT *
             FROM video_processing_history
             WHERE video_id = ?
             ORDER BY criado_em DESC, id DESC`,
            [videoId],
        );
        return rows.map((row) => ({
            id: row.id,
            videoId: row.video_id,
            level: row.nivel,
            event: row.evento,
            message: row.mensagem,
            details: row.detalhes,
            createdAt: row.criado_em,
        }));
    }
}
