import assert from "node:assert/strict";
import {
    access,
    mkdtemp,
    rm,
    utimes,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanupTemporaryFiles } from "../dist/shared/infrastructure/filesystem/cleanup-temporary-files.js";

test("temporary cleanup removes only expired files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-temp-"));
    const expiredFile = path.join(directory, "expired");
    const recentFile = path.join(directory, "recent");

    try {
        await writeFile(expiredFile, "old");
        await writeFile(recentFile, "new");
        const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
        await utimes(expiredFile, oldDate, oldDate);

        const result = await cleanupTemporaryFiles(
            directory,
            24 * 60 * 60 * 1000,
        );

        assert.equal(result.filesRemoved, 1);
        assert.equal(result.bytesRemoved, 3);
        await assert.rejects(access(expiredFile));
        await access(recentFile);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
