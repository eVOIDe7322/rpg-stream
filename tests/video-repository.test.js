import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Video } from "../dist/modules/videos/domain/video.js";
import { SqliteVideoRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-video-repository.js";
import { initializeSchema } from "../dist/shared/infrastructure/database/initialize-schema.js";
import { SqliteDatabase } from "../dist/shared/infrastructure/database/sqlite-database.js";

test("repository lists live states, metadata and recovers interruptions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-db-"));
    const database = new SqliteDatabase(path.join(directory, "test.db"));

    try {
        await initializeSchema(database);
        await initializeSchema(database);
        const repository = new SqliteVideoRepository(database);
        const video = Video.createProcessing(
            "video-1",
            "Sessão de teste",
            null,
            {
                durationSeconds: 90,
                width: 1280,
                height: 720,
                sizeBytes: 42_000,
            },
        );

        await repository.add(video);
        await repository.updateProgress(video.id, 35);

        const processing = await repository.findAll();
        assert.equal(processing.length, 1);
        assert.equal(processing[0].status, "processando");
        assert.equal(processing[0].progresso, 35);
        assert.equal(
            processing[0].caminho_thumbnail,
            "/videos/video-1/thumbnail.jpg",
        );

        const recovered = await repository.failInterrupted("Reiniciado.");
        assert.equal(recovered, 1);

        const failed = await repository.findAll();
        assert.equal(failed[0].status, "erro");
        assert.equal(failed[0].mensagem_erro, "Reiniciado.");
    } finally {
        await database.close();
        await rm(directory, { recursive: true, force: true });
    }
});
