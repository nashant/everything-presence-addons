"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const ws_1 = __importDefault(require("ws"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
const coordinateTransform_1 = require("../../domain/coordinateTransform");
// ── EP Lite mock data helpers ───────────────────────────────────
const PROFILE_ID = "everything_presence_lite";
/** Device registry entries for two EP Lite devices */
function seedDevices(app) {
    app.readTransport.addDevice({
        id: "mock_ep_lite_1",
        name: "Living Room EP Lite",
        name_by_user: null,
        manufacturer: "EverythingSmartTechnology",
        model: "Everything Presence Lite",
        identifiers: [["esphome", "living_room_ep_lite"]],
        sw_version: "1.4.1 (ESPHome 2025.11.2)",
        hw_version: null,
        serial_number: null,
        area_id: null,
        disabled_by: null,
        config_entries: [],
    });
    app.readTransport.addDevice({
        id: "mock_ep_lite_2",
        name: "Bedroom EP Lite",
        name_by_user: null,
        manufacturer: "EverythingSmartTechnology",
        model: "Everything Presence Lite",
        identifiers: [["esphome", "bedroom_ep_lite"]],
        sw_version: "1.4.1 (ESPHome 2025.11.2)",
        hw_version: null,
        serial_number: null,
        area_id: null,
        disabled_by: null,
        config_entries: [],
    });
}
/** Seed entity registry entries for a single EP Lite device */
function seedEntityRegistry(app, deviceId, name) {
    const entities = [
        // Core sensors
        { entity_id: `binary_sensor.${name}_occupancy`, name: "Occupancy", platform: "esphome" },
        { entity_id: `sensor.${name}_co2`, name: "CO2", platform: "esphome" },
        // Tracking targets
        { entity_id: `sensor.${name}_target_1_x`, name: "Target 1 X", platform: "esphome" },
        { entity_id: `sensor.${name}_target_1_y`, name: "Target 1 Y", platform: "esphome" },
        { entity_id: `sensor.${name}_target_1_speed`, name: "Target 1 Speed", platform: "esphome" },
        { entity_id: `sensor.${name}_target_1_distance`, name: "Target 1 Distance", platform: "esphome" },
        { entity_id: `sensor.${name}_target_1_angle`, name: "Target 1 Angle", platform: "esphome" },
        { entity_id: `sensor.${name}_target_1_resolution`, name: "Target 1 Resolution", platform: "esphome" },
        { entity_id: `binary_sensor.${name}_target_1_active`, name: "Target 1 Active", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_x`, name: "Target 2 X", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_y`, name: "Target 2 Y", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_speed`, name: "Target 2 Speed", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_distance`, name: "Target 2 Distance", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_angle`, name: "Target 2 Angle", platform: "esphome" },
        { entity_id: `sensor.${name}_target_2_resolution`, name: "Target 2 Resolution", platform: "esphome" },
        { entity_id: `binary_sensor.${name}_target_2_active`, name: "Target 2 Active", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_x`, name: "Target 3 X", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_y`, name: "Target 3 Y", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_speed`, name: "Target 3 Speed", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_distance`, name: "Target 3 Distance", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_angle`, name: "Target 3 Angle", platform: "esphome" },
        { entity_id: `sensor.${name}_target_3_resolution`, name: "Target 3 Resolution", platform: "esphome" },
        { entity_id: `binary_sensor.${name}_target_3_active`, name: "Target 3 Active", platform: "esphome" },
        // Zone coordinate entities (4 zones)
        { entity_id: `number.${name}_zone_1_begin_x`, name: "Zone 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_end_x`, name: "Zone 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_begin_y`, name: "Zone 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_1_end_y`, name: "Zone 1 End Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_begin_x`, name: "Zone 2 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_end_x`, name: "Zone 2 End X", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_begin_y`, name: "Zone 2 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_zone_2_end_y`, name: "Zone 2 End Y", platform: "esphome" },
        // Occupancy/target count per zone
        { entity_id: `binary_sensor.${name}_zone_1_occupancy`, name: "Zone 1 Occupancy", platform: "esphome" },
        { entity_id: `sensor.${name}_zone_1_target_count`, name: "Zone 1 Target Count", platform: "esphome" },
        { entity_id: `binary_sensor.${name}_zone_2_occupancy`, name: "Zone 2 Occupancy", platform: "esphome" },
        { entity_id: `sensor.${name}_zone_2_target_count`, name: "Zone 2 Target Count", platform: "esphome" },
        // Settings
        { entity_id: `number.${name}_max_distance`, name: "Max Distance", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_off_delay`, name: "Occupancy Off Delay", platform: "esphome" },
        { entity_id: `number.${name}_installation_angle`, name: "Installation Angle", platform: "esphome" },
        { entity_id: `switch.${name}_polygon_zones`, name: "Polygon Zones", platform: "esphome" },
        // Polygon zone text entities
        { entity_id: `text.${name}_polygon_zone_1`, name: "Polygon Zone 1", platform: "esphome" },
        { entity_id: `text.${name}_polygon_zone_2`, name: "Polygon Zone 2", platform: "esphome" },
        // Exclusion zone entities
        { entity_id: `number.${name}_occupancy_mask_1_begin_x`, name: "Exclusion 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_end_x`, name: "Exclusion 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_begin_y`, name: "Exclusion 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_occupancy_mask_1_end_y`, name: "Exclusion 1 End Y", platform: "esphome" },
        // Entry zone entities
        { entity_id: `number.${name}_entry_zone_1_begin_x`, name: "Entry 1 Begin X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_end_x`, name: "Entry 1 End X", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_begin_y`, name: "Entry 1 Begin Y", platform: "esphome" },
        { entity_id: `number.${name}_entry_zone_1_end_y`, name: "Entry 1 End Y", platform: "esphome" },
        // Firmware update
        { entity_id: `update.${name}_everything_presence_lite_firmware`, name: "Firmware Update", platform: "esphome" },
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
/** Seed initial states for tracking entities */
function seedStates(app, name) {
    app.readTransport.setState(`binary_sensor.${name}_occupancy`, {
        entity_id: `binary_sensor.${name}_occupancy`,
        state: "on",
        attributes: { friendly_name: `${name} Occupancy` },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
    });
    app.readTransport.setState(`sensor.${name}_target_1_x`, {
        entity_id: `sensor.${name}_target_1_x`,
        state: "150",
        attributes: { unit_of_measurement: "cm" },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
    });
    app.readTransport.setState(`sensor.${name}_target_1_y`, {
        entity_id: `sensor.${name}_target_1_y`,
        state: "200",
        attributes: { unit_of_measurement: "cm" },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
    });
    app.readTransport.setState(`sensor.${name}_zone_1_target_count`, {
        entity_id: `sensor.${name}_zone_1_target_count`,
        state: "1",
        attributes: {},
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
    });
}
/** Seed both mock EP Lite devices with all registry + state data */
function seedAll(app) {
    seedDevices(app);
    seedEntityRegistry(app, "mock_ep_lite_1", "living_room_ep_lite");
    seedEntityRegistry(app, "mock_ep_lite_2", "bedroom_ep_lite");
    seedStates(app, "living_room_ep_lite");
    seedStates(app, "bedroom_ep_lite");
}
// ── Test helpers ────────────────────────────────────────────────
/** Create a room and return its ID */
async function createRoom(app, name = "Multi-Sensor Room") {
    const res = await (0, supertest_1.default)(app.server)
        .post("/api/rooms")
        .send({ name })
        .expect(200);
    return res.body.room.id;
}
/** Add a sensor to a room */
async function addSensor(app, roomId, deviceId, placement, label) {
    return (0, supertest_1.default)(app.server)
        .post(`/api/rooms/${roomId}/sensors`)
        .send({
        deviceId,
        profileId: PROFILE_ID,
        placement,
        label,
    })
        .expect(200);
}
/** Run discover-and-save for a sensor */
async function discoverAndSave(app, deviceId, deviceName) {
    return (0, supertest_1.default)(app.server)
        .post(`/api/devices/${deviceId}/discover-and-save`)
        .send({
        profileId: PROFILE_ID,
        deviceName,
    })
        .expect(200);
}
/** Collect messages from a WebSocket with a timeout */
function collectWsMessages(ws, timeout = 500) {
    return new Promise((resolve) => {
        const messages = [];
        const handler = (data) => {
            try {
                messages.push(JSON.parse(data.toString()));
            }
            catch { /* ignore parse errors */ }
        };
        ws.on("message", handler);
        setTimeout(() => {
            ws.removeListener("message", handler);
            resolve(messages);
        }, timeout);
    });
}
// ── Main test suite ─────────────────────────────────────────────
(0, vitest_1.describe)("Multi-sensor E2E integration", () => {
    let app;
    // Two sensors with different placements
    const sensor1Placement = { x: 0, y: 0, rotationDeg: 0, installationAngle: 0 };
    const sensor2Placement = { x: 300, y: 200, rotationDeg: 90, installationAngle: 15 };
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
        // Reset transport data without clearing subscriptions.
        // readTransport.reset() would kill the WS server's global subscription
        // registered by createLiveWebSocketServer at startup.
        const rt = app.readTransport;
        rt.devices = [];
        rt.entities = [];
        rt.areas = [];
        rt.states.clear();
        rt.services.clear();
        app.writeClient.reset();
    });
    // ── 1. Room + sensor CRUD with entity discovery ────────────
    (0, vitest_1.describe)("Room + sensor CRUD with entity discovery", () => {
        (0, vitest_1.it)("creates a room, adds 2 sensors, and retrieves them with correct placements", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement, "Living Room Sensor");
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement, "Bedroom Sensor");
            const res = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const room = res.body.room;
            (0, vitest_1.expect)(room.sensors).toHaveLength(2);
            const s1 = room.sensors.find((s) => s.deviceId === "mock_ep_lite_1");
            const s2 = room.sensors.find((s) => s.deviceId === "mock_ep_lite_2");
            (0, vitest_1.expect)(s1).toBeDefined();
            (0, vitest_1.expect)(s1.placement.x).toBe(0);
            (0, vitest_1.expect)(s1.placement.y).toBe(0);
            (0, vitest_1.expect)(s1.placement.rotationDeg).toBe(0);
            (0, vitest_1.expect)(s1.placement.installationAngle).toBe(0);
            (0, vitest_1.expect)(s1.label).toBe("Living Room Sensor");
            (0, vitest_1.expect)(s1.profileId).toBe(PROFILE_ID);
            (0, vitest_1.expect)(s2).toBeDefined();
            (0, vitest_1.expect)(s2.placement.x).toBe(300);
            (0, vitest_1.expect)(s2.placement.y).toBe(200);
            (0, vitest_1.expect)(s2.placement.rotationDeg).toBe(90);
            (0, vitest_1.expect)(s2.placement.installationAngle).toBe(15);
            (0, vitest_1.expect)(s2.label).toBe("Bedroom Sensor");
        });
        (0, vitest_1.it)("discover-and-save creates device mappings for both sensors", async () => {
            seedAll(app);
            const disco1 = await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            (0, vitest_1.expect)(disco1.body.mapping).toBeDefined();
            (0, vitest_1.expect)(disco1.body.mapping.deviceId).toBe("mock_ep_lite_1");
            (0, vitest_1.expect)(disco1.body.mapping.profileId).toBe(PROFILE_ID);
            (0, vitest_1.expect)(disco1.body.mapping.autoMatchedCount).toBeGreaterThan(0);
            // Check zone coordinate entities were discovered
            (0, vitest_1.expect)(disco1.body.mapping.mappings).toHaveProperty("zone1BeginX");
            (0, vitest_1.expect)(disco1.body.mapping.mappings.zone1BeginX).toBe("number.living_room_ep_lite_zone_1_begin_x");
            const disco2 = await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            (0, vitest_1.expect)(disco2.body.mapping).toBeDefined();
            (0, vitest_1.expect)(disco2.body.mapping.deviceId).toBe("mock_ep_lite_2");
            (0, vitest_1.expect)(disco2.body.mapping.mappings).toHaveProperty("zone1BeginX");
            (0, vitest_1.expect)(disco2.body.mapping.mappings.zone1BeginX).toBe("number.bedroom_ep_lite_zone_1_begin_x");
        });
        (0, vitest_1.it)("discover-and-save includes tracking target entities", async () => {
            seedAll(app);
            const disco = await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            const mappings = disco.body.mapping.mappings;
            (0, vitest_1.expect)(mappings).toHaveProperty("target1X");
            (0, vitest_1.expect)(mappings.target1X).toBe("sensor.living_room_ep_lite_target_1_x");
            (0, vitest_1.expect)(mappings).toHaveProperty("target1Y");
            (0, vitest_1.expect)(mappings.target1Y).toBe("sensor.living_room_ep_lite_target_1_y");
            (0, vitest_1.expect)(mappings).toHaveProperty("target2X");
            (0, vitest_1.expect)(mappings.target2X).toBe("sensor.living_room_ep_lite_target_2_x");
        });
    });
    // ── 2. Zone push with coordinate transform assertions ──────
    (0, vitest_1.describe)("Zone push with coordinate transforms", () => {
        (0, vitest_1.it)("zone push fails when no device mapping exists (discovery not run)", async () => {
            // Don't seed "unmapped_device" in mock transport — no entityNamePrefix
            // will be found and no device mapping exists.
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "unmapped_device", sensor1Placement);
            // Set zones on the room
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/zones`)
                .send({
                zones: [
                    { id: "Zone 1", type: "regular", x: 100, y: 50, width: 200, height: 150 },
                ],
            })
                .expect(200);
            // Push without running discover-and-save first
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            // The push should report failure for the sensor (no mapping)
            (0, vitest_1.expect)(pushRes.body.ok).toBe(false);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(1);
            (0, vitest_1.expect)(pushRes.body.results[0].ok).toBe(false);
            (0, vitest_1.expect)(pushRes.body.results[0].error).toContain("entity discovery");
        });
        (0, vitest_1.it)("zone push transforms coordinates differently for 2 sensors with different placements", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            // Add both sensors with different placements
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement);
            // Run entity discovery for both
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            // Set a room-space zone
            const zoneX = 100;
            const zoneY = 50;
            const zoneW = 200;
            const zoneH = 150;
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/zones`)
                .send({
                zones: [
                    { id: "Zone 1", type: "regular", x: zoneX, y: zoneY, width: zoneW, height: zoneH },
                ],
            })
                .expect(200);
            // Push zones
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(2);
            (0, vitest_1.expect)(pushRes.body.results.every((r) => r.ok)).toBe(true);
            // Inspect MockWriteClient calls
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            (0, vitest_1.expect)(numberCalls.length).toBeGreaterThan(0);
            // Extract zone 1 begin_x values for both sensors
            const sensor1BeginX = numberCalls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_begin_x");
            const sensor2BeginX = numberCalls.find((c) => c.data.entity_id === "number.bedroom_ep_lite_zone_1_begin_x");
            (0, vitest_1.expect)(sensor1BeginX).toBeDefined();
            (0, vitest_1.expect)(sensor2BeginX).toBeDefined();
            // Sensor 1 has rotation 0° + installationAngle 0° → identity transform
            // For sensor1 (at origin with 0° rotation), device coords = room coords offset by placement
            // roomToDevice with placement {x:0, y:0, rotationDeg:0, installationAngle:0}
            // just returns the room coordinates as-is
            // Sensor 2 has rotation 90° + installationAngle 15° = 105° total
            // The zone corners will be transformed very differently
            // The values should differ between sensors since placements differ
            (0, vitest_1.expect)(sensor1BeginX.data.value).not.toBe(sensor2BeginX.data.value);
            // Verify specific transformed values using the same math as the production code
            // Sensor 1: placement (0,0), rotation 0° + installation 0° = 0°
            // Zone rect corners in room space: (100,50), (300,50), (300,200), (100,200)
            // transformZoneRectToDevice transforms corners then takes bounding box
            const corners = [
                { x: zoneX, y: zoneY },
                { x: zoneX + zoneW, y: zoneY },
                { x: zoneX + zoneW, y: zoneY + zoneH },
                { x: zoneX, y: zoneY + zoneH },
            ];
            // Calculate expected device-space coords for sensor 1
            const s1DeviceCorners = corners.map((c) => (0, coordinateTransform_1.roomToDevice)(c.x, c.y, sensor1Placement));
            const s1Xs = s1DeviceCorners.map((c) => c.x);
            const s1Ys = s1DeviceCorners.map((c) => c.y);
            const s1ExpectedBeginX = Math.min(...s1Xs);
            const s1ExpectedEndX = Math.max(...s1Xs);
            const s1ExpectedBeginY = Math.min(...s1Ys);
            const s1ExpectedEndY = Math.max(...s1Ys);
            // Calculate expected device-space coords for sensor 2
            const s2DeviceCorners = corners.map((c) => (0, coordinateTransform_1.roomToDevice)(c.x, c.y, sensor2Placement));
            const s2Xs = s2DeviceCorners.map((c) => c.x);
            const s2Ys = s2DeviceCorners.map((c) => c.y);
            const s2ExpectedBeginX = Math.min(...s2Xs);
            const s2ExpectedEndX = Math.max(...s2Xs);
            const s2ExpectedBeginY = Math.min(...s2Ys);
            const s2ExpectedEndY = Math.max(...s2Ys);
            // Verify sensor 1 coordinates match expected
            (0, vitest_1.expect)(sensor1BeginX.data.value).toBeCloseTo(s1ExpectedBeginX, 5);
            const sensor1EndX = numberCalls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_end_x");
            (0, vitest_1.expect)(sensor1EndX.data.value).toBeCloseTo(s1ExpectedEndX, 5);
            const sensor1BeginY = numberCalls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_begin_y");
            const sensor1EndY = numberCalls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_end_y");
            (0, vitest_1.expect)(sensor1BeginY.data.value).toBeCloseTo(s1ExpectedBeginY, 5);
            (0, vitest_1.expect)(sensor1EndY.data.value).toBeCloseTo(s1ExpectedEndY, 5);
            // Verify sensor 2 coordinates match expected (different from sensor 1)
            (0, vitest_1.expect)(sensor2BeginX.data.value).toBeCloseTo(s2ExpectedBeginX, 5);
            const sensor2EndX = numberCalls.find((c) => c.data.entity_id === "number.bedroom_ep_lite_zone_1_end_x");
            (0, vitest_1.expect)(sensor2EndX.data.value).toBeCloseTo(s2ExpectedEndX, 5);
            const sensor2BeginY = numberCalls.find((c) => c.data.entity_id === "number.bedroom_ep_lite_zone_1_begin_y");
            const sensor2EndY = numberCalls.find((c) => c.data.entity_id === "number.bedroom_ep_lite_zone_1_end_y");
            (0, vitest_1.expect)(sensor2BeginY.data.value).toBeCloseTo(s2ExpectedBeginY, 5);
            (0, vitest_1.expect)(sensor2EndY.data.value).toBeCloseTo(s2ExpectedEndY, 5);
            // Cross-check: sensor 2 bounding box should differ from sensor 1
            (0, vitest_1.expect)(s1ExpectedBeginX).not.toBeCloseTo(s2ExpectedBeginX, 1);
        });
        (0, vitest_1.it)("zone push to a single sensor via deviceIds filter", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement);
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/zones`)
                .send({
                zones: [
                    { id: "Zone 1", type: "regular", x: 50, y: 50, width: 100, height: 100 },
                ],
            })
                .expect(200);
            // Push only to sensor 1
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({ deviceIds: ["mock_ep_lite_1"] })
                .expect(200);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(1);
            (0, vitest_1.expect)(pushRes.body.results[0].deviceId).toBe("mock_ep_lite_1");
            (0, vitest_1.expect)(pushRes.body.results[0].ok).toBe(true);
            // Verify only sensor 1's entities were written
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            const sensor2Calls = numberCalls.filter((c) => c.data.entity_id.includes("bedroom_ep_lite"));
            (0, vitest_1.expect)(sensor2Calls).toHaveLength(0);
        });
        (0, vitest_1.it)("zone push clears unused zone slots", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            // Set only zone 1 (zone 2, 3, 4 should be cleared to 0)
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/zones`)
                .send({
                zones: [
                    { id: "Zone 1", type: "regular", x: 50, y: 50, width: 100, height: 100 },
                ],
            })
                .expect(200);
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            // Zone 2 slot should be cleared (set to 0)
            const zone2BeginX = numberCalls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_2_begin_x");
            (0, vitest_1.expect)(zone2BeginX).toBeDefined();
            (0, vitest_1.expect)(zone2BeginX.data.value).toBe(0);
        });
    });
    // ── 3. WebSocket subscribe_room flow ───────────────────────
    (0, vitest_1.describe)("WebSocket subscribe_room", () => {
        (0, vitest_1.it)("subscribe_room returns room_subscribed with both sensors", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement);
            // Run discovery so device mappings exist
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            const addr = app.server.address();
            const ws = new ws_1.default(`ws://127.0.0.1:${addr.port}/api/live/ws`);
            await new Promise((resolve, reject) => {
                ws.on("open", resolve);
                ws.on("error", reject);
            });
            try {
                // Send subscribe_room
                ws.send(JSON.stringify({ type: "subscribe_room", roomId }));
                const messages = await collectWsMessages(ws, 1000);
                // Filter for room_subscribed message
                const subscribed = messages.find((m) => m.type === "room_subscribed");
                (0, vitest_1.expect)(subscribed).toBeDefined();
                (0, vitest_1.expect)(subscribed.roomId).toBe(roomId);
                (0, vitest_1.expect)(subscribed.sensors).toHaveLength(2);
                // Both sensors should be represented
                const sensorIds = subscribed.sensors.map((s) => s.deviceId).sort();
                (0, vitest_1.expect)(sensorIds).toEqual(["mock_ep_lite_1", "mock_ep_lite_2"]);
                // Each sensor should have entity arrays
                for (const sensor of subscribed.sensors) {
                    (0, vitest_1.expect)(sensor.profileId).toBe(PROFILE_ID);
                    (0, vitest_1.expect)(sensor.entities.length).toBeGreaterThan(0);
                    (0, vitest_1.expect)(sensor.hasMappings).toBe(true);
                }
                // Initial states should include seeded states
                if (subscribed.initialStates) {
                    const keys = Object.keys(subscribed.initialStates);
                    (0, vitest_1.expect)(keys.length).toBeGreaterThan(0);
                }
            }
            finally {
                ws.close();
                // Wait for close to propagate
                await new Promise((r) => setTimeout(r, 100));
            }
        });
        (0, vitest_1.it)("state_update messages include correct deviceId", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement);
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            const addr = app.server.address();
            const ws = new ws_1.default(`ws://127.0.0.1:${addr.port}/api/live/ws`);
            await new Promise((resolve, reject) => {
                ws.on("open", resolve);
                ws.on("error", reject);
            });
            try {
                ws.send(JSON.stringify({ type: "subscribe_room", roomId }));
                // Wait for room_subscribed to arrive
                await new Promise((resolve) => {
                    const handler = (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === "room_subscribed") {
                            ws.removeListener("message", handler);
                            resolve();
                        }
                    };
                    ws.on("message", handler);
                });
                // Now trigger a state change for sensor 1's entity
                const stateUpdatePromise = new Promise((resolve) => {
                    const handler = (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === "state_update") {
                            ws.removeListener("message", handler);
                            resolve(msg);
                        }
                    };
                    ws.on("message", handler);
                });
                app.readTransport.setState("sensor.living_room_ep_lite_target_1_x", {
                    entity_id: "sensor.living_room_ep_lite_target_1_x",
                    state: "175",
                    attributes: { unit_of_measurement: "cm" },
                    last_changed: new Date().toISOString(),
                    last_updated: new Date().toISOString(),
                });
                const stateUpdate = await Promise.race([
                    stateUpdatePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error("state_update timed out")), 2000)),
                ]);
                (0, vitest_1.expect)(stateUpdate.type).toBe("state_update");
                (0, vitest_1.expect)(stateUpdate.deviceId).toBe("mock_ep_lite_1");
                (0, vitest_1.expect)(stateUpdate.entityId).toBe("sensor.living_room_ep_lite_target_1_x");
                (0, vitest_1.expect)(stateUpdate.state).toBe("175");
            }
            finally {
                ws.close();
                await new Promise((r) => setTimeout(r, 100));
            }
        });
        (0, vitest_1.it)("state_update for sensor 2 entity includes sensor 2 deviceId", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement);
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement);
            await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            const addr = app.server.address();
            const ws = new ws_1.default(`ws://127.0.0.1:${addr.port}/api/live/ws`);
            await new Promise((resolve, reject) => {
                ws.on("open", resolve);
                ws.on("error", reject);
            });
            try {
                ws.send(JSON.stringify({ type: "subscribe_room", roomId }));
                // Wait for room_subscribed
                await new Promise((resolve) => {
                    const handler = (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === "room_subscribed") {
                            ws.removeListener("message", handler);
                            resolve();
                        }
                    };
                    ws.on("message", handler);
                });
                const stateUpdatePromise = new Promise((resolve) => {
                    const handler = (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === "state_update") {
                            ws.removeListener("message", handler);
                            resolve(msg);
                        }
                    };
                    ws.on("message", handler);
                });
                // Fire state change for sensor 2's entity
                app.readTransport.setState("sensor.bedroom_ep_lite_target_1_x", {
                    entity_id: "sensor.bedroom_ep_lite_target_1_x",
                    state: "250",
                    attributes: { unit_of_measurement: "cm" },
                    last_changed: new Date().toISOString(),
                    last_updated: new Date().toISOString(),
                });
                const stateUpdate = await Promise.race([
                    stateUpdatePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error("state_update timed out")), 2000)),
                ]);
                (0, vitest_1.expect)(stateUpdate.type).toBe("state_update");
                (0, vitest_1.expect)(stateUpdate.deviceId).toBe("mock_ep_lite_2");
                (0, vitest_1.expect)(stateUpdate.entityId).toBe("sensor.bedroom_ep_lite_target_1_x");
                (0, vitest_1.expect)(stateUpdate.state).toBe("250");
            }
            finally {
                ws.close();
                await new Promise((r) => setTimeout(r, 100));
            }
        });
        (0, vitest_1.it)("subscribe_room with no sensors returns error", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            // Don't add any sensors
            const addr = app.server.address();
            const ws = new ws_1.default(`ws://127.0.0.1:${addr.port}/api/live/ws`);
            await new Promise((resolve, reject) => {
                ws.on("open", resolve);
                ws.on("error", reject);
            });
            try {
                ws.send(JSON.stringify({ type: "subscribe_room", roomId }));
                const messages = await collectWsMessages(ws, 500);
                const errorMsg = messages.find((m) => m.type === "error");
                (0, vitest_1.expect)(errorMsg).toBeDefined();
                (0, vitest_1.expect)(errorMsg.error).toContain("no sensors");
            }
            finally {
                ws.close();
                await new Promise((r) => setTimeout(r, 100));
            }
        });
        (0, vitest_1.it)("subscribe_room with invalid roomId returns error", async () => {
            const addr = app.server.address();
            const ws = new ws_1.default(`ws://127.0.0.1:${addr.port}/api/live/ws`);
            await new Promise((resolve, reject) => {
                ws.on("open", resolve);
                ws.on("error", reject);
            });
            try {
                ws.send(JSON.stringify({ type: "subscribe_room", roomId: "nonexistent-room" }));
                const messages = await collectWsMessages(ws, 500);
                const errorMsg = messages.find((m) => m.type === "error");
                (0, vitest_1.expect)(errorMsg).toBeDefined();
                (0, vitest_1.expect)(errorMsg.error).toContain("not found");
            }
            finally {
                ws.close();
                await new Promise((r) => setTimeout(r, 100));
            }
        });
    });
    // ── 4. Full lifecycle (end-to-end) ─────────────────────────
    (0, vitest_1.describe)("Full multi-sensor lifecycle", () => {
        (0, vitest_1.it)("complete flow: create room → add sensors → discover → set zones → push → verify transforms", async () => {
            seedAll(app);
            // Step 1: Create room
            const roomId = await createRoom(app, "E2E Test Room");
            // Step 2: Add 2 sensors with different placements
            await addSensor(app, roomId, "mock_ep_lite_1", sensor1Placement, "Sensor A");
            await addSensor(app, roomId, "mock_ep_lite_2", sensor2Placement, "Sensor B");
            // Step 3: Discover entities for both
            const disco1 = await discoverAndSave(app, "mock_ep_lite_1", "living_room_ep_lite");
            const disco2 = await discoverAndSave(app, "mock_ep_lite_2", "bedroom_ep_lite");
            (0, vitest_1.expect)(disco1.body.mapping.autoMatchedCount).toBeGreaterThan(10);
            (0, vitest_1.expect)(disco2.body.mapping.autoMatchedCount).toBeGreaterThan(10);
            // Step 4: Set zones
            await (0, supertest_1.default)(app.server)
                .put(`/api/rooms/${roomId}/zones`)
                .send({
                zones: [
                    { id: "Zone 1", type: "regular", x: 0, y: 0, width: 200, height: 100 },
                    { id: "Zone 2", type: "regular", x: 200, y: 100, width: 150, height: 200 },
                ],
            })
                .expect(200);
            // Step 5: Push zones to all sensors
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(2);
            // Step 6: Verify MockWriteClient received calls for both sensors
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            // Both sensors should have zone entities written
            const sensor1Calls = numberCalls.filter((c) => c.data.entity_id.includes("living_room_ep_lite"));
            const sensor2Calls = numberCalls.filter((c) => c.data.entity_id.includes("bedroom_ep_lite"));
            (0, vitest_1.expect)(sensor1Calls.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(sensor2Calls.length).toBeGreaterThan(0);
            // Zone 1 beginX for sensor 1 (identity transform) should be 0
            const s1z1beginX = sensor1Calls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_begin_x");
            (0, vitest_1.expect)(s1z1beginX).toBeDefined();
            (0, vitest_1.expect)(s1z1beginX.data.value).toBeCloseTo(0, 5);
            // Zone 1 for sensor 2 (rotated 105°) should be very different
            const s2z1beginX = sensor2Calls.find((c) => c.data.entity_id === "number.bedroom_ep_lite_zone_1_begin_x");
            (0, vitest_1.expect)(s2z1beginX).toBeDefined();
            (0, vitest_1.expect)(s2z1beginX.data.value).not.toBeCloseTo(0, 1);
        });
    });
});
