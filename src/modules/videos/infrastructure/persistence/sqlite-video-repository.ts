import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import {
    VideoDetails,
    VideoListItem,
    VideoQuery,
} from '../../application/ports/video-query.js';
import {
    TrashedVideo,
    VideoRepository,
} from '../../domain/video-repository.js';
import {
    Video,
    VideoMediaMetadata,
    VideoStatus,
} from '../../domain/video.js';

interface VideoRow {
    readonly id: string;
    readonly titulo: string;
    readonly caminho_playlist: string | null;
    readonly categoria_id: number | null;
    readonly data_upload: string;
    readonly status: VideoStatus;
    readonly progresso: number;
    readonly duracao_segundos: number | null;
    readonly largura: number | null;
    readonly altura: number | null;
    readonly tamanho_bytes: number | null;
    readonly mensagem_erro: string | null;
}

function restoreVideo(row: VideoRow): Video {
    return Video.restore({
        id: row.id,
        title: row.titulo,
        playlistPath: row.caminho_playlist,
        categoryId: row.categoria_id,
        uploadedAt: row.data_upload,
        status: row.status,
        progress: row.progresso,
        durationSeconds: row.duracao_segundos,
        width: row.largura,
        height: row.altura,
        sizeBytes: row.tamanho_bytes,
        errorMessage: row.mensagem_erro,
    });
}

export class SqliteVideoRepository
    implements VideoRepository, VideoQuery
{
    constructor(private readonly database: SqliteDatabase) {}

    async add(video: Video): Promise<void> {
        await this.database.execute(
            `INSERT INTO videos
                (
                    id,
                    titulo,
                    caminho_playlist,
                    categoria_id,
                    data_upload,
                    status,
                    progresso,
                    duracao_segundos,
                    largura,
                    altura,
                    tamanho_bytes,
                    mensagem_erro
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                video.id,
                video.title,
                video.playlistPath,
                video.categoryId,
                video.uploadedAt,
                video.status,
                video.progress,
                video.durationSeconds,
                video.width,
                video.height,
                video.sizeBytes,
                video.errorMessage,
            ],
        );
    }

    async findById(id: string): Promise<Video | null> {
        const row = await this.database.get<VideoRow>(
            `SELECT
                id,
                titulo,
                caminho_playlist,
                '/videos/' || id || '/thumbnail.jpg' AS caminho_thumbnail,
                categoria_id,
                data_upload,
                status,
                progresso,
                duracao_segundos,
                largura,
                altura,
                tamanho_bytes,
                mensagem_erro
             FROM videos
             WHERE id = ?`,
            [id],
        );

        return row ? restoreVideo(row) : null;
    }

    async save(video: Video): Promise<void> {
        await this.database.execute(
            `UPDATE videos
             SET titulo = ?,
                 caminho_playlist = ?,
                 categoria_id = ?,
                 status = ?,
                 progresso = ?,
                 duracao_segundos = ?,
                 largura = ?,
                 altura = ?,
                 tamanho_bytes = ?,
                 mensagem_erro = ?
             WHERE id = ?`,
            [
                video.title,
                video.playlistPath,
                video.categoryId,
                video.status,
                video.progress,
                video.durationSeconds,
                video.width,
                video.height,
                video.sizeBytes,
                video.errorMessage,
                video.id,
            ],
        );
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.database.execute(
            'DELETE FROM videos WHERE id = ?',
            [id],
        );
        return result.changes > 0;
    }

    async updateProgress(id: string, progress: number): Promise<void> {
        await this.database.execute(
            `UPDATE videos
             SET progresso = ?
             WHERE id = ? AND status = 'processando'`,
            [progress, id],
        );
    }

    async updateMetadata(
        id: string,
        metadata: VideoMediaMetadata,
    ): Promise<void> {
        await this.database.execute(
            `UPDATE videos
             SET duracao_segundos = ?,
                 largura = ?,
                 altura = ?,
                 tamanho_bytes = ?
             WHERE id = ?`,
            [
                metadata.durationSeconds,
                metadata.width,
                metadata.height,
                metadata.sizeBytes,
                id,
            ],
        );
    }

    async findIdsMissingMetadata(): Promise<string[]> {
        const rows = await this.database.all<{ readonly id: string }>(
            `SELECT id
             FROM videos
             WHERE status = 'concluido'
               AND duracao_segundos IS NULL`,
        );
        return rows.map((row) => row.id);
    }

    async failInterrupted(message: string): Promise<number> {
        const result = await this.database.execute(
            `UPDATE videos
             SET status = 'erro', mensagem_erro = ?
             WHERE status = 'processando'`,
            [message],
        );
        return result.changes;
    }

    async markDeleted(
        id: string,
        deletedAt: string,
        purgeAfter: string,
    ): Promise<boolean> {
        const result = await this.database.execute(
            `UPDATE videos
             SET excluido_em = ?, excluir_apos = ?
             WHERE id = ? AND excluido_em IS NULL`,
            [deletedAt, purgeAfter, id],
        );
        return result.changes > 0;
    }

    async restoreDeleted(id: string): Promise<boolean> {
        const result = await this.database.execute(
            `UPDATE videos
             SET excluido_em = NULL, excluir_apos = NULL
             WHERE id = ? AND excluido_em IS NOT NULL`,
            [id],
        );
        return result.changes > 0;
    }

    async findDeleted(): Promise<readonly TrashedVideo[]> {
        return this.database.all<TrashedVideo>(
            `SELECT
                id,
                titulo AS title,
                excluido_em AS deletedAt,
                excluir_apos AS purgeAfter,
                tamanho_bytes AS sizeBytes
             FROM videos
             WHERE excluido_em IS NOT NULL
             ORDER BY excluido_em DESC`,
        );
    }

    async findExpiredDeleted(now: string): Promise<readonly string[]> {
        const rows = await this.database.all<{ readonly id: string }>(
            `SELECT id
             FROM videos
             WHERE excluido_em IS NOT NULL
               AND excluir_apos <= ?`,
            [now],
        );
        return rows.map((row) => row.id);
    }

    findAll(categoryId?: number): Promise<VideoListItem[]> {
        const categoryFilter =
            categoryId === undefined ? '' : ' WHERE categoria_id = ?';
        const parameters = categoryId === undefined ? [] : [categoryId];

        return this.database.all<VideoListItem>(
            `SELECT
                id,
                titulo,
                caminho_playlist,
                '/videos/' || id || '/thumbnail.jpg' AS caminho_thumbnail,
                categoria_id,
                data_upload,
                status,
                progresso,
                duracao_segundos,
                largura,
                altura,
                tamanho_bytes,
                mensagem_erro
             FROM videos
             ${
                 categoryFilter
                     ? `${categoryFilter} AND excluido_em IS NULL`
                     : 'WHERE excluido_em IS NULL'
             }
             ORDER BY
                CASE status
                    WHEN 'processando' THEN 0
                    WHEN 'erro' THEN 1
                    ELSE 2
                END,
                data_upload DESC`,
            parameters,
        );
    }

    async findDetails(id: string): Promise<VideoDetails | null> {
        const row = await this.database.get<VideoDetails>(
            `SELECT
                v.id,
                v.titulo,
                v.caminho_playlist,
                '/videos/' || v.id || '/thumbnail.jpg' AS caminho_thumbnail,
                v.categoria_id,
                v.data_upload,
                v.status,
                v.progresso,
                v.duracao_segundos,
                v.largura,
                v.altura,
                v.tamanho_bytes,
                v.mensagem_erro,
                c.nome AS categoria_nome
             FROM videos v
             LEFT JOIN categorias c ON v.categoria_id = c.id
             WHERE v.id = ? AND v.excluido_em IS NULL`,
            [id],
        );

        return row ?? null;
    }
}
