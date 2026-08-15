import { VideoStorage } from '../../videos/application/ports/video-storage.js';
import { SqliteDatabase } from '../../../shared/infrastructure/database/sqlite-database.js';

interface CategoryStorageRow {
    readonly id: number | null;
    readonly name: string;
    readonly videoCount: number;
    readonly sizeBytes: number;
}

interface LargestVideoRow {
    readonly id: string;
    readonly title: string;
    readonly sizeBytes: number;
    readonly durationSeconds: number | null;
}

interface QueueRow {
    readonly state: string;
    readonly total: number;
}

export class AdminDashboard {
    constructor(
        private readonly database: SqliteDatabase,
        private readonly storage: VideoStorage,
    ) {}

    async get() {
        const [storage, categories, largestVideos, queue, errorCount, trash] =
            await Promise.all([
                this.storage.getStorageStats(),
                this.database.all<CategoryStorageRow>(`
                    SELECT
                        c.id,
                        COALESCE(c.nome, 'Sem categoria') AS name,
                        COUNT(v.id) AS videoCount,
                        COALESCE(SUM(v.tamanho_bytes), 0) AS sizeBytes
                    FROM videos v
                    LEFT JOIN categorias c ON v.categoria_id = c.id
                    WHERE v.excluido_em IS NULL
                    GROUP BY c.id, c.nome
                    ORDER BY sizeBytes DESC
                `),
                this.database.all<LargestVideoRow>(`
                    SELECT
                        id,
                        titulo AS title,
                        COALESCE(tamanho_bytes, 0) AS sizeBytes,
                        duracao_segundos AS durationSeconds
                    FROM videos
                    WHERE excluido_em IS NULL
                    ORDER BY sizeBytes DESC
                    LIMIT 10
                `),
                this.database.all<QueueRow>(`
                    SELECT estado AS state, COUNT(*) AS total
                    FROM video_jobs
                    GROUP BY estado
                `),
                this.database.get<{ readonly total: number }>(`
                    SELECT COUNT(*) AS total
                    FROM video_processing_history
                    WHERE nivel = 'error'
                `),
                this.database.get<{
                    readonly videoCount: number;
                    readonly sizeBytes: number;
                }>(`
                    SELECT
                        COUNT(*) AS videoCount,
                        COALESCE(SUM(tamanho_bytes), 0) AS sizeBytes
                    FROM videos
                    WHERE excluido_em IS NOT NULL
                `),
            ]);

        return {
            storage: {
                ...storage,
                usedBytes: storage.totalBytes - storage.availableBytes,
            },
            categories,
            largestVideos,
            queue: Object.fromEntries(
                queue.map((item) => [item.state, item.total]),
            ),
            processingErrorCount: errorCount?.total ?? 0,
            trash: trash ?? { videoCount: 0, sizeBytes: 0 },
        };
    }
}
