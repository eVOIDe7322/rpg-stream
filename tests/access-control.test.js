import assert from "node:assert/strict";
import test from "node:test";
import { createAccessControl } from "../dist/shared/presentation/http/access-control.js";

function createResponse() {
    return {
        headers: new Map(),
        statusCode: 200,
        body: null,
        setHeader(name, value) {
            this.headers.set(name, value);
        },
        status(value) {
            this.statusCode = value;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
    };
}

test("access control accepts an authenticated user", async () => {
    const users = {
        async authenticate(name, password) {
            return name === "admin" && password === "12345678"
                ? { id: 1, name, role: "admin" }
                : null;
        },
    };
    const middleware = createAccessControl(users, true);
    const response = createResponse();
    const request = {
        headers: {
            authorization: `Basic ${Buffer.from("admin:12345678").toString("base64")}`,
        },
    };
    let continued = false;

    await middleware(request, response, () => {
        continued = true;
    });

    assert.equal(continued, true);
    assert.equal(request.user.role, "admin");
});

test("access control rejects invalid credentials", async () => {
    const users = { authenticate: async () => null };
    const middleware = createAccessControl(users, true);
    const response = createResponse();
    let continued = false;

    await middleware(
        { headers: { authorization: "Basic dXNlcjpiYWQ=" } },
        response,
        () => {
            continued = true;
        },
    );

    assert.equal(continued, false);
    assert.equal(response.statusCode, 401);
    assert.match(response.headers.get("WWW-Authenticate"), /RPGStream/);
});

test("access control grants local admin when authentication is disabled", async () => {
    const middleware = createAccessControl({}, false);
    const request = { headers: {} };
    let continued = false;

    await middleware(request, createResponse(), () => {
        continued = true;
    });

    assert.equal(continued, true);
    assert.equal(request.user.role, "admin");
});
