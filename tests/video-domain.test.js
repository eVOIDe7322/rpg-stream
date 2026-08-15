import assert from "node:assert/strict";
import test from "node:test";
import { Video } from "../dist/modules/videos/domain/video.js";

const metadata = {
    durationSeconds: 3_600,
    width: 1_920,
    height: 1_080,
    sizeBytes: 1_000_000,
};

test("video tracks processing progress and completion", () => {
    const video = Video.createProcessing(
        "video-1",
        "Sessão 01",
        null,
        metadata,
    );

    video.updateProgress(24.6);
    video.updateProgress(10);
    assert.equal(video.progress, 25);

    video.updateProgress(150);
    assert.equal(video.progress, 99);

    video.markAsCompleted("/videos/video-1/playlist.m3u8");
    assert.equal(video.status, "concluido");
    assert.equal(video.progress, 100);
    assert.equal(video.playlistPath, "/videos/video-1/playlist.m3u8");
});

test("video keeps a bounded processing error", () => {
    const video = Video.createProcessing(
        "video-2",
        "Sessão 02",
        null,
        metadata,
    );

    video.markAsFailed("x".repeat(500));
    assert.equal(video.status, "erro");
    assert.equal(video.errorMessage.length, 300);
});
