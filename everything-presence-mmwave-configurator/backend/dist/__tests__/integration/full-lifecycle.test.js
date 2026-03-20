"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
const mqttDiscovery_1 = require("../../domain/mqttDiscovery");
// ── EP Lite mock data helpers ───────────────────────────────────
const PROFILE_ID = "everything_presence_lite";
const APP_VERSION = "1.0.0-test";
/** Register a mock EP Lite device in the read transport */
function addDevice(app, id, name, esphomeName) {
    app.readTransport.addDevice({
        id,
        name,
        name_by_user: null,
        manufacturer: "EverythingSmartTechnology",
        model: "Everything Presence Lite",
        identifiers: [["esphome", esphomeName]],
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
        // Tracking targets (3 targets)
        ...[1, 2, 3].flatMap((t) => [
            { entity_id: `sensor.${name}_target_${t}_x`, name: `Target ${t} X`, platform: "esphome" },
            { entity_id: `sensor.${name}_target_${t}_y`, name: `Target ${t} Y`, platform: "esphome" },
            { entity_id: `sensor.${name}_target_${t}_speed`, name: `Target ${t} Speed`, platform: "esphome" },
            { entity_id: `sensor.${name}_target_${t}_distance`, name: `Target ${t} Distance`, platform: "esphome" },
            { entity_id: `sensor.${name}_target_${t}_angle`, name: `Target ${t} Angle`, platform: "esphome" },
            { entity_id: `sensor.${name}_target_${t}_resolution`, name: `Target ${t} Resolution`, platform: "esphome" },
            { entity_id: `binary_sensor.${name}_target_${t}_active`, name: `Target ${t} Active`, platform: "esphome" },
        ]),
        // Zone coordinate entities (2 zones)
        ...[1, 2].flatMap((z) => [
            { entity_id: `number.${name}_zone_${z}_begin_x`, name: `Zone ${z} Begin X`, platform: "esphome" },
            { entity_id: `number.${name}_zone_${z}_end_x`, name: `Zone ${z} End X`, platform: "esphome" },
            { entity_id: `number.${name}_zone_${z}_begin_y`, name: `Zone ${z} Begin Y`, platform: "esphome" },
            { entity_id: `number.${name}_zone_${z}_end_y`, name: `Zone ${z} End Y`, platform: "esphome" },
            { entity_id: `binary_sensor.${name}_zone_${z}_occupancy`, name: `Zone ${z} Occupancy`, platform: "esphome" },
            { entity_id: `sensor.${name}_zone_${z}_target_count`, name: `Zone ${z} Target Count`, platform: "esphome" },
        ]),
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
}
// ── 3 sensor definitions ────────────────────────────────────────
const sensors = [
    {
        id: "mock_ep_lite_1",
        name: "Living Room EP Lite",
        esphome: "living_room_ep_lite",
        placement: { x: 0, y: 0, rotationDeg: 0, installationAngle: 0 },
        label: "Sensor A",
    },
    {
        id: "mock_ep_lite_2",
        name: "Bedroom EP Lite",
        esphome: "bedroom_ep_lite",
        placement: { x: 300, y: 0, rotationDeg: 90, installationAngle: 0 },
        label: "Sensor B",
    },
    {
        id: "mock_ep_lite_3",
        name: "Kitchen EP Lite",
        esphome: "kitchen_ep_lite",
        placement: { x: 150, y: 300, rotationDeg: 180, installationAngle: 15 },
        label: "Sensor C",
    },
];
/** Seed all 3 mock EP Lite devices with full registry + state data */
function seedAll(app) {
    for (const s of sensors) {
        addDevice(app, s.id, s.name, s.esphome);
        seedEntityRegistry(app, s.id, s.esphome);
        seedStates(app, s.esphome);
    }
}
// ── Test helpers ────────────────────────────────────────────────
async function createRoom(app, name = "Lifecycle Test Room") {
    const res = await (0, supertest_1.default)(app.server)
        .post("/api/rooms")
        .send({ name })
        .expect(200);
    return res.body.room.id;
}
async function addSensor(app, roomId, sensorDef) {
    return (0, supertest_1.default)(app.server)
        .post(`/api/rooms/${roomId}/sensors`)
        .send({
        deviceId: sensorDef.id,
        profileId: PROFILE_ID,
        placement: sensorDef.placement,
        label: sensorDef.label,
    })
        .expect(200);
}
async function discoverAndSave(app, deviceId, deviceName) {
    return (0, supertest_1.default)(app.server)
        .post(`/api/devices/${deviceId}/discover-and-save`)
        .send({
        profileId: PROFILE_ID,
        deviceName,
    })
        .expect(200);
}
async function getRoom(app, roomId) {
    const res = await (0, supertest_1.default)(app.server)
        .get(`/api/rooms/${roomId}`)
        .expect(200);
    return res.body.room;
}
// ── Main test suite ─────────────────────────────────────────────
(0, vitest_1.describe)("Full 3-sensor room lifecycle with MQTT", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = await (0, testApp_1.createTestApp)({ withMqttClient: true });
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.afterEach)(() => {
        (0, tempStorage_1.resetStorage)();
        app.mqttClient.reset();
        // Reset transport data without clearing subscriptions
        const rt = app.readTransport;
        rt.devices = [];
        rt.entities = [];
        rt.areas = [];
        rt.states.clear();
        rt.services.clear();
        app.writeClient.reset();
    });
    // ── Main lifecycle sequence ─────────────────────────────────
    (0, vitest_1.describe)("full lifecycle sequence", () => {
        (0, vitest_1.it)("creates room and adds 3 sensors", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            const room = await getRoom(app, roomId);
            (0, vitest_1.expect)(room.sensors).toHaveLength(3);
            const deviceIds = room.sensors.map((s) => s.deviceId).sort();
            (0, vitest_1.expect)(deviceIds).toEqual(["mock_ep_lite_1", "mock_ep_lite_2", "mock_ep_lite_3"]);
            // Verify placements are stored correctly
            const s3 = room.sensors.find((s) => s.deviceId === "mock_ep_lite_3");
            (0, vitest_1.expect)(s3.placement.x).toBe(150);
            (0, vitest_1.expect)(s3.placement.y).toBe(300);
            (0, vitest_1.expect)(s3.placement.rotationDeg).toBe(180);
            (0, vitest_1.expect)(s3.placement.installationAngle).toBe(15);
            (0, vitest_1.expect)(s3.label).toBe("Sensor C");
        });
        (0, vitest_1.it)("publishes MQTT room device discovery with sensor_count=3", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            // Publish MQTT room device discovery
            const room = await getRoom(app, roomId);
            await (0, mqttDiscovery_1.publishRoomDevice)(room, app.mqttClient, APP_VERSION);
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            const publishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(publishes).toHaveLength(1);
            (0, vitest_1.expect)(publishes[0].options?.retain).toBe(true);
            const payload = JSON.parse(publishes[0].payload);
            (0, vitest_1.expect)(payload.dev.name).toBe(`Room: ${room.name}`);
            (0, vitest_1.expect)(payload.dev.ids).toContain(`ep_room_${roomId}`);
            (0, vitest_1.expect)(payload.cmps.sensor_count).toBeDefined();
            // Check sensor_count state was published
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const sensorCountPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(sensorCountPublishes.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(sensorCountPublishes[0].payload).toBe("3");
            (0, vitest_1.expect)(sensorCountPublishes[0].options?.retain).toBe(true);
            // Check availability is "online"
            const availTopic = `ep_room/${roomId}/availability`;
            const availPublishes = app.mqttClient.getPublishesForTopic(availTopic);
            (0, vitest_1.expect)(availPublishes).toHaveLength(1);
            (0, vitest_1.expect)(availPublishes[0].payload).toBe("online");
        });
        (0, vitest_1.it)("runs entity discovery for all 3 sensors", async () => {
            seedAll(app);
            for (const s of sensors) {
                const res = await discoverAndSave(app, s.id, s.esphome);
                (0, vitest_1.expect)(res.body.mapping).toBeDefined();
                (0, vitest_1.expect)(res.body.mapping.deviceId).toBe(s.id);
                (0, vitest_1.expect)(res.body.mapping.profileId).toBe(PROFILE_ID);
                (0, vitest_1.expect)(res.body.mapping.autoMatchedCount).toBeGreaterThan(0);
                // Check zone coordinate entities were discovered
                (0, vitest_1.expect)(res.body.mapping.mappings).toHaveProperty("zone1BeginX");
                (0, vitest_1.expect)(res.body.mapping.mappings.zone1BeginX).toBe(`number.${s.esphome}_zone_1_begin_x`);
            }
        });
        (0, vitest_1.it)("creates named zones with sensor participation", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            // Create zone 1 — all 3 sensors participate
            const zone1Res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Main Area",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 0, y: 0, width: 200, height: 150 },
            })
                .expect(201);
            (0, vitest_1.expect)(zone1Res.body.zone.name).toBe("Main Area");
            (0, vitest_1.expect)(zone1Res.body.zone.sensorParticipation).toEqual({
                mock_ep_lite_1: true,
                mock_ep_lite_2: true,
                mock_ep_lite_3: true,
            });
            // Create zone 2 — only sensors 1 and 2 participate
            const zone2Res = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Reading Nook",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: false,
                },
                geometry: { type: "regular", x: 200, y: 100, width: 100, height: 100 },
            })
                .expect(201);
            (0, vitest_1.expect)(zone2Res.body.zone.name).toBe("Reading Nook");
            // Verify room has both named zones
            const room = await getRoom(app, roomId);
            (0, vitest_1.expect)(room.namedZones).toHaveLength(2);
        });
        (0, vitest_1.it)("pushes named zones to participating sensors via zone push", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
                await discoverAndSave(app, s.id, s.esphome);
            }
            // Create a named zone with all 3 sensors participating
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Full Room",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 50, y: 50, width: 200, height: 150 },
            })
                .expect(201);
            // Push zones
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(3);
            (0, vitest_1.expect)(pushRes.body.results.every((r) => r.ok)).toBe(true);
            // Verify MockWriteClient received zone writes for all 3 sensors
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            const sensor1Calls = numberCalls.filter((c) => c.data.entity_id.includes("living_room_ep_lite"));
            const sensor2Calls = numberCalls.filter((c) => c.data.entity_id.includes("bedroom_ep_lite"));
            const sensor3Calls = numberCalls.filter((c) => c.data.entity_id.includes("kitchen_ep_lite"));
            (0, vitest_1.expect)(sensor1Calls.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(sensor2Calls.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(sensor3Calls.length).toBeGreaterThan(0);
            // Verify coordinates differ between sensors (different placements)
            const s1BeginX = sensor1Calls.find((c) => c.data.entity_id === "number.living_room_ep_lite_zone_1_begin_x");
            const s3BeginX = sensor3Calls.find((c) => c.data.entity_id === "number.kitchen_ep_lite_zone_1_begin_x");
            (0, vitest_1.expect)(s1BeginX).toBeDefined();
            (0, vitest_1.expect)(s3BeginX).toBeDefined();
            // Sensor 1 at (0,0) rot 0° vs sensor 3 at (150,300) rot 195° → very different coords
            (0, vitest_1.expect)(s1BeginX.data.value).not.toBe(s3BeginX.data.value);
        });
        (0, vitest_1.it)("removes sensor 3 — strips participation and updates MQTT sensor_count", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            // Publish MQTT room device so we can verify state updates
            const roomBefore = await getRoom(app, roomId);
            await (0, mqttDiscovery_1.publishRoomDevice)(roomBefore, app.mqttClient, APP_VERSION);
            app.mqttClient.reset(); // Clear setup publishes
            // Create named zones referencing all 3 sensors
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Kitchen Zone",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 0, y: 0, width: 100, height: 100 },
            })
                .expect(201);
            // Remove sensor 3
            const deleteRes = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/mock_ep_lite_3`)
                .expect(200);
            (0, vitest_1.expect)(deleteRes.body.room.sensors).toHaveLength(2);
            const remainingIds = deleteRes.body.room.sensors.map((s) => s.deviceId).sort();
            (0, vitest_1.expect)(remainingIds).toEqual(["mock_ep_lite_1", "mock_ep_lite_2"]);
            // Give async fire-and-forget a tick to settle
            await new Promise((r) => setTimeout(r, 50));
            // Verify zone participation was stripped of sensor 3
            const room = await getRoom(app, roomId);
            const zone = room.namedZones[0];
            (0, vitest_1.expect)(zone.sensorParticipation).not.toHaveProperty("mock_ep_lite_3");
            (0, vitest_1.expect)(zone.sensorParticipation).toHaveProperty("mock_ep_lite_1");
            (0, vitest_1.expect)(zone.sensorParticipation).toHaveProperty("mock_ep_lite_2");
            // Verify MQTT sensor_count was updated to 2
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const sensorCountPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(sensorCountPublishes.length).toBeGreaterThanOrEqual(1);
            const lastCountPublish = sensorCountPublishes[sensorCountPublishes.length - 1];
            (0, vitest_1.expect)(lastCountPublish.payload).toBe("2");
            (0, vitest_1.expect)(lastCountPublish.options?.retain).toBe(true);
        });
        (0, vitest_1.it)("deletes room — publishes empty MQTT discovery payload", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            app.mqttClient.reset();
            // Delete the room
            const deleteRes = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);
            (0, vitest_1.expect)(deleteRes.body.ok).toBe(true);
            await new Promise((r) => setTimeout(r, 50));
            // Verify empty MQTT discovery payload published (device removal)
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            const publishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(publishes.length).toBeGreaterThanOrEqual(1);
            const removal = publishes[publishes.length - 1];
            (0, vitest_1.expect)(removal.payload).toBe("");
            (0, vitest_1.expect)(removal.options?.retain).toBe(true);
            // Verify room is actually gone
            await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(404);
        });
        (0, vitest_1.it)("complete lifecycle: create → 3 sensors → MQTT → zones → push → remove sensor → delete room", async () => {
            seedAll(app);
            // Step 1: Create room
            const roomId = await createRoom(app, "Full Lifecycle Room");
            // Step 2: Add all 3 sensors
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            let room = await getRoom(app, roomId);
            (0, vitest_1.expect)(room.sensors).toHaveLength(3);
            // Step 3: Publish MQTT room device
            await (0, mqttDiscovery_1.publishRoomDevice)(room, app.mqttClient, APP_VERSION);
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            let discoveryPublishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(discoveryPublishes).toHaveLength(1);
            const payload = JSON.parse(discoveryPublishes[0].payload);
            (0, vitest_1.expect)(payload.dev.name).toBe("Room: Full Lifecycle Room");
            // Step 4: Run entity discovery for all sensors
            for (const s of sensors) {
                const res = await discoverAndSave(app, s.id, s.esphome);
                (0, vitest_1.expect)(res.body.mapping.autoMatchedCount).toBeGreaterThan(10);
            }
            // Step 5: Create 2 named zones
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Living Area",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 0, y: 0, width: 200, height: 150 },
            })
                .expect(201);
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Dining Area",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: false,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 200, y: 100, width: 150, height: 200 },
            })
                .expect(201);
            room = await getRoom(app, roomId);
            (0, vitest_1.expect)(room.namedZones).toHaveLength(2);
            // Step 6: Push zones to all sensors
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            (0, vitest_1.expect)(pushRes.body.ok).toBe(true);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(3);
            // Verify all sensors got zone writes
            const numberCalls = app.writeClient.getCallsForService("number", "set_value");
            for (const s of sensors) {
                const calls = numberCalls.filter((c) => c.data.entity_id.includes(s.esphome));
                (0, vitest_1.expect)(calls.length).toBeGreaterThan(0);
            }
            // Step 7: Remove sensor 3
            app.mqttClient.reset();
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/mock_ep_lite_3`)
                .expect(200);
            await new Promise((r) => setTimeout(r, 50));
            // Verify sensor_count updated to 2
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            let countPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(countPublishes.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(countPublishes[countPublishes.length - 1].payload).toBe("2");
            // Verify zone participation cleanup
            room = await getRoom(app, roomId);
            (0, vitest_1.expect)(room.sensors).toHaveLength(2);
            for (const zone of room.namedZones) {
                (0, vitest_1.expect)(zone.sensorParticipation).not.toHaveProperty("mock_ep_lite_3");
            }
            // Step 8: Delete room
            app.mqttClient.reset();
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);
            await new Promise((r) => setTimeout(r, 50));
            // Verify empty discovery payload (device removal)
            discoveryPublishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(discoveryPublishes.length).toBeGreaterThanOrEqual(1);
            const removalMsg = discoveryPublishes[discoveryPublishes.length - 1];
            (0, vitest_1.expect)(removalMsg.payload).toBe("");
            (0, vitest_1.expect)(removalMsg.options?.retain).toBe(true);
            // Room should be gone
            await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(404);
        });
    });
    // ── Edge cases ──────────────────────────────────────────────
    (0, vitest_1.describe)("edge cases", () => {
        (0, vitest_1.it)("create room with MQTT → delete immediately (no zones, no extra sensors)", async () => {
            const roomId = await createRoom(app, "Ephemeral Room");
            const room = await getRoom(app, roomId);
            // Publish MQTT discovery
            await (0, mqttDiscovery_1.publishRoomDevice)(room, app.mqttClient, APP_VERSION);
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            let publishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(publishes).toHaveLength(1);
            (0, vitest_1.expect)(JSON.parse(publishes[0].payload).dev.name).toBe("Room: Ephemeral Room");
            // Delete immediately
            app.mqttClient.reset();
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);
            await new Promise((r) => setTimeout(r, 50));
            // MQTT cleanup should still work
            publishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(publishes.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(publishes[publishes.length - 1].payload).toBe("");
            (0, vitest_1.expect)(publishes[publishes.length - 1].options?.retain).toBe(true);
        });
        (0, vitest_1.it)("sensor removal from room with no named zones — clean operation", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, sensors[0]);
            await addSensor(app, roomId, sensors[1]);
            // Publish MQTT device
            const room = await getRoom(app, roomId);
            await (0, mqttDiscovery_1.publishRoomDevice)(room, app.mqttClient, APP_VERSION);
            app.mqttClient.reset();
            // Remove sensor without any named zones existing
            const res = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/mock_ep_lite_1`)
                .expect(200);
            (0, vitest_1.expect)(res.body.room.sensors).toHaveLength(1);
            (0, vitest_1.expect)(res.body.room.sensors[0].deviceId).toBe("mock_ep_lite_2");
            // namedZones should be undefined (never set)
            (0, vitest_1.expect)(res.body.room.namedZones).toBeUndefined();
            await new Promise((r) => setTimeout(r, 50));
            // MQTT sensor_count updated to 1
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const countPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(countPublishes.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(countPublishes[countPublishes.length - 1].payload).toBe("1");
        });
        (0, vitest_1.it)("room with all sensors removed → MQTT sensor_count = 0", async () => {
            seedAll(app);
            const roomId = await createRoom(app);
            await addSensor(app, roomId, sensors[0]);
            await addSensor(app, roomId, sensors[1]);
            await addSensor(app, roomId, sensors[2]);
            // Publish MQTT device
            const room = await getRoom(app, roomId);
            await (0, mqttDiscovery_1.publishRoomDevice)(room, app.mqttClient, APP_VERSION);
            app.mqttClient.reset();
            // Remove all 3 sensors
            for (const s of sensors) {
                await (0, supertest_1.default)(app.server)
                    .delete(`/api/rooms/${roomId}/sensors/${s.id}`)
                    .expect(200);
            }
            await new Promise((r) => setTimeout(r, 50));
            // MQTT sensor_count should be 0
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const countPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(countPublishes.length).toBeGreaterThanOrEqual(1);
            const lastPublish = countPublishes[countPublishes.length - 1];
            (0, vitest_1.expect)(lastPublish.payload).toBe("0");
            (0, vitest_1.expect)(lastPublish.options?.retain).toBe(true);
            // Room should still exist but with empty sensors
            const updatedRoom = await getRoom(app, roomId);
            (0, vitest_1.expect)(updatedRoom.sensors).toEqual([]);
        });
        (0, vitest_1.it)("zone push with 3 sensors — only 2 have discovery — reports failure for unmapped sensor", async () => {
            // Only seed sensors 1 and 2 in read transport — sensor 3 has NO device
            // data at all, so neither entityNamePrefix nor device mapping exists
            for (const s of [sensors[0], sensors[1]]) {
                addDevice(app, s.id, s.name, s.esphome);
                seedEntityRegistry(app, s.id, s.esphome);
                seedStates(app, s.esphome);
            }
            const roomId = await createRoom(app);
            for (const s of sensors) {
                await addSensor(app, roomId, s);
            }
            // Only run discovery for sensors 1 and 2
            await discoverAndSave(app, sensors[0].id, sensors[0].esphome);
            await discoverAndSave(app, sensors[1].id, sensors[1].esphome);
            // Sensor 3 has NO discovery AND no device in transport
            // Create named zone
            await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/named-zones`)
                .send({
                name: "Partial Zone",
                type: "regular",
                sensorParticipation: {
                    mock_ep_lite_1: true,
                    mock_ep_lite_2: true,
                    mock_ep_lite_3: true,
                },
                geometry: { type: "regular", x: 0, y: 0, width: 100, height: 100 },
            })
                .expect(201);
            // Push zones — sensor 3 should fail (no discovery, no entity prefix)
            const pushRes = await (0, supertest_1.default)(app.server)
                .post(`/api/rooms/${roomId}/zones/push`)
                .send({})
                .expect(200);
            // Overall ok=false since one sensor failed
            (0, vitest_1.expect)(pushRes.body.ok).toBe(false);
            (0, vitest_1.expect)(pushRes.body.results).toHaveLength(3);
            const s1Result = pushRes.body.results.find((r) => r.deviceId === "mock_ep_lite_1");
            const s2Result = pushRes.body.results.find((r) => r.deviceId === "mock_ep_lite_2");
            const s3Result = pushRes.body.results.find((r) => r.deviceId === "mock_ep_lite_3");
            (0, vitest_1.expect)(s1Result.ok).toBe(true);
            (0, vitest_1.expect)(s2Result.ok).toBe(true);
            (0, vitest_1.expect)(s3Result.ok).toBe(false);
            (0, vitest_1.expect)(s3Result.error).toBeDefined();
        });
    });
});
