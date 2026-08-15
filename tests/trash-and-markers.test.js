import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    DeleteVideo,
    ManageVideoMarkers,
    PurgeVideo,
    RestoreVideoFromTrash,
} from "../dist/modules/videos/application/video-use-cases.js";
import { Video } from "../dist/modules/videos/domain/video.js";
import { SqliteVideoMarkerRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-video-marker-repository.js";
import { SqliteVideoRepository } from "../dist/modules/videos/infrastructure/persistence/sqlite-video-repository.js";
import { FilesystemVideoStorage } from "../dist/modules/videos/infrastructure/storage/filesystem-video-storage.js";
import { initializeSchema } from "../dist/shared/infrastructure/database/initialize-schema.js";
import { SqliteDatabase } from "../dist/shared/infrastructure/database/sqlite-database.js";

async function pathExists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

test("trash restores files and markers keep session timestamps", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-trash-"));
    const uploads = path.join(directory, "videos");
    await mkdir(uploads);
    const database = new SqliteDatabase(path.join(directory, "test.db"));

    try {
        await initializeSchema(database);
        const videos = new SqliteVideoRepository(database);
        const storage = new FilesystemVideoStorage(uploads);
        const markers = new ManageVideoMarkers(
            videos,
            new SqliteVideoMarkerRepository(database),
        );
        const video = Video.createQueued("video-trash", "Sessão 12", null, {
            durationSeconds: 120,
            width: 1280,
            height: 720,
            sizeBytes: 100,
        });
        video.markAsProcessing();
        video.markAsCompleted("/videos/video-trash/playlist.m3u8");
        await videos.add(video);
        const output = await storage.prepareOutput(video.id);
        await writeFile(output.playlistFile, "#EXTM3U");
        await writeFile(output.thumbnailFile, "image");

        const marker = await markers.add(video.id, "Combate", 42, null);
        assert.equal((await markers.list(video.id))[0].timeSeconds, 42);
        await markers.delete(video.id, marker.id);
        assert.deepEqual(await markers.list(video.id), []);

        const jobs = { find: async () => null };
        const queue = { cancel: async () => assert.fail("unexpected cancel") };
        const moveToTrash = new DeleteVideo(
            videos,
            storage,
            jobs,
            queue,
            30,
        );
        await moveToTrash.execute(video.id);
        assert.deepEqual(await videos.findAll(), []);
        assert.equal((await videos.findDeleted()).length, 1);
        assert.equal(await pathExists(output.directory), false);

        await new RestoreVideoFromTrash(videos, storage).execute(video.id);
        assert.equal((await videos.findAll()).length, 1);
        assert.equal(await pathExists(output.playlistFile), true);

        await moveToTrash.execute(video.id);
        await new PurgeVideo(videos, storage).execute(video.id);
        assert.equal(await videos.findById(video.id), null);
    } finally {
        await database.close();
        await rm(directory, { recursive: true, force: true });
    }
});
