"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
const storage_1 = require("../../config/storage");
const migrationService_1 = require("../../domain/migrationService");
const mockReadTransport_1 = require("../helpers/mockReadTransport");
/**
 * Data-model migration tests (S01/M002).
 *
 * Verifies the completed sensors[] data-model migration:
 * 1. Storage reads rooms directly from disk (no read-time bridge)
 * 2. normalizeRoom() write-path backfills sensors[0] from legacy input
 * 3. migrationService reads sensors[0] for entity mapping and zone migration
 * 4. Startup migration converts legacy rooms to have sensors[] on disk
 * 5. End-to-end: legacy file → startup migration → API response with sensors[]
 */
// ── 1. Storage reads — sensors[] comes from disk (no bridge) ─────
(0, vitest_1.describe)("storage reads — sensors[] from disk (post-migration)", () => {
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
    (0, vitest_1.it)("POST with legacy fields → normalizeRoom backfills sensors[0] → GET returns sensors from disk", async () => {
        // POST a room with legacy fields only (normalizeRoom write-path backfills sensors[0])
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Legacy Room",
            deviceId: "abc123",
            profileId: "everything_presence_lite",
            devicePlacement: { x: 100, y: 200, rotationDeg: 45 },
        })
            .expect(200);
        const roomId = postRes.body.room.id;
        // GET returns sensors[0] from what normalizeRoom wrote to disk
        const getRes = await (0, supertest_1.default)(app.server)
            .get(`/api/rooms/${roomId}`)
            .expect(200);
        const room = getRes.body.room;
        (0, vitest_1.expect)(room.sensors).toBeDefined();
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("abc123");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("everything_presence_lite");
        (0, vitest_1.expect)(room.sensors[0].placement).toEqual({ x: 100, y: 200, rotationDeg: 45 });
    });
    (0, vitest_1.it)("room with sensors[] directly → GET returns sensors as-is", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Modern Room",
            sensors: [
                {
                    deviceId: "sensor-a",
                    profileId: "ep-pro",
                    placement: { x: 10, y: 20 },
                    label: "NW Corner",
                },
                {
                    deviceId: "sensor-b",
                    profileId: "ep-lite",
                    placement: { x: 300, y: 400, rotationDeg: 90 },
                },
            ],
        })
            .expect(200);
        const roomId = postRes.body.room.id;
        const getRes = await (0, supertest_1.default)(app.server)
            .get(`/api/rooms/${roomId}`)
            .expect(200);
        const room = getRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(2);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("sensor-a");
        (0, vitest_1.expect)(room.sensors[0].label).toBe("NW Corner");
        (0, vitest_1.expect)(room.sensors[1].deviceId).toBe("sensor-b");
        (0, vitest_1.expect)(room.sensors[1].placement.rotationDeg).toBe(90);
    });
    (0, vitest_1.it)("room with no deviceId and no sensors → GET returns room with undefined sensors", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({ name: "Empty Room" })
            .expect(200);
        const roomId = postRes.body.room.id;
        const getRes = await (0, supertest_1.default)(app.server)
            .get(`/api/rooms/${roomId}`)
            .expect(200);
        const room = getRes.body.room;
        (0, vitest_1.expect)(room.sensors).toBeUndefined();
    });
    (0, vitest_1.it)("room with deviceId AND existing sensors[] → sensors[] takes precedence", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Hybrid Room",
            deviceId: "legacy-device",
            profileId: "old-profile",
            sensors: [
                {
                    deviceId: "new-sensor",
                    profileId: "new-profile",
                    placement: { x: 50, y: 60 },
                },
            ],
        })
            .expect(200);
        const roomId = postRes.body.room.id;
        const getRes = await (0, supertest_1.default)(app.server)
            .get(`/api/rooms/${roomId}`)
            .expect(200);
        const room = getRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("new-sensor");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("new-profile");
    });
    (0, vitest_1.it)("listRooms returns sensors[] for all rooms", async () => {
        // Create two rooms via API (both get sensors via normalizeRoom write-path)
        await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Legacy",
            deviceId: "dev-legacy",
            profileId: "prof-1",
            devicePlacement: { x: 0, y: 0 },
        })
            .expect(200);
        await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Modern",
            sensors: [{ deviceId: "dev-modern", profileId: "prof-2", placement: { x: 10, y: 10 } }],
        })
            .expect(200);
        const listRes = await (0, supertest_1.default)(app.server)
            .get("/api/rooms")
            .expect(200);
        const rooms = listRes.body.rooms;
        (0, vitest_1.expect)(rooms).toHaveLength(2);
        const legacy = rooms.find((r) => r.name === "Legacy");
        const modern = rooms.find((r) => r.name === "Modern");
        (0, vitest_1.expect)(legacy?.sensors).toHaveLength(1);
        (0, vitest_1.expect)(legacy?.sensors[0].deviceId).toBe("dev-legacy");
        (0, vitest_1.expect)(modern?.sensors).toHaveLength(1);
        (0, vitest_1.expect)(modern?.sensors[0].deviceId).toBe("dev-modern");
    });
});
// ── 2. normalizeRoom() write-path tests ──────────────────────────
(0, vitest_1.describe)("normalizeRoom — write-path field preservation", () => {
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
    (0, vitest_1.it)("POST with deviceId, profileId, devicePlacement → stored room preserves legacy fields", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Legacy Fields Room",
            deviceId: "device-123",
            profileId: "ep-lite",
            devicePlacement: { x: 150, y: 250, rotationDeg: 180 },
        })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.deviceId).toBe("device-123");
        (0, vitest_1.expect)(room.profileId).toBe("ep-lite");
        (0, vitest_1.expect)(room.devicePlacement).toEqual({ x: 150, y: 250, rotationDeg: 180 });
    });
    (0, vitest_1.it)("POST with sensors[] → stored room preserves sensors", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Sensors Room",
            sensors: [
                {
                    deviceId: "sen-1",
                    profileId: "ep-pro",
                    placement: { x: 0, y: 0, rotationDeg: 0, installationAngle: 30 },
                    label: "Main Sensor",
                },
            ],
        })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("sen-1");
        (0, vitest_1.expect)(room.sensors[0].placement.installationAngle).toBe(30);
        (0, vitest_1.expect)(room.sensors[0].label).toBe("Main Sensor");
    });
    (0, vitest_1.it)("PUT room updates preserve both legacy and sensor fields", async () => {
        // Create room with legacy fields
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Original",
            deviceId: "dev-1",
            profileId: "prof-1",
            devicePlacement: { x: 10, y: 20 },
            sensors: [
                { deviceId: "sen-1", profileId: "prof-1", placement: { x: 10, y: 20 } },
            ],
        })
            .expect(200);
        const roomId = postRes.body.room.id;
        // PUT update: change name, keep everything else
        const putRes = await (0, supertest_1.default)(app.server)
            .put(`/api/rooms/${roomId}`)
            .send({ name: "Updated" })
            .expect(200);
        const updated = putRes.body.room;
        (0, vitest_1.expect)(updated.name).toBe("Updated");
        // Legacy fields preserved through merge
        (0, vitest_1.expect)(updated.deviceId).toBe("dev-1");
        (0, vitest_1.expect)(updated.profileId).toBe("prof-1");
        (0, vitest_1.expect)(updated.devicePlacement).toEqual({ x: 10, y: 20 });
        // Sensors preserved through merge
        (0, vitest_1.expect)(updated.sensors).toHaveLength(1);
        (0, vitest_1.expect)(updated.sensors[0].deviceId).toBe("sen-1");
    });
    (0, vitest_1.it)("POST with entityMappings → stored room preserves entity mappings", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Mapped Room",
            deviceId: "dev-mapped",
            entityMappings: {
                discoveredAt: "2025-06-01T00:00:00Z",
                autoMatchedCount: 5,
                manuallyMappedCount: 1,
                presenceEntity: "binary_sensor.ep_presence",
                mmwaveEntity: "binary_sensor.ep_mmwave",
            },
        })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.entityMappings).toBeDefined();
        (0, vitest_1.expect)(room.entityMappings.presenceEntity).toBe("binary_sensor.ep_presence");
        (0, vitest_1.expect)(room.entityMappings.autoMatchedCount).toBe(5);
    });
});
// ── 2b. normalizeRoom() sensors[0] backfill (T03) ───────────────
(0, vitest_1.describe)("normalizeRoom — sensors[0] backfill from legacy input", () => {
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
    (0, vitest_1.it)("POST with legacy fields (deviceId, profileId, devicePlacement, no sensors) → response includes sensors[0]", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Legacy Write",
            deviceId: "device-abc",
            profileId: "ep-lite",
            devicePlacement: { x: 100, y: 200, rotationDeg: 45 },
        })
            .expect(200);
        const room = postRes.body.room;
        // sensors[0] should be backfilled from legacy fields
        (0, vitest_1.expect)(room.sensors).toBeDefined();
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("device-abc");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("ep-lite");
        (0, vitest_1.expect)(room.sensors[0].placement).toEqual({ x: 100, y: 200, rotationDeg: 45 });
        // Legacy fields still preserved
        (0, vitest_1.expect)(room.deviceId).toBe("device-abc");
        (0, vitest_1.expect)(room.profileId).toBe("ep-lite");
    });
    (0, vitest_1.it)("POST with deviceId only (no profileId, no devicePlacement) → sensors[0] has defaults", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Minimal Legacy",
            deviceId: "device-xyz",
        })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("device-xyz");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("");
        (0, vitest_1.expect)(room.sensors[0].placement).toEqual({ x: 0, y: 0 });
    });
    (0, vitest_1.it)("POST with sensors[] directly → sensors preserved as-is (no backfill)", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Modern Write",
            sensors: [
                { deviceId: "sen-1", profileId: "ep-pro", placement: { x: 50, y: 60 }, label: "Main" },
            ],
        })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("sen-1");
        (0, vitest_1.expect)(room.sensors[0].label).toBe("Main");
        // No deviceId backfill from sensors to legacy field
        (0, vitest_1.expect)(room.deviceId).toBeUndefined();
    });
    (0, vitest_1.it)("POST with no deviceId and no sensors → room has no sensors", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({ name: "Empty" })
            .expect(200);
        const room = postRes.body.room;
        (0, vitest_1.expect)(room.sensors).toBeUndefined();
        (0, vitest_1.expect)(room.deviceId).toBeUndefined();
    });
    (0, vitest_1.it)("POST with both deviceId AND sensors[] → sensors[] takes precedence (no double backfill)", async () => {
        const postRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Hybrid Write",
            deviceId: "legacy-dev",
            profileId: "old-profile",
            sensors: [
                { deviceId: "new-sensor", profileId: "new-profile", placement: { x: 10, y: 20 } },
            ],
        })
            .expect(200);
        const room = postRes.body.room;
        // sensors[] from input takes precedence
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("new-sensor");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("new-profile");
    });
});
// ── 3. migrationService consumer tests (reads sensors[0]) ───────
(0, vitest_1.describe)("migrationService — reads sensors[0]", () => {
    let transport;
    (0, vitest_1.beforeEach)(() => {
        (0, tempStorage_1.resetStorage)();
        transport = new mockReadTransport_1.MockReadTransport();
    });
    /** Build a minimal RoomConfig with overrides. */
    function makeRoom(overrides = {}) {
        return {
            id: "room-test",
            name: "Test Room",
            units: "metric",
            zones: [],
            ...overrides,
        };
    }
    (0, vitest_1.describe)("migrateRoomToDeviceMapping", () => {
        (0, vitest_1.it)("room with sensors[0].deviceId + entityMappings → migrates correctly", async () => {
            const room = makeRoom({
                deviceId: "device-abc",
                profileId: "ep-lite",
                sensors: [{ deviceId: "device-abc", profileId: "ep-lite", placement: { x: 0, y: 0 } }],
                entityMappings: {
                    discoveredAt: "2025-01-01T00:00:00Z",
                    autoMatchedCount: 3,
                    manuallyMappedCount: 0,
                    presenceEntity: "binary_sensor.ep_presence",
                    temperatureEntity: "sensor.ep_temperature",
                    mmwaveEntity: "binary_sensor.ep_mmwave",
                },
            });
            const result = await migrationService_1.migrationService.migrateRoomToDeviceMapping(room);
            (0, vitest_1.expect)(result.migrated).toBe(true);
            (0, vitest_1.expect)(result.deviceId).toBe("device-abc");
            (0, vitest_1.expect)(result.roomId).toBe("room-test");
        });
        (0, vitest_1.it)("room with no sensors[0].deviceId → returns { migrated: false, reason: 'no_device_id' }", async () => {
            const room = makeRoom({
                // No sensors, no deviceId
                entityMappings: {
                    discoveredAt: "2025-01-01T00:00:00Z",
                    autoMatchedCount: 1,
                    manuallyMappedCount: 0,
                    presenceEntity: "binary_sensor.ep_presence",
                },
            });
            const result = await migrationService_1.migrationService.migrateRoomToDeviceMapping(room);
            (0, vitest_1.expect)(result.migrated).toBe(false);
            (0, vitest_1.expect)(result.reason).toBe("no_device_id");
            (0, vitest_1.expect)(result.roomId).toBe("room-test");
        });
        (0, vitest_1.it)("room with sensors[0].deviceId but no entityMappings or entityNamePrefix → returns { migrated: false, reason: 'no_mappings' }", async () => {
            const room = makeRoom({
                deviceId: "device-xyz",
                sensors: [{ deviceId: "device-xyz", profileId: "", placement: { x: 0, y: 0 } }],
                // No entityMappings, no entityNamePrefix
            });
            const result = await migrationService_1.migrationService.migrateRoomToDeviceMapping(room);
            (0, vitest_1.expect)(result.migrated).toBe(false);
            (0, vitest_1.expect)(result.reason).toBe("no_mappings");
        });
        (0, vitest_1.it)("room with entityNamePrefix (legacy) + sensors[0].deviceId → migrates (needsMigration is true)", async () => {
            const room = makeRoom({
                deviceId: "device-legacy",
                sensors: [{ deviceId: "device-legacy", profileId: "", placement: { x: 0, y: 0 } }],
                entityNamePrefix: "ep_lite_abc123",
            });
            // needsMigration returns true for entityNamePrefix
            (0, vitest_1.expect)(migrationService_1.migrationService.needsMigration(room)).toBe(true);
            // But migrateRoomToDeviceMapping will try to convert, and convertRoomMappings
            // returns {} since entityMappings is undefined — still creates a device mapping
            const result = await migrationService_1.migrationService.migrateRoomToDeviceMapping(room);
            (0, vitest_1.expect)(result.migrated).toBe(true);
            (0, vitest_1.expect)(result.deviceId).toBe("device-legacy");
        });
    });
    (0, vitest_1.describe)("migrateZonesToRoomCoords", () => {
        (0, vitest_1.it)("room with sensors[0].placement + zones → transforms zones correctly", async () => {
            const room = makeRoom({
                devicePlacement: { x: 50, y: 100, rotationDeg: 0 },
                sensors: [{ deviceId: "dev-1", profileId: "", placement: { x: 50, y: 100, rotationDeg: 0 } }],
                zones: [
                    { id: "z1", type: "regular", x: 10, y: 20, width: 30, height: 40 },
                ],
            });
            storage_1.storage.saveRoom(room);
            const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
            (0, vitest_1.expect)(result).toBe(true);
            (0, vitest_1.expect)(room.zonesInRoomCoords).toBe(true);
            // At 0° rotation: zone coords + placement offset
            (0, vitest_1.expect)(room.zones[0].x).toBeCloseTo(60, 5);
            (0, vitest_1.expect)(room.zones[0].y).toBeCloseTo(120, 5);
            (0, vitest_1.expect)(room.zones[0].width).toBeCloseTo(30, 5);
            (0, vitest_1.expect)(room.zones[0].height).toBeCloseTo(40, 5);
        });
        (0, vitest_1.it)("room with no sensors[0].placement → skips gracefully (returns false)", async () => {
            const room = makeRoom({
                // No sensors, no devicePlacement
                zones: [
                    { id: "z1", type: "regular", x: 10, y: 20, width: 30, height: 40 },
                ],
            });
            const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
            (0, vitest_1.expect)(result).toBe(false);
            // Zones should not be modified
            (0, vitest_1.expect)(room.zones[0].x).toBe(10);
            (0, vitest_1.expect)(room.zones[0].y).toBe(20);
            (0, vitest_1.expect)(room.zonesInRoomCoords).toBeUndefined();
        });
        (0, vitest_1.it)("room already migrated (zonesInRoomCoords: true) → skips (returns false)", async () => {
            const room = makeRoom({
                zonesInRoomCoords: true,
                devicePlacement: { x: 50, y: 50 },
                sensors: [{ deviceId: "dev-1", profileId: "", placement: { x: 50, y: 50 } }],
                zones: [
                    { id: "z1", type: "regular", x: 60, y: 70, width: 30, height: 40 },
                ],
            });
            const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
            (0, vitest_1.expect)(result).toBe(false);
            // Zones should not be re-transformed
            (0, vitest_1.expect)(room.zones[0].x).toBe(60);
        });
        (0, vitest_1.it)("room with sensors[0].placement but no zones → marks migrated, returns true", async () => {
            const room = makeRoom({
                devicePlacement: { x: 50, y: 50, rotationDeg: 0 },
                sensors: [{ deviceId: "dev-1", profileId: "", placement: { x: 50, y: 50, rotationDeg: 0 } }],
                zones: [],
            });
            storage_1.storage.saveRoom(room);
            const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
            (0, vitest_1.expect)(result).toBe(true);
            (0, vitest_1.expect)(room.zonesInRoomCoords).toBe(true);
        });
    });
});
// ── 4. migrateLegacySensorsArray — startup disk migration ────────
(0, vitest_1.describe)("migrateLegacySensorsArray — writes sensors[] to disk", () => {
    (0, vitest_1.beforeEach)(() => {
        (0, tempStorage_1.resetStorage)();
    });
    /** Build a minimal RoomConfig with overrides. */
    function makeRoom(overrides = {}) {
        return {
            id: "room-test",
            name: "Test Room",
            units: "metric",
            zones: [],
            ...overrides,
        };
    }
    (0, vitest_1.it)("legacy room (deviceId, no sensors) → after migration, room on disk has sensors[0]", async () => {
        // Write a legacy room directly to storage (no sensors array)
        const room = makeRoom({
            id: "room-legacy",
            name: "Legacy Room",
            deviceId: "device-abc",
            profileId: "ep-lite",
            devicePlacement: { x: 100, y: 200, rotationDeg: 45 },
        });
        storage_1.storage.saveRoom(room);
        // Verify raw disk has no sensors
        const rawBefore = storage_1.storage.listRooms();
        (0, vitest_1.expect)(rawBefore[0].sensors).toBeUndefined();
        // Run migration
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary.totalRooms).toBe(1);
        (0, vitest_1.expect)(summary.migratedCount).toBe(1);
        (0, vitest_1.expect)(summary.skippedCount).toBe(0);
        (0, vitest_1.expect)(summary.errorCount).toBe(0);
        // Verify raw disk now has sensors[0]
        const rawAfter = storage_1.storage.listRooms();
        (0, vitest_1.expect)(rawAfter[0].sensors).toBeDefined();
        (0, vitest_1.expect)(rawAfter[0].sensors).toHaveLength(1);
        (0, vitest_1.expect)(rawAfter[0].sensors[0].deviceId).toBe("device-abc");
        (0, vitest_1.expect)(rawAfter[0].sensors[0].profileId).toBe("ep-lite");
        (0, vitest_1.expect)(rawAfter[0].sensors[0].placement).toEqual({ x: 100, y: 200, rotationDeg: 45 });
    });
    (0, vitest_1.it)("room with existing sensors[] → migration skips (idempotent)", async () => {
        const room = makeRoom({
            id: "room-modern",
            name: "Modern Room",
            deviceId: "device-xyz",
            sensors: [
                {
                    deviceId: "sensor-a",
                    profileId: "ep-pro",
                    placement: { x: 10, y: 20 },
                },
            ],
        });
        storage_1.storage.saveRoom(room);
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary.totalRooms).toBe(1);
        (0, vitest_1.expect)(summary.migratedCount).toBe(0);
        (0, vitest_1.expect)(summary.skippedCount).toBe(1);
        (0, vitest_1.expect)(summary.results[0].reason).toBe("sensors_already_present");
        // Verify sensors unchanged on disk
        const rawAfter = storage_1.storage.listRooms();
        (0, vitest_1.expect)(rawAfter[0].sensors).toHaveLength(1);
        (0, vitest_1.expect)(rawAfter[0].sensors[0].deviceId).toBe("sensor-a");
    });
    (0, vitest_1.it)("room with no deviceId and no sensors → migration skips", async () => {
        const room = makeRoom({
            id: "room-empty",
            name: "Empty Room",
            // No deviceId, no sensors
        });
        storage_1.storage.saveRoom(room);
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary.totalRooms).toBe(1);
        (0, vitest_1.expect)(summary.migratedCount).toBe(0);
        (0, vitest_1.expect)(summary.skippedCount).toBe(1);
        (0, vitest_1.expect)(summary.results[0].reason).toBe("no_device_id");
    });
    (0, vitest_1.it)("run migration twice → same result (idempotency)", async () => {
        const room = makeRoom({
            id: "room-idem",
            name: "Idempotent Room",
            deviceId: "device-idem",
            profileId: "ep-one",
            devicePlacement: { x: 50, y: 60 },
        });
        storage_1.storage.saveRoom(room);
        // First run — should migrate
        const summary1 = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary1.migratedCount).toBe(1);
        // Capture disk state after first migration
        const rawAfterFirst = storage_1.storage.listRooms();
        const sensorsAfterFirst = rawAfterFirst[0].sensors;
        // Second run — should skip (sensors already present)
        const summary2 = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary2.migratedCount).toBe(0);
        (0, vitest_1.expect)(summary2.skippedCount).toBe(1);
        (0, vitest_1.expect)(summary2.results[0].reason).toBe("sensors_already_present");
        // Verify disk state unchanged
        const rawAfterSecond = storage_1.storage.listRooms();
        (0, vitest_1.expect)(rawAfterSecond[0].sensors).toEqual(sensorsAfterFirst);
    });
    (0, vitest_1.it)("multiple rooms, mixed legacy and new → only legacy rooms migrated", async () => {
        // Legacy room (needs migration)
        storage_1.storage.saveRoom(makeRoom({
            id: "room-legacy-1",
            name: "Legacy 1",
            deviceId: "dev-1",
            profileId: "ep-lite",
            devicePlacement: { x: 0, y: 0 },
        }));
        // Modern room (has sensors, should skip)
        storage_1.storage.saveRoom(makeRoom({
            id: "room-modern-1",
            name: "Modern 1",
            sensors: [
                { deviceId: "sen-1", profileId: "ep-pro", placement: { x: 10, y: 10 } },
            ],
        }));
        // Empty room (no deviceId, should skip)
        storage_1.storage.saveRoom(makeRoom({
            id: "room-empty-1",
            name: "Empty 1",
        }));
        // Another legacy room (needs migration, no placement)
        storage_1.storage.saveRoom(makeRoom({
            id: "room-legacy-2",
            name: "Legacy 2",
            deviceId: "dev-2",
            // No profileId, no devicePlacement — should still migrate with defaults
        }));
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary.totalRooms).toBe(4);
        (0, vitest_1.expect)(summary.migratedCount).toBe(2);
        (0, vitest_1.expect)(summary.skippedCount).toBe(2);
        (0, vitest_1.expect)(summary.errorCount).toBe(0);
        // Verify each room on disk
        const rawRooms = storage_1.storage.listRooms();
        const legacy1 = rawRooms.find((r) => r.id === "room-legacy-1");
        const modern1 = rawRooms.find((r) => r.id === "room-modern-1");
        const empty1 = rawRooms.find((r) => r.id === "room-empty-1");
        const legacy2 = rawRooms.find((r) => r.id === "room-legacy-2");
        // Legacy 1: migrated with full placement
        (0, vitest_1.expect)(legacy1.sensors).toHaveLength(1);
        (0, vitest_1.expect)(legacy1.sensors[0].deviceId).toBe("dev-1");
        (0, vitest_1.expect)(legacy1.sensors[0].profileId).toBe("ep-lite");
        (0, vitest_1.expect)(legacy1.sensors[0].placement).toEqual({ x: 0, y: 0 });
        // Modern 1: untouched
        (0, vitest_1.expect)(modern1.sensors).toHaveLength(1);
        (0, vitest_1.expect)(modern1.sensors[0].deviceId).toBe("sen-1");
        // Empty 1: no sensors added
        (0, vitest_1.expect)(empty1.sensors).toBeUndefined();
        // Legacy 2: migrated with defaults (no profileId → '', no placement → {x:0,y:0})
        (0, vitest_1.expect)(legacy2.sensors).toHaveLength(1);
        (0, vitest_1.expect)(legacy2.sensors[0].deviceId).toBe("dev-2");
        (0, vitest_1.expect)(legacy2.sensors[0].profileId).toBe("");
        (0, vitest_1.expect)(legacy2.sensors[0].placement).toEqual({ x: 0, y: 0 });
    });
    (0, vitest_1.it)("migration returns structured MigrationSummary with per-room results", async () => {
        storage_1.storage.saveRoom(makeRoom({ id: "r1", name: "Room 1", deviceId: "d1", profileId: "p1" }));
        storage_1.storage.saveRoom(makeRoom({ id: "r2", name: "Room 2" }));
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        // Verify structure
        (0, vitest_1.expect)(summary).toHaveProperty("totalRooms", 2);
        (0, vitest_1.expect)(summary).toHaveProperty("migratedCount", 1);
        (0, vitest_1.expect)(summary).toHaveProperty("skippedCount", 1);
        (0, vitest_1.expect)(summary).toHaveProperty("errorCount", 0);
        (0, vitest_1.expect)(summary.results).toHaveLength(2);
        // Verify per-room results
        const migrated = summary.results.find((r) => r.migrated);
        (0, vitest_1.expect)(migrated).toBeDefined();
        (0, vitest_1.expect)(migrated.roomId).toBe("r1");
        (0, vitest_1.expect)(migrated.deviceId).toBe("d1");
        const skipped = summary.results.find((r) => !r.migrated);
        (0, vitest_1.expect)(skipped).toBeDefined();
        (0, vitest_1.expect)(skipped.roomId).toBe("r2");
        (0, vitest_1.expect)(skipped.reason).toBe("no_device_id");
    });
});
// ── 5. End-to-end: legacy file → startup migration → API ────────
(0, vitest_1.describe)("end-to-end migration — legacy rooms.json → startup migration → GET /api/rooms", () => {
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
    (0, vitest_1.it)("legacy rooms.json on disk → run migrateLegacySensorsArray → GET /api/rooms returns sensors[]", async () => {
        // Write a legacy rooms.json directly to the temp DATA_DIR (simulating pre-migration state)
        const dataDir = process.env.DATA_DIR;
        const roomsFile = path_1.default.join(dataDir, "rooms.json");
        const legacyRooms = [
            {
                id: "room-living",
                name: "Living Room",
                units: "metric",
                deviceId: "ep_lite_aabbcc",
                profileId: "everything_presence_lite",
                devicePlacement: { x: 200, y: 150, rotationDeg: 90 },
                zones: [{ id: "z1", type: "regular", x: 10, y: 20, width: 50, height: 60 }],
            },
            {
                id: "room-kitchen",
                name: "Kitchen",
                units: "metric",
                deviceId: "ep_one_112233",
                zones: [],
            },
            {
                id: "room-empty",
                name: "Unused Room",
                units: "metric",
                zones: [],
            },
        ];
        fs_1.default.writeFileSync(roomsFile, JSON.stringify(legacyRooms, null, 2));
        // Verify disk has no sensors before migration
        const beforeRooms = storage_1.storage.listRooms();
        (0, vitest_1.expect)(beforeRooms.find((r) => r.id === "room-living").sensors).toBeUndefined();
        (0, vitest_1.expect)(beforeRooms.find((r) => r.id === "room-kitchen").sensors).toBeUndefined();
        // Run startup migration (as index.ts would at boot)
        const summary = await migrationService_1.migrationService.migrateLegacySensorsArray();
        (0, vitest_1.expect)(summary.migratedCount).toBe(2);
        (0, vitest_1.expect)(summary.skippedCount).toBe(1); // room-empty (no deviceId)
        // GET /api/rooms — sensors[] populated from migrated disk data
        const listRes = await (0, supertest_1.default)(app.server)
            .get("/api/rooms")
            .expect(200);
        const rooms = listRes.body.rooms;
        (0, vitest_1.expect)(rooms).toHaveLength(3);
        const living = rooms.find((r) => r.id === "room-living");
        (0, vitest_1.expect)(living.sensors).toHaveLength(1);
        (0, vitest_1.expect)(living.sensors[0].deviceId).toBe("ep_lite_aabbcc");
        (0, vitest_1.expect)(living.sensors[0].profileId).toBe("everything_presence_lite");
        (0, vitest_1.expect)(living.sensors[0].placement).toEqual({ x: 200, y: 150, rotationDeg: 90 });
        const kitchen = rooms.find((r) => r.id === "room-kitchen");
        (0, vitest_1.expect)(kitchen.sensors).toHaveLength(1);
        (0, vitest_1.expect)(kitchen.sensors[0].deviceId).toBe("ep_one_112233");
        (0, vitest_1.expect)(kitchen.sensors[0].profileId).toBe("");
        (0, vitest_1.expect)(kitchen.sensors[0].placement).toEqual({ x: 0, y: 0 });
        const empty = rooms.find((r) => r.id === "room-empty");
        (0, vitest_1.expect)(empty.sensors).toBeUndefined();
    });
    (0, vitest_1.it)("GET single room after migration also returns sensors[]", async () => {
        const dataDir = process.env.DATA_DIR;
        const roomsFile = path_1.default.join(dataDir, "rooms.json");
        const legacyRooms = [
            {
                id: "room-bedroom",
                name: "Bedroom",
                units: "metric",
                deviceId: "ep_pro_xyz",
                profileId: "everything_presence_pro",
                devicePlacement: { x: 300, y: 400, rotationDeg: 180 },
                zones: [],
            },
        ];
        fs_1.default.writeFileSync(roomsFile, JSON.stringify(legacyRooms, null, 2));
        // Run migration
        await migrationService_1.migrationService.migrateLegacySensorsArray();
        // GET single room
        const getRes = await (0, supertest_1.default)(app.server)
            .get("/api/rooms/room-bedroom")
            .expect(200);
        const room = getRes.body.room;
        (0, vitest_1.expect)(room.sensors).toHaveLength(1);
        (0, vitest_1.expect)(room.sensors[0].deviceId).toBe("ep_pro_xyz");
        (0, vitest_1.expect)(room.sensors[0].profileId).toBe("everything_presence_pro");
        (0, vitest_1.expect)(room.sensors[0].placement).toEqual({ x: 300, y: 400, rotationDeg: 180 });
    });
});
