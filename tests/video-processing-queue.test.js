import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProcessingEventBus } from "../dist/modules/videos/application/processing-event-bus.js";
import { VideoProcessingQueue } from "../dist/modules/videos/application/video-processing-queue.js";
import { Video } from "../dist/modules/videos/domain/video.js";
import { SqliteProcessingHistoryRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-processing-history-repository.js";
import { SqliteVideoJobRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-video-job-repository.js";
import { SqliteVideoRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-video-repository.js";
import { FilesystemVideoStorage } from "../dist/modules/videos/infrastructure/storage/filesystem-video-storage.js";
import { initializeSchema } from "../dist/shared/infrastructure/database/initialize-schema.js";
import { SqliteDatabase } from "../dist/shared/infrastructure/database/sqlite-database.js";

async function waitFor(predicate, timeoutMs = 3_000) {
    const startedAt = Date.now();

    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error("Timed out waiting for queue state.");
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

test("processing queue pauses and resumes a conversion", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-queue-"));
    const uploads = path.join(directory, "videos");
    const temporaryFile = path.join(directory, "original.mp4");
    await mkdir(uploads);
    await writeFile(temporaryFile, "video");
    const database = new SqliteDatabase(path.join(directory, "test.db"));
    let queue;

    try {
        await initializeSchema(database);
        const videos = new SqliteVideoRepository(database);
        const jobs = new SqliteVideoJobRepository(database);
        const history = new SqliteProcessingHistoryRepository(database);
        const storage = new FilesystemVideoStorage(uploads);
        let mode = "wait";
        const transcoder = {
            async inspect() {
                return {
                    durationSeconds: 10,
                    width: 640,
                    height: 480,
                    sizeBytes: 5,
                };
            },
            async generateThumbnail() {},
            async transcode(_input, _playlist, _thumbnail, onProgress, signal) {
                onProgress?.(25);

                if (mode === "complete") {
                    onProgress?.(100);
                    return;
                }

                await new Promise((resolve, reject) => {
                    signal.addEventListener(
                        "abort",
                        () => reject(new Error("aborted")),
                        { once: true },
                    );
                });
            },
        };
        queue = new VideoProcessingQueue(
            videos,
            jobs,
            storage,
            transcoder,
            history,
            new ProcessingEventBus(),
            1,
        );
        const video = Video.createQueued("video-1", "Teste", null, {
            durationSeconds: 10,
            width: 640,
            height: 480,
            sizeBytes: 5,
        });
        await videos.add(video);
        await jobs.add(video.id, temporaryFile);
        await queue.initialize();
        await waitFor(async () => (await jobs.find(video.id))?.state === "processando");

        await queue.pause(video.id);
        assert.equal((await jobs.find(video.id)).state, "pausado");
        assert.equal((await videos.findById(video.id)).status, "pausado");

        mode = "complete";
        await queue.resume(video.id);
        await waitFor(
            async () => (await videos.findById(video.id)).status === "concluido",
        );
        await waitFor(async () =>
            (await history.list(video.id)).some(
                (entry) => entry.event === "completed",
            ),
        );
        assert.equal(await jobs.find(video.id), null);
        const entries = await history.list(video.id);
        assert.ok(entries.some((entry) => entry.event === "pausado"));
        assert.ok(entries.some((entry) => entry.event === "completed"));
    } finally {
        await queue?.shutdown();
        await database.close();
        await rm(directory, { recursive: true, force: true });
    }
});
