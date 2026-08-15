import { SqliteDatabase } from './sqlite-database.js';

interface TableColumn {
    readonly name: string;
}

async function addMissingVideoColumns(
    database: SqliteDatabase,
): Promise<void> {
    const existingColumns = new Set(
        (await database.all<TableColumn>('PRAGMA table_info(videos)')).map(
            (column) => column.name,
        ),
    );
    const columns: ReadonlyArray<readonly [string, string]> = [
        ['progresso', 'INTEGER NOT NULL DEFAULT 0'],
        ['duracao_segundos', 'REAL'],
        ['largura', 'INTEGER'],
        ['altura', 'INTEGER'],
        ['tamanho_bytes', 'INTEGER'],
        ['mensagem_erro', 'TEXT'],
        ['excluido_em', 'TEXT'],
        ['excluir_apos', 'TEXT'],
    ];

    for (const [name, definition] of columns) {
        if (!existingColumns.has(name)) {
            await database.execute(
                `ALTER TABLE videos ADD COLUMN ${name} ${definition}`,
            );
        }
    }
}

export async function initializeSchema(
    database: SqliteDatabase,
): Promise<void> {
    await database.execute('PRAGMA foreign_keys = ON');

    await database.execute(`
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE NOT NULL
        )
    `);

    await database.execute(`
        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            titulo TEXT,
            caminho_playlist TEXT,
            categoria_id INTEGER,
            data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            progresso INTEGER NOT NULL DEFAULT 0,
            duracao_segundos REAL,
            largura INTEGER,
            altura INTEGER,
            tamanho_bytes INTEGER,
            mensagem_erro TEXT,
            excluido_em TEXT,
            excluir_apos TEXT,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        )
    `);

    await addMissingVideoColumns(database);
    await database.execute(`
        UPDATE videos
        SET progresso = 100
        WHERE status = 'concluido' AND progresso < 100
    `);
    await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_videos_status_categoria_data
        ON videos (status, categoria_id, data_upload DESC)
    `);

    await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_videos_lixeira
        ON videos (excluido_em, excluir_apos)
    `);

    await database.execute(`
        CREATE TABLE IF NOT EXISTS video_jobs (
            video_id TEXT PRIMARY KEY,
            arquivo_temporario TEXT NOT NULL,
            estado TEXT NOT NULL,
            tentativas INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL,
            atualizado_em TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )
    `);

    await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_video_jobs_estado_data
        ON video_jobs (estado, criado_em)
    `);

    await database.execute(`
        CREATE TABLE IF NOT EXISTS video_processing_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            nivel TEXT NOT NULL,
            evento TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            detalhes TEXT,
            criado_em TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )
    `);

    await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_video_history_video_data
        ON video_processing_history (video_id, criado_em DESC)
    `);

    await database.execute(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL,
            senha_salt TEXT NOT NULL,
            papel TEXT NOT NULL CHECK (papel IN ('admin', 'editor', 'viewer')),
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em TEXT NOT NULL
        )
    `);

    await database.execute(`
        CREATE TABLE IF NOT EXISTS video_markers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            titulo TEXT NOT NULL,
            tempo_segundos REAL NOT NULL,
            criado_por INTEGER,
            criado_em TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    `);

    await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_video_markers_video_time
        ON video_markers (video_id, tempo_segundos)
    `);
}
