import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { UserService } from "../dist/modules/users/application/user-service.js";
import { SqliteUserRepository } from "../dist/modules/users/infrastructure/persistence/sqlite-user-repository.js";
import { initializeSchema } from "../dist/shared/infrastructure/database/initialize-schema.js";
import { SqliteDatabase } from "../dist/shared/infrastructure/database/sqlite-database.js";

test("user service hashes credentials and authenticates roles", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-user-"));
    const database = new SqliteDatabase(path.join(directory, "test.db"));

    try {
        await initializeSchema(database);
        const service = new UserService(new SqliteUserRepository(database));
        const id = await service.create("viewer.test", "password123", "viewer");
        assert.ok(id > 0);
        assert.equal(
            (await service.authenticate("viewer.test", "password123")).role,
            "viewer",
        );
        assert.equal(
            await service.authenticate("viewer.test", "wrong-password"),
            null,
        );
        const [stored] = await service.list();
        assert.equal("passwordHash" in stored, false);
    } finally {
        await database.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("configured admin recovers credentials and cannot be the last one disabled", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rpgstream-admin-"));
    const database = new SqliteDatabase(path.join(directory, "test.db"));

    try {
        await initializeSchema(database);
        const service = new UserService(new SqliteUserRepository(database));
        await service.create("admin", "old-password", "admin");
        await service.bootstrap("admin", "new-password");
        assert.equal(
            (await service.authenticate("admin", "new-password")).role,
            "admin",
        );
        assert.equal(await service.authenticate("admin", "old-password"), null);
        const [admin] = await service.list();
        await assert.rejects(
            () => service.update(admin.id, { active: false }),
            /\u00faltimo administrador ativo/,
        );
    } finally {
        await database.close();
        await rm(directory, { recursive: true, force: true });
    }
});
