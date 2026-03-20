"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
(0, vitest_1.describe)("Rooms API", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.beforeEach)(() => {
        (0, tempStorage_1.resetStorage)();
    });
    (0, vitest_1.it)("GET /api/rooms returns empty array initially", async () => {
        const res = await fetch(`${app.baseUrl}/api/rooms`);
        (0, vitest_1.expect)(res.status).toBe(200);
        const body = await res.json();
        (0, vitest_1.expect)(body).toEqual({ rooms: [] });
    });
    (0, vitest_1.it)("POST /api/rooms creates a room", async () => {
        const res = await fetch(`${app.baseUrl}/api/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Living Room" }),
        });
        (0, vitest_1.expect)(res.status).toBe(200);
        const body = await res.json();
        (0, vitest_1.expect)(body.room.name).toBe("Living Room");
        (0, vitest_1.expect)(body.room.id).toBeDefined();
        (0, vitest_1.expect)(body.room.units).toBe("metric");
    });
    (0, vitest_1.it)("GET /api/rooms/:id returns created room", async () => {
        // Create
        const createRes = await fetch(`${app.baseUrl}/api/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Bedroom" }),
        });
        const { room } = await createRes.json();
        // Fetch
        const getRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`);
        (0, vitest_1.expect)(getRes.status).toBe(200);
        const body = await getRes.json();
        (0, vitest_1.expect)(body.room.name).toBe("Bedroom");
    });
    (0, vitest_1.it)("DELETE /api/rooms/:id removes room", async () => {
        // Create
        const createRes = await fetch(`${app.baseUrl}/api/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Office" }),
        });
        const { room } = await createRes.json();
        // Delete
        const delRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`, {
            method: "DELETE",
        });
        (0, vitest_1.expect)(delRes.status).toBe(200);
        // Verify gone
        const getRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`);
        (0, vitest_1.expect)(getRes.status).toBe(404);
    });
    (0, vitest_1.it)("GET /api/health returns ok", async () => {
        const res = await fetch(`${app.baseUrl}/api/health`);
        (0, vitest_1.expect)(res.status).toBe(200);
        const body = await res.json();
        (0, vitest_1.expect)(body).toEqual({ status: "ok" });
    });
    (0, vitest_1.it)("GET /api/devices/profiles returns profiles", async () => {
        const res = await fetch(`${app.baseUrl}/api/devices/profiles`);
        (0, vitest_1.expect)(res.status).toBe(200);
        const body = await res.json();
        (0, vitest_1.expect)(body.profiles).toBeDefined();
        (0, vitest_1.expect)(body.profiles.length).toBeGreaterThanOrEqual(3);
    });
});
