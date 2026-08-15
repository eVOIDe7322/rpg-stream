import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
    applyPendingRestore,
    LibraryBackupService,
} from "../dist/modules/admin/infrastructure/library-backup-service.js";
import { initializeSchema } from "../dist/shared/infrastructure/database/initialize-schema.js";
import { SqliteDatabase } from "../dist/shared/infrastructure/database/sqlite-database.js";

test("backup can be staged and restored with its video files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "rpgstream-backup-"));
    const databaseFile = path.join(root, "database.db");
    const uploads = path.join(root, "videos_data");
    const backups = path.join(root, "backups");
    const videoDirectory = path.join(uploads, "video-1");
    const backupFile = path.join(root, "library.zip");
    await mkdir(videoDirectory, { recursive: true });
    await mkdir(backups);
    await writeFile(path.join(videoDirectory, "playlist.m3u8"), "#EXTM3U");
    let database = new SqliteDatabase(databaseFile);
    let closed = false;

    try {
        await initializeSchema(database);
        await database.execute("INSERT INTO categorias (nome) VALUES (?)", [
            "Campanha",
        ]);
        const service = new LibraryBackupService(
            database,
            databaseFile,
            uploads,
            backups,
        );
        const response = new PassThrough();
        response.attachment = () => response;
        response.type = () => response;
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        const finished = once(response, "finish");
        await service.streamBackup(response);
        await finished;
        await writeFile(backupFile, Buffer.concat(chunks));

        await service.prepareRestore(backupFile);
        await access(path.join(backups, "pending", "READY"));
        await database.close();
        closed = true;

        assert.equal(
            await applyPendingRestore({
                databaseFile,
                uploadsDirectory: uploads,
                backupDirectory: backups,
            }),
            true,
        );
        database = new SqliteDatabase(databaseFile);
        closed = false;
        const category = await database.get(
            "SELECT nome FROM categorias WHERE nome = ?",
            ["Campanha"],
        );
        assert.equal(category.nome, "Campanha");
        await access(path.join(uploads, "video-1", "playlist.m3u8"));
    } finally {
        if (!closed) {
            await database.close();
        }
        await rm(root, { recursive: true, force: true });
    }
});
