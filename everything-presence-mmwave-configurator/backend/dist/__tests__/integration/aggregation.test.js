"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
const storage_1 = require("../../config/storage");
(0, vitest_1.describe)("Aggregation API", () => {
    let app;
    let mockMqtt;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)();
        // The testApp doesn't inject mqttClient by default — we verify config CRUD
        // and 503 behavior. MQTT publish tests use a dedicated setup below.
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
    });
    // ── Helpers ─────────────────────────────────────────────────
    async function createRoom(name = "Test Room") {
        const res = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name,
            sensors: [
                { deviceId: "sensor-a", profileId: "ep-pro", placement: { x: 0, y: 0 } },
                { deviceId: "sensor-b", profileId: "ep-lite", placement: { x: 1000, y: 0 } },
            ],
        })
            .expect(200);
        return res.body.room.id;
    }
    // ── GET /:id/aggregation ────────────────────────────────────
    (0, vitest_1.describe)("GET /:id/aggregation", () => {
        (0, vitest_1.it)("returns defaults when no config stored", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/aggregation`)
                .expect(200);
            (0, vitest_1.expect)(res.body.aggregation).toEqual({
                presenceMode: "any",
                tieBreaker: "occupied",
                environmentalMethod: "average",
            });
        });
        (0, vitest_1.it)("returns stored config after PATCH", async () => {
            const roomId = await createRoom();
            // Store config
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({
                presenceMode: "majority",
                tieBreaker: "not_occupied",
                environmentalMethod: "min",
            })
                .expect(200);
            // Read back
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/aggregation`)
                .expect(200);
            (0, vitest_1.expect)(res.body.aggregation.presenceMode).toBe("majority");
            (0, vitest_1.expect)(res.body.aggregation.tieBreaker).toBe("not_occupied");
            (0, vitest_1.expect)(res.body.aggregation.environmentalMethod).toBe("min");
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .get("/api/rooms/nonexistent-id/aggregation")
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
    });
    // ── PATCH /:id/aggregation ──────────────────────────────────
    (0, vitest_1.describe)("PATCH /:id/aggregation", () => {
        (0, vitest_1.it)("stores presenceMode + tieBreaker + environmentalMethod", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({
                presenceMode: "all",
                tieBreaker: "no_change",
                environmentalMethod: "max",
            })
                .expect(200);
            (0, vitest_1.expect)(res.body.aggregation).toMatchObject({
                presenceMode: "all",
                tieBreaker: "no_change",
                environmentalMethod: "max",
            });
            // Verify persisted in room metadata
            const roomRes = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const metadata = roomRes.body.room.metadata;
            (0, vitest_1.expect)(metadata.aggregation).toMatchObject({
                presenceMode: "all",
                tieBreaker: "no_change",
                environmentalMethod: "max",
            });
        });
        (0, vitest_1.it)("validates invalid presenceMode (returns 400)", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({ presenceMode: "bogus" })
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("Invalid presenceMode");
        });
        (0, vitest_1.it)("validates invalid tieBreaker (returns 400)", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({ tieBreaker: "invalid" })
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("Invalid tieBreaker");
        });
        (0, vitest_1.it)("validates invalid environmentalMethod (returns 400)", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({ environmentalMethod: "nope" })
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("Invalid environmentalMethod");
        });
        (0, vitest_1.it)("stores zoneOverrides keyed by zone ID", async () => {
            const roomId = await createRoom();
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({
                presenceMode: "any",
                zoneOverrides: {
                    "zone-abc": { presenceMode: "majority", tieBreaker: "not_occupied" },
                    "zone-def": { presenceMode: "all" },
                },
            })
                .expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/aggregation`)
                .expect(200);
            (0, vitest_1.expect)(res.body.aggregation.zoneOverrides).toEqual({
                "zone-abc": { presenceMode: "majority", tieBreaker: "not_occupied" },
                "zone-def": { presenceMode: "all" },
            });
        });
        (0, vitest_1.it)("merges partial updates with existing config", async () => {
            const roomId = await createRoom();
            // Set initial config
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({
                presenceMode: "majority",
                tieBreaker: "not_occupied",
                environmentalMethod: "min",
            })
                .expect(200);
            // Partial update — only change presenceMode
            await (0, supertest_1.default)(app.server)
                .patch(`/api/rooms/${roomId}/aggregation`)
                .send({ presenceMode: "all" })
                .expect(200);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/aggregation`)
                .expect(200);
            // presenceMode changed, others preserved
            (0, vitest_1.expect)(res.body.aggregation.presenceMode).toBe("all");
            (0, vitest_1.expect)(res.body.aggregation.tieBreaker).toBe("not_occupied");
            (0, vitest_1.expect)(res.body.aggregation.environmentalMethod).toBe("min");
        });
    });
    // ── POST /:id/aggregation/reconcile ─────────────────────────
    (0, vitest_1.describe)("POST /:id/aggregation/reconcile", () => {
        (0, vitest_1.it)("returns 503 when aggregation service unavailable (no HA deps)", async () => {
            // createTestApp wires HA deps, so this test needs a server without them.
            // The standard test app DOES have deps. We need to check whether the
            // aggregation service is constructed. In our testApp, HaHelperApi is
            // constructed from config.ha which is present → service exists.
            // We'll test the 503 path with a custom server that has no deps.
            // For this test, we verify the route exists and returns structured data.
            // The 503 scenario requires a server without deps — tested below.
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            await (0, supertest_1.default)(app.server)
                .post("/api/rooms/nonexistent-id/aggregation/reconcile")
                .expect(404);
        });
    });
    // ── DELETE /:id/aggregation ─────────────────────────────────
    (0, vitest_1.describe)("DELETE /:id/aggregation", () => {
        (0, vitest_1.it)("clears haEntities.templateHelpers", async () => {
            const roomId = await createRoom();
            // Seed haEntities.templateHelpers directly via storage
            // (rooms PUT endpoint normalizes and strips haEntities)
            const room = storage_1.storage.getRoom(roomId);
            storage_1.storage.saveRoom({
                ...room,
                haEntities: {
                    templateHelpers: [
                        { configEntryId: "fake-1", entityId: "sensor.fake_1", type: "room_occupancy" },
                        { configEntryId: "fake-2", entityId: "sensor.fake_2", type: "room_target_count" },
                    ],
                },
            });
            // Verify helpers are stored
            const beforeDelete = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(beforeDelete.body.room.haEntities?.templateHelpers).toHaveLength(2);
            // Delete aggregation
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/aggregation`)
                .expect(200);
            // Verify helpers cleared
            const afterDelete = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(afterDelete.body.room.haEntities?.templateHelpers).toEqual([]);
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            await (0, supertest_1.default)(app.server)
                .delete("/api/rooms/nonexistent-id/aggregation")
                .expect(404);
        });
    });
});
// ── Separate test suite: 503 when no HA deps ────────────────────────
(0, vitest_1.describe)("Aggregation API — no HA deps", () => {
    // We need a server without HA deps to test the 503 path
    let server;
    (0, vitest_1.beforeAll)(async () => {
        // Import createServer directly and pass no deps
        const { createServer } = await Promise.resolve().then(() => __importStar(require("../../server")));
        const app = createServer({
            port: 0,
            ha: { mode: "standalone", baseUrl: "http://localhost:8123/api", token: "test" },
            frontendDist: null,
            firmware: { lanPort: 0, cacheDir: "/tmp/ep-test-fw-agg", maxVersionsPerDevice: 3 },
        }, undefined);
        server = (await Promise.resolve().then(() => __importStar(require("http")))).createServer(app);
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
        });
    });
    (0, vitest_1.afterAll)(async () => {
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
    });
    async function createRoom() {
        const res = await (0, supertest_1.default)(server)
            .post("/api/rooms")
            .send({ name: "No-Deps Room" })
            .expect(200);
        return res.body.room.id;
    }
    (0, vitest_1.it)("POST reconcile returns 503 when aggregation service unavailable", async () => {
        const roomId = await createRoom();
        const res = await (0, supertest_1.default)(server)
            .post(`/api/rooms/${roomId}/aggregation/reconcile`)
            .expect(503);
        (0, vitest_1.expect)(res.body.message).toContain("Aggregation service unavailable");
    });
    (0, vitest_1.it)("GET aggregation still works without HA deps", async () => {
        const roomId = await createRoom();
        const res = await (0, supertest_1.default)(server)
            .get(`/api/rooms/${roomId}/aggregation`)
            .expect(200);
        (0, vitest_1.expect)(res.body.aggregation.presenceMode).toBe("any");
    });
    (0, vitest_1.it)("PATCH aggregation config CRUD works without HA deps", async () => {
        const roomId = await createRoom();
        await (0, supertest_1.default)(server)
            .patch(`/api/rooms/${roomId}/aggregation`)
            .send({ presenceMode: "majority" })
            .expect(200);
        const res = await (0, supertest_1.default)(server)
            .get(`/api/rooms/${roomId}/aggregation`)
            .expect(200);
        (0, vitest_1.expect)(res.body.aggregation.presenceMode).toBe("majority");
    });
});
// ── MQTT publish test ────────────────────────────────────────────────
(0, vitest_1.describe)("Aggregation API — MQTT publish", () => {
    let app;
    let mockMqtt;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)({ withMqttClient: true });
        mockMqtt = app.mqttClient;
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
        mockMqtt.reset();
    });
    async function createRoom(name = "MQTT Room") {
        const res = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name,
            sensors: [
                { deviceId: "sensor-a", profileId: "ep-pro", placement: { x: 0, y: 0 } },
            ],
        })
            .expect(200);
        return res.body.room.id;
    }
    (0, vitest_1.it)("PATCH publishes MQTT config entity states when mqttClient available", async () => {
        const roomId = await createRoom();
        await (0, supertest_1.default)(app.server)
            .patch(`/api/rooms/${roomId}/aggregation`)
            .send({
            presenceMode: "majority",
            environmentalMethod: "min",
        })
            .expect(200);
        // Check that MQTT config states were published
        const presenceModePublishes = mockMqtt.getPublishesForTopic(`ep_room/${roomId}/presence_mode/state`);
        (0, vitest_1.expect)(presenceModePublishes.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(presenceModePublishes[presenceModePublishes.length - 1].payload).toBe("majority");
        const tempModePublishes = mockMqtt.getPublishesForTopic(`ep_room/${roomId}/temperature_mode/state`);
        (0, vitest_1.expect)(tempModePublishes.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(tempModePublishes[tempModePublishes.length - 1].payload).toBe("min");
    });
});
