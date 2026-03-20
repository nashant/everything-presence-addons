"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
(0, vitest_1.describe)("Sensor CRUD", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
    });
    // Helper: create a room and return its id
    async function createRoom(name = "Test Room") {
        const res = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({ name })
            .expect(200);
        return res.body.room.id;
    }
    // Helper: attach a sensor to a room (returns supertest chain for .expect() chaining)
    function addSensor(roomId, sensor) {
        return (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/sensors`)
            .send({
            deviceId: sensor.deviceId,
            profileId: sensor.profileId ?? "ep-pro",
            placement: sensor.placement ?? { x: 0, y: 0 },
            label: sensor.label,
        });
    }
    // ── installationAngle preservation (R001 fix) ─────────────────
    (0, vitest_1.describe)("installationAngle preservation", () => {
        (0, vitest_1.it)("POST sensor with installationAngle → GET room → installationAngle is present", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                placement: { x: 10, y: 20, rotationDeg: 90, installationAngle: 45 },
            }).expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const sensor = res.body.room.sensors[0];
            (0, vitest_1.expect)(sensor.placement.installationAngle).toBe(45);
            (0, vitest_1.expect)(sensor.placement.rotationDeg).toBe(90);
            (0, vitest_1.expect)(sensor.placement.x).toBe(10);
            (0, vitest_1.expect)(sensor.placement.y).toBe(20);
        });
        (0, vitest_1.it)("POST sensor without installationAngle → GET room → installationAngle is undefined", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                placement: { x: 10, y: 20 },
            }).expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const sensor = res.body.room.sensors[0];
            (0, vitest_1.expect)(sensor.placement.installationAngle).toBeUndefined();
        });
        (0, vitest_1.it)("POST sensor with installationAngle: 0 → GET room → installationAngle is 0 (not stripped)", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                placement: { x: 0, y: 0, installationAngle: 0 },
            }).expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const sensor = res.body.room.sensors[0];
            (0, vitest_1.expect)(sensor.placement.installationAngle).toBe(0);
        });
    });
    // ── PATCH sensor endpoint ─────────────────────────────────────
    (0, vitest_1.describe)("PATCH /:id/sensors/:deviceId", () => {
        (0, vitest_1.it)("PATCH placement → GET room → placement updated, existing fields preserved", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                placement: { x: 10, y: 20, rotationDeg: 90, installationAngle: 45 },
                label: "Original Label",
            }).expect(200);
            // PATCH only x and y
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/sensors/sensor-1`)
                .send({ placement: { x: 100, y: 200 } })
                .expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const sensor = res.body.room.sensors[0];
            (0, vitest_1.expect)(sensor.placement.x).toBe(100);
            (0, vitest_1.expect)(sensor.placement.y).toBe(200);
            // Existing fields preserved via merge
            (0, vitest_1.expect)(sensor.placement.rotationDeg).toBe(90);
            (0, vitest_1.expect)(sensor.placement.installationAngle).toBe(45);
            // Label untouched
            (0, vitest_1.expect)(sensor.label).toBe("Original Label");
        });
        (0, vitest_1.it)("PATCH label → GET room → label updated", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                label: "Old Label",
            }).expect(200);
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/sensors/sensor-1`)
                .send({ label: "New Label" })
                .expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(res.body.room.sensors[0].label).toBe("New Label");
        });
        (0, vitest_1.it)("PATCH returns the full updated room in response body", async () => {
            const roomId = await createRoom("My Room");
            await addSensor(roomId, {
                deviceId: "sensor-1",
            }).expect(200);
            const patchRes = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/sensors/sensor-1`)
                .send({ label: "Patched" })
                .expect(200);
            (0, vitest_1.expect)(patchRes.body.room).toBeDefined();
            (0, vitest_1.expect)(patchRes.body.room.name).toBe("My Room");
            (0, vitest_1.expect)(patchRes.body.room.sensors[0].label).toBe("Patched");
        });
        (0, vitest_1.it)("PATCH on unknown room → 404", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .patch("/api/rooms/nonexistent/sensors/sensor-1")
                .send({ label: "X" })
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
        (0, vitest_1.it)("PATCH on unknown sensor → 404", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/sensors/nonexistent`)
                .send({ label: "X" })
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Sensor not found in room");
        });
        (0, vitest_1.it)("PATCH with empty body → sensor unchanged, no crash", async () => {
            const roomId = await createRoom();
            await addSensor(roomId, {
                deviceId: "sensor-1",
                placement: { x: 10, y: 20, installationAngle: 30 },
                label: "Keep Me",
            }).expect(200);
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/sensors/sensor-1`)
                .send({})
                .expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const sensor = res.body.room.sensors[0];
            (0, vitest_1.expect)(sensor.placement.x).toBe(10);
            (0, vitest_1.expect)(sensor.placement.y).toBe(20);
            (0, vitest_1.expect)(sensor.placement.installationAngle).toBe(30);
            (0, vitest_1.expect)(sensor.label).toBe("Keep Me");
        });
    });
});
