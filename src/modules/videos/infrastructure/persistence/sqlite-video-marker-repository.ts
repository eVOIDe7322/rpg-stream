import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import {
    VideoMarker,
    VideoMarkerRepository,
} from '../../application/ports/video-marker-repository.js';

interface MarkerRow {
    readonly id: number;
    readonly video_id: string;
    readonly titulo: string;
    readonly tempo_segundos: number;
    readonly criado_por: number | null;
    readonly criado_em: string;
}

function mapMarker(row: MarkerRow): VideoMarker {
    return {
        id: row.id,
        videoId: row.video_id,
        title: row.titulo,
        timeSeconds: row.tempo_segundos,
        createdBy: row.criado_por,
        createdAt: row.criado_em,
    };
}

export class SqliteVideoMarkerRepository
    implements VideoMarkerRepository
{
    constructor(private readonly database: SqliteDatabase) {}

    async add(input: {
        videoId: string;
        title: string;
        timeSeconds: number;
        createdBy: number | null;
    }): Promise<VideoMarker> {
        const createdAt = new Date().toISOString();
        const result = await this.database.execute(
            `INSERT INTO video_markers
                (video_id, titulo, tempo_segundos, criado_por, criado_em)
             VALUES (?, ?, ?, ?, ?)`,
            [
                input.videoId,
                input.title,
                input.timeSeconds,
                input.createdBy,
                createdAt,
            ],
        );
        return {
            id: result.lastID,
            videoId: input.videoId,
            title: input.title,
            timeSeconds: input.timeSeconds,
            createdBy: input.createdBy,
            createdAt,
        };
    }

    async list(videoId: string): Promise<VideoMarker[]> {
        const rows = await this.database.all<MarkerRow>(
            `SELECT *
             FROM video_markers
             WHERE video_id = ?
             ORDER BY tempo_segundos, id`,
            [videoId],
        );
        return rows.map(mapMarker);
    }

    async delete(id: number, videoId: string): Promise<boolean> {
        const result = await this.database.execute(
            `DELETE FROM video_markers
             WHERE id = ? AND video_id = ?`,
            [id, videoId],
        );
        return result.changes > 0;
    }
}
