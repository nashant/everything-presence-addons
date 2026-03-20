"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
(0, vitest_1.describe)("Named Zones CRUD", () => {
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
    function validRectZone(overrides = {}) {
        return {
            name: "Living Area",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: {
                type: "regular",
                x: 100,
                y: 200,
                width: 500,
                height: 400,
            },
            ...overrides,
        };
    }
    function validPolygonZone(overrides = {}) {
        return {
            name: "Kitchen",
            type: "exclusion",
            sensorParticipation: { "sensor-a": true },
            geometry: {
                type: "exclusion",
                vertices: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 100 },
                    { x: 0, y: 100 },
                ],
            },
            ...overrides,
        };
    }
    // ── CREATE ──────────────────────────────────────────────────
    (0, vitest_1.describe)("POST /:roomId/named-zones", () => {
        (0, vitest_1.it)("creates a rect zone and returns 201 with generated UUID", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone())
                .expect(201);
            (0, vitest_1.expect)(res.body.zone).toBeDefined();
            (0, vitest_1.expect)(res.body.zone.id).toBeDefined();
            (0, vitest_1.expect)(typeof res.body.zone.id).toBe("string");
            (0, vitest_1.expect)(res.body.zone.id.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(res.body.zone.name).toBe("Living Area");
            (0, vitest_1.expect)(res.body.zone.type).toBe("regular");
            (0, vitest_1.expect)(res.body.zone.sensorParticipation).toEqual({ "sensor-a": true, "sensor-b": false });
            (0, vitest_1.expect)(res.body.zone.geometry.width).toBe(500);
            (0, vitest_1.expect)(res.body.zone.geometry.height).toBe(400);
        });
        (0, vitest_1.it)("creates a polygon zone", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validPolygonZone())
                .expect(201);
            (0, vitest_1.expect)(res.body.zone.name).toBe("Kitchen");
            (0, vitest_1.expect)(res.body.zone.type).toBe("exclusion");
            (0, vitest_1.expect)(res.body.zone.geometry.vertices).toHaveLength(4);
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .post("/api/rooms/nonexistent/named-zones")
                .send(validRectZone())
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
        (0, vitest_1.it)("rejects missing name with 400", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ name: "" }))
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("name");
        });
        (0, vitest_1.it)("rejects invalid type with 400", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ type: "bogus" }))
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("type");
        });
        (0, vitest_1.it)("rejects rect geometry without width/height with 400", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ geometry: { x: 0, y: 0 } }))
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("geometry");
        });
        (0, vitest_1.it)("rejects polygon geometry with fewer than 3 vertices with 400", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({
                geometry: {
                    vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                },
            }))
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("vertices");
        });
        (0, vitest_1.it)("rejects missing geometry with 400", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({ name: "No Geo", type: "regular" })
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("geometry");
        });
    });
    // ── LIST ────────────────────────────────────────────────────
    (0, vitest_1.describe)("GET /:roomId/named-zones", () => {
        (0, vitest_1.it)("returns empty array when room has no named zones", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/named-zones`)
                .expect(200);
            (0, vitest_1.expect)(res.body.zones).toEqual([]);
        });
        (0, vitest_1.it)("returns all created zones", async () => {
            const roomId = await createRoom();
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone())
                .expect(201);
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validPolygonZone())
                .expect(201);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/named-zones`)
                .expect(200);
            (0, vitest_1.expect)(res.body.zones).toHaveLength(2);
            (0, vitest_1.expect)(res.body.zones[0].name).toBe("Living Area");
            (0, vitest_1.expect)(res.body.zones[1].name).toBe("Kitchen");
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .get("/api/rooms/nonexistent/named-zones")
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
    });
    // ── UPDATE ──────────────────────────────────────────────────
    (0, vitest_1.describe)("PUT /:roomId/named-zones/:zoneId", () => {
        (0, vitest_1.it)("updates zone name and type", async () => {
            const roomId = await createRoom();
            const created = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone())
                .expect(201);
            const zoneId = created.body.zone.id;
            const res = await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/named-zones/${zoneId}`)
                .send({
                name: "Bedroom",
                type: "entry",
                sensorParticipation: { "sensor-a": false, "sensor-b": true },
                geometry: created.body.zone.geometry,
            })
                .expect(200);
            (0, vitest_1.expect)(res.body.zone.id).toBe(zoneId);
            (0, vitest_1.expect)(res.body.zone.name).toBe("Bedroom");
            (0, vitest_1.expect)(res.body.zone.type).toBe("entry");
            (0, vitest_1.expect)(res.body.zone.sensorParticipation).toEqual({ "sensor-a": false, "sensor-b": true });
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .put("/api/rooms/nonexistent/named-zones/some-zone-id")
                .send(validRectZone())
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
        (0, vitest_1.it)("returns 404 for nonexistent zone", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/named-zones/nonexistent`)
                .send(validRectZone())
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Zone not found");
        });
        (0, vitest_1.it)("rejects invalid type on update with 400", async () => {
            const roomId = await createRoom();
            const created = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone())
                .expect(201);
            const res = await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/named-zones/${created.body.zone.id}`)
                .send({ ...validRectZone(), type: "invalid" })
                .expect(400);
            (0, vitest_1.expect)(res.body.message).toContain("type");
        });
    });
    // ── DELETE ──────────────────────────────────────────────────
    (0, vitest_1.describe)("DELETE /:roomId/named-zones/:zoneId", () => {
        (0, vitest_1.it)("deletes a zone and returns ok", async () => {
            const roomId = await createRoom();
            const created = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone())
                .expect(201);
            const zoneId = created.body.zone.id;
            const res = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/named-zones/${zoneId}`)
                .expect(200);
            (0, vitest_1.expect)(res.body.ok).toBe(true);
            // Verify zone is gone
            const listRes = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}/named-zones`)
                .expect(200);
            (0, vitest_1.expect)(listRes.body.zones).toHaveLength(0);
        });
        (0, vitest_1.it)("returns 404 for nonexistent room", async () => {
            const res = await (0, supertest_1.default)(app.server)
                .delete("/api/rooms/nonexistent/named-zones/some-zone-id")
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Room not found");
        });
        (0, vitest_1.it)("returns 404 for nonexistent zone", async () => {
            const roomId = await createRoom();
            const res = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/named-zones/nonexistent`)
                .expect(404);
            (0, vitest_1.expect)(res.body.message).toBe("Zone not found");
        });
    });
    // ── PERSISTENCE ─────────────────────────────────────────────
    (0, vitest_1.describe)("persistence", () => {
        (0, vitest_1.it)("created zone appears in room GET response under namedZones", async () => {
            const roomId = await createRoom();
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ name: "Sofa Area" }))
                .expect(201);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(res.body.room.namedZones).toBeDefined();
            (0, vitest_1.expect)(res.body.room.namedZones).toHaveLength(1);
            (0, vitest_1.expect)(res.body.room.namedZones[0].name).toBe("Sofa Area");
        });
        (0, vitest_1.it)("namedZones survive room PUT without namedZones in body (BUG-006 regression)", async () => {
            const roomId = await createRoom();
            // Create a named zone
            const created = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ name: "Survivor Zone" }))
                .expect(201);
            const zoneId = created.body.zone.id;
            // Verify namedZones exist before the PUT
            const before = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(before.body.room.namedZones).toHaveLength(1);
            // PUT room with only name changed — no namedZones in payload
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}`)
                .send({ name: "Renamed Room" })
                .expect(200);
            // GET room and verify namedZones survived
            const after = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(after.body.room.name).toBe("Renamed Room");
            (0, vitest_1.expect)(after.body.room.namedZones).toBeDefined();
            (0, vitest_1.expect)(after.body.room.namedZones).toHaveLength(1);
            (0, vitest_1.expect)(after.body.room.namedZones[0].id).toBe(zoneId);
            (0, vitest_1.expect)(after.body.room.namedZones[0].name).toBe("Survivor Zone");
        });
        (0, vitest_1.it)("multiple zones persist correctly across separate requests", async () => {
            const roomId = await createRoom();
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validRectZone({ name: "Zone A" }))
                .expect(201);
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send(validPolygonZone({ name: "Zone B" }))
                .expect(201);
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(res.body.room.namedZones).toHaveLength(2);
            (0, vitest_1.expect)(res.body.room.namedZones.map((z) => z.name)).toEqual(["Zone A", "Zone B"]);
        });
    });
});
// ════════════════════════════════════════════════════════════════
// Named Zones Push Tests
// ════════════════════════════════════════════════════════════════
const PROFILE_ID = "everything_presence_lite";
const PRO_PROFILE_ID = "everything_presence_pro";
/** Seed two EP Lite devices into the mock read transport */
function seedDevices(app) {
    app.readTransport.addDevice({
        id: "sensor-a",
        name: "Living Room EP Lite",
        name_by_user: null,
        manufacturer: "EverythingSmartTechnology",
        model: "Everything Presence Lite",
        identifiers: [["esphome", "living_room_ep_lite"]],
        sw_version: "1.4.1",
        hw_version: null,
        serial_number: null,
        area_id: null,
        disabled_by: null,
        config_entries: [],
    });
    app.readTransport.addDevice({
        id: "sensor-b",
        name: "Bedroom EP Lite",
        name_by_user: null,
        manufacturer: "EverythingSmartTechnology",
        model: "Everything Presence Lite",
        identifiers: [["esphome", "bedroom_ep_lite"]],
        sw_version: "1.4.1",
        hw_version: null,
        serial_number: null,
        area_id: null,
        disabled_by: null,
        config_entries: [],
    });
}
/** Seed zone entity registry entries for an EP Lite device */
function seedEntityRegistry(app, deviceId, name) {
    const entities = [
        // Core sensors (needed for discovery)
        { entity_id: `binary_sensor.${name}_occupancy`, name: "Occupancy", platform: "esphome" },
        // Zone coordinate entities (4 zones)
        { entity_id: `number.${name}_zone_1_begin_x`, name: "Zone 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_end_x`, name: "Zone 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_begin_y`, name: "Zone 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_end_y`, name: "Zone 1 End Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_off_delay`, name: "Zone 1 Off Delay", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_begin_x`, name: "Zone 2 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_end_x`, name: "Zone 2 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_begin_y`, name: "Zone 2 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_end_y`, name: "Zone 2 End Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_off_delay`, name: "Zone 2 Off Delay", platform: "esphome" },
        { entity_id: `number.${name}_zone_3_begin_x`, name: "Zone 3 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_3_end_x`, name: "Zone 3 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_3_begin_y`, name: "Zone 3 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_3_end_y`, name: "Zone 3 End Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_3_off_delay`, name: "Zone 3 Off Delay", platform: "esphome" },
        { entity_id: `number.${name}_zone_4_begin_x`, name: "Zone 4 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_4_end_x`, name: "Zone 4 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_4_begin_y`, name: "Zone 4 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_4_end_y`, name: "Zone 4 End Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_4_off_delay`, name: "Zone 4 Off Delay", platform: "esphome" },
        // Exclusion zone entities (2)
        { entity_id: `number.${name}_occupancy_mask_1_begin_x`, name: "Exclusion 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_end_x`, name: "Exclusion 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_begin_y`, name: "Exclusion 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_end_y`, name: "Exclusion 1 End Y", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_2_begin_x`, name: "Exclusion 2 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_2_end_x`, name: "Exclusion 2 End X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_2_begin_y`, name: "Exclusion 2 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_2_end_y`, name: "Exclusion 2 End Y", platform: "esphome" },
        // Entry zone entities (2)
        { entity_id: `number.${name}_entry_zone_1_begin_x`, name: "Entry 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_end_x`, name: "Entry 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_begin_y`, name: "Entry 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_end_y`, name: "Entry 1 End Y", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_2_begin_x`, name: "Entry 2 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_2_end_x`, name: "Entry 2 End X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_2_begin_y`, name: "Entry 2 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_2_end_y`, name: "Entry 2 End Y", platform: "esphome" },
        // Polygon zone text entities
        { entity_id: `text.${name}_polygon_zone_1`, name: "Polygon Zone 1", platform: "esphome" },
        { entity_id: `text.${name}_polygon_zone_2`, name: "Polygon Zone 2", platform: "esphome" },
        { entity_id: `text.${name}_polygon_zone_3`, name: "Polygon Zone 3", platform: "esphome" },
        { entity_id: `text.${name}_polygon_zone_4`, name: "Polygon Zone 4", platform: "esphome" },
        // Polygon exclusion text entities
        { entity_id: `text.${name}_polygon_exclusion_zone_1`, name: "Polygon Exclusion 1", platform: "esphome" },
        { entity_id: `text.${name}_polygon_exclusion_zone_2`, name: "Polygon Exclusion 2", platform: "esphome" },
        // Polygon entry text entities
        { entity_id: `text.${name}_polygon_entry_zone_1`, name: "Polygon Entry 1", platform: "esphome" },
        { entity_id: `text.${name}_polygon_entry_zone_2`, name: "Polygon Entry 2", platform: "esphome" },
        // Polygon mode toggle
        { entity_id: `switch.${name}_polygon_zones`, name: "Polygon Zones", platform: "esphome" },
        // Settings
        { entity_id: `number.${name}_max_distance`, name: "Max Distance", platform: "esphome" },
        { entity_id: `number.${name}_installation_angle`, name: "Installation Angle", platform: "esphome" },
    ];
    for (const entity of entities) {
        app.readTransport.addEntity({
            entity_id: entity.entity_id,
            name: entity.name,
            platform: entity.platform,
            device_id: deviceId,
            disabled_by: null,
            hidden_by: null,
        });
    }
}
function seedAll(app) {
    seedDevices(app);
    seedEntityRegistry(app, "sensor-a", "living_room_ep_lite");
    seedEntityRegistry(app, "sensor-b", "bedroom_ep_lite");
}
async function discoverAndSave(app, deviceId, deviceName) {
    return (0, supertest_1.default)(app.server)
        .post(`/api/devices/${deviceId}/discover-and-save`)
        .send({ profileId: PROFILE_ID, deviceName })
        .expect(200);
}
(0, vitest_1.describe)("Named Zones Push", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
        app.readTransport.reset();
        app.writeClient.reset();
    });
    // ── Helpers ─────────────────────────────────────────────────
    const placement0 = { x: 0, y: 0, rotationDeg: 0 };
    /** Create a room with 2 EP Lite sensors (no rotation for predictable transforms) */
    async function createPushRoom() {
        const res = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Push Test Room",
            sensors: [
                { deviceId: "sensor-a", profileId: PROFILE_ID, placement: placement0 },
                { deviceId: "sensor-b", profileId: PROFILE_ID, placement: placement0 },
            ],
        })
            .expect(200);
        return res.body.room.id;
    }
    /** Add a named rect zone to a room */
    async function addRectZone(roomId, overrides = {}) {
        return (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/named-zones`)
            .send({
            name: "Sofa",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": true },
            geometry: { type: "regular", x: 100, y: 200, width: 500, height: 400 },
            ...overrides,
        })
            .expect(201);
    }
    /** Add a named polygon zone to a room */
    async function addPolygonZone(roomId, overrides = {}) {
        return (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/named-zones`)
            .send({
            name: "Hallway",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": true },
            geometry: {
                type: "regular",
                vertices: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 100 },
                    { x: 0, y: 100 },
                ],
            },
            ...overrides,
        })
            .expect(201);
    }
    // ── Tests ───────────────────────────────────────────────────
    (0, vitest_1.it)("pushes 2 named rect zones to 2 sensors with correct slot-indexed entity writes", async () => {
        seedAll(app);
        const roomId = await createPushRoom();
        // Run entity discovery for both sensors
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        await discoverAndSave(app, "sensor-b", "bedroom_ep_lite");
        // Create 2 regular rect zones, both participating on both sensors
        await addRectZone(roomId, { name: "Sofa", sensorParticipation: { "sensor-a": true, "sensor-b": true } });
        await addRectZone(roomId, { name: "Desk", sensorParticipation: { "sensor-a": true, "sensor-b": true }, geometry: { type: "regular", x: 600, y: 200, width: 300, height: 200 } });
        // Push
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.results).toHaveLength(2);
        (0, vitest_1.expect)(pushRes.body.results[0].ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.results[1].ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.allocationErrors).toEqual([]);
        // Verify MockWriteClient received zone writes for both sensors
        const numberCalls = app.writeClient.getCallsForService("number", "set_value");
        // With 2 zones per sensor × 2 sensors, each zone writes 5 values (beginX, endX, beginY, endY, offDelay)
        // Plus unused slot clearing (zone 3 and zone 4 get zeroed) → 4 values each
        // So: 2 sensors × (2 active zones × 5 values + 2 cleared zones × 4 values) = 2 × (10 + 8) = 36
        (0, vitest_1.expect)(numberCalls.length).toBeGreaterThanOrEqual(20); // At minimum: 2 zones × 2 sensors × 5 values
        // Check that zone 1 coordinates were written for sensor-a
        const sensorACalls = numberCalls.filter(c => c.data.entity_id.startsWith("number.living_room_ep_lite_zone_1_"));
        (0, vitest_1.expect)(sensorACalls.length).toBeGreaterThan(0);
        // Check that zone 1 coordinates were written for sensor-b
        const sensorBCalls = numberCalls.filter(c => c.data.entity_id.startsWith("number.bedroom_ep_lite_zone_1_"));
        (0, vitest_1.expect)(sensorBCalls.length).toBeGreaterThan(0);
        // Verify Zone 2 entities were also written (slot 2)
        const sensorAZone2Calls = numberCalls.filter(c => c.data.entity_id.startsWith("number.living_room_ep_lite_zone_2_"));
        (0, vitest_1.expect)(sensorAZone2Calls.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("returns allocation errors when a sensor is at capacity", async () => {
        seedAll(app);
        const roomId = await createPushRoom();
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        await discoverAndSave(app, "sensor-b", "bedroom_ep_lite");
        // EP Lite has maxZones=4, so create 5 zones all on sensor-a
        for (let i = 1; i <= 5; i++) {
            await addRectZone(roomId, {
                name: `Zone ${i}`,
                sensorParticipation: { "sensor-a": true, "sensor-b": false },
                geometry: { type: "regular", x: i * 100, y: 0, width: 80, height: 80 },
            });
        }
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        // Should have allocation errors for the 5th zone on sensor-a
        (0, vitest_1.expect)(pushRes.body.allocationErrors).toBeDefined();
        (0, vitest_1.expect)(pushRes.body.allocationErrors.length).toBe(1);
        (0, vitest_1.expect)(pushRes.body.allocationErrors[0].zoneName).toBe("Zone 5");
        (0, vitest_1.expect)(pushRes.body.allocationErrors[0].deviceId).toBe("sensor-a");
        (0, vitest_1.expect)(pushRes.body.allocationErrors[0].reason).toContain("capacity");
        // sensor-a should still succeed with 4 zones (the ones that fit)
        const sensorAResult = pushRes.body.results.find((r) => r.deviceId === "sensor-a");
        (0, vitest_1.expect)(sensorAResult.ok).toBe(true);
    });
    (0, vitest_1.it)("backward compat: room without namedZones uses legacy push flow", async () => {
        seedAll(app);
        // Create a room with legacy zones (no namedZones)
        const roomRes = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({
            name: "Legacy Room",
            sensors: [
                { deviceId: "sensor-a", profileId: PROFILE_ID, placement: placement0 },
            ],
        })
            .expect(200);
        const roomId = roomRes.body.room.id;
        // Set legacy zones
        await (0, supertest_1.default)(app.server)
            .put(`/api/rooms/${roomId}/zones`)
            .send({
            zones: [
                { id: "Zone 1", type: "regular", x: 100, y: 50, width: 200, height: 150 },
            ],
        })
            .expect(200);
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        // Push — should use legacy flow (no allocationErrors field)
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.results).toHaveLength(1);
        (0, vitest_1.expect)(pushRes.body.results[0].ok).toBe(true);
        // Legacy flow does not return allocationErrors
        (0, vitest_1.expect)(pushRes.body.allocationErrors).toBeUndefined();
        // Verify zone writes happened
        const numberCalls = app.writeClient.getCallsForService("number", "set_value");
        const zone1Calls = numberCalls.filter(c => c.data.entity_id.includes("zone_1_begin_x"));
        (0, vitest_1.expect)(zone1Calls.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("pushes mixed zone types (regular + exclusion) with correct slot prefixes", async () => {
        seedAll(app);
        const roomId = await createPushRoom();
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        await discoverAndSave(app, "sensor-b", "bedroom_ep_lite");
        // Create 1 regular + 1 exclusion zone on sensor-a only
        await addRectZone(roomId, {
            name: "Sofa",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: { type: "regular", x: 100, y: 100, width: 200, height: 200 },
        });
        await addRectZone(roomId, {
            name: "No Go Area",
            type: "exclusion",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: { type: "exclusion", x: 400, y: 400, width: 100, height: 100 },
        });
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.allocationErrors).toEqual([]);
        const numberCalls = app.writeClient.getCallsForService("number", "set_value");
        // Verify regular zone 1 was written (zone_1_begin_x)
        const regularZone1 = numberCalls.filter(c => c.data.entity_id.includes("living_room_ep_lite_zone_1_begin_x"));
        (0, vitest_1.expect)(regularZone1.length).toBe(1);
        (0, vitest_1.expect)(regularZone1[0].data.value).toBe(100); // x coordinate
        // Verify exclusion zone 1 was written (occupancy_mask_1_begin_x)
        const exclusionZone1 = numberCalls.filter(c => c.data.entity_id.includes("living_room_ep_lite_occupancy_mask_1_begin_x"));
        (0, vitest_1.expect)(exclusionZone1.length).toBe(1);
        (0, vitest_1.expect)(exclusionZone1[0].data.value).toBe(400); // x coordinate
    });
    (0, vitest_1.it)("pushes polygon geometry via applyPolygonZones with transformed vertices", async () => {
        seedAll(app);
        const roomId = await createPushRoom();
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        await discoverAndSave(app, "sensor-b", "bedroom_ep_lite");
        // Create a polygon zone on sensor-a only
        await addPolygonZone(roomId, {
            name: "Custom Area",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: {
                type: "regular",
                vertices: [
                    { x: 10, y: 20 },
                    { x: 110, y: 20 },
                    { x: 110, y: 120 },
                    { x: 10, y: 120 },
                ],
            },
        });
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
        (0, vitest_1.expect)(pushRes.body.allocationErrors).toEqual([]);
        // Polygon zones use setTextEntity, not setNumberEntity
        const textCalls = app.writeClient.getCallsForService("text", "set_value");
        // Should have written polygon_zone_1 for sensor-a
        const polyZone1Calls = textCalls.filter(c => c.data.entity_id.includes("living_room_ep_lite_polygon_zone_1"));
        (0, vitest_1.expect)(polyZone1Calls.length).toBe(1);
        // The value should be a text representation of the vertices
        (0, vitest_1.expect)(typeof polyZone1Calls[0].data.value).toBe("string");
        (0, vitest_1.expect)(polyZone1Calls[0].data.value.length).toBeGreaterThan(0);
        // sensor-b should have NO polygon writes (not participating)
        const sensorBPolyCalls = textCalls.filter(c => c.data.entity_id.includes("bedroom_ep_lite_polygon_zone_1") &&
            c.data.value.length > 0);
        (0, vitest_1.expect)(sensorBPolyCalls.length).toBe(0);
    });
    (0, vitest_1.it)("includes both rect and polygon results for mixed-geometry named zones", async () => {
        seedAll(app);
        const roomId = await createPushRoom();
        await discoverAndSave(app, "sensor-a", "living_room_ep_lite");
        // One rect zone + one polygon zone, both on sensor-a
        await addRectZone(roomId, {
            name: "Rect Zone",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: { type: "regular", x: 100, y: 100, width: 200, height: 200 },
        });
        await addPolygonZone(roomId, {
            name: "Poly Zone",
            type: "regular",
            sensorParticipation: { "sensor-a": true, "sensor-b": false },
            geometry: {
                type: "regular",
                vertices: [
                    { x: 400, y: 400 },
                    { x: 600, y: 400 },
                    { x: 600, y: 600 },
                    { x: 400, y: 600 },
                ],
            },
        });
        const pushRes = await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/zones/push`)
            .send({})
            .expect(200);
        (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
        // Verify rect writes happened
        const numberCalls = app.writeClient.getCallsForService("number", "set_value");
        const rectWrites = numberCalls.filter(c => c.data.entity_id.includes("living_room_ep_lite_zone_1_begin_x"));
        (0, vitest_1.expect)(rectWrites.length).toBe(1);
        // Verify polygon writes happened
        const textCalls = app.writeClient.getCallsForService("text", "set_value");
        const polyWrites = textCalls.filter(c => c.data.entity_id.includes("living_room_ep_lite_polygon_zone"));
        // At least one polygon zone was written (may include slot clearing)
        (0, vitest_1.expect)(polyWrites.length).toBeGreaterThan(0);
    });
});
