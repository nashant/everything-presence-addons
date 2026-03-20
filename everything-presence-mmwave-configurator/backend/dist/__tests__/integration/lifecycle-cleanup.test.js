"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const testApp_1 = require("../helpers/testApp");
const tempStorage_1 = require("../helpers/tempStorage");
(0, vitest_1.describe)("Lifecycle cleanup (room & sensor deletion)", () => {
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
    });
    // ── Helpers ──────────────────────────────────────────────────────
    async function createRoom(name = "Test Room") {
        const res = await (0, supertest_1.default)(app.server)
            .post("/api/rooms")
            .send({ name })
            .expect(200);
        return res.body.room.id;
    }
    async function addSensor(roomId, deviceId) {
        return (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/sensors`)
            .send({ deviceId, profileId: "ep-pro", placement: { x: 0, y: 0 } })
            .expect(200);
    }
    async function addNamedZone(roomId, zone) {
        await (0, supertest_1.default)(app.server)
            .post(`/api/rooms/${roomId}/named-zones`)
            .send({
            id: zone.id,
            name: zone.name,
            type: "regular",
            sensorParticipation: zone.sensorParticipation,
            geometry: { id: zone.id, type: "regular", x: 0, y: 0, width: 100, height: 100 },
        })
            .expect(201);
    }
    // ── Room deletion ───────────────────────────────────────────────
    (0, vitest_1.describe)("room deletion", () => {
        (0, vitest_1.it)("publishes empty string to MQTT discovery topic with retain:true", async () => {
            const roomId = await createRoom("MQTT Cleanup Room");
            await (0, supertest_1.default)(app.server).delete(`/api/rooms/${roomId}`).expect(200);
            // Give async fire-and-forget a tick to settle
            await new Promise((r) => setTimeout(r, 50));
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            const publishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(publishes.length).toBeGreaterThanOrEqual(1);
            const removal = publishes[publishes.length - 1];
            (0, vitest_1.expect)(removal.payload).toBe("");
            (0, vitest_1.expect)(removal.options?.retain).toBe(true);
        });
        (0, vitest_1.it)("succeeds without crash when no MQTT client is available", async () => {
            // Create a separate app without MQTT
            const noMqttApp = await (0, testApp_1.createTestApp)({ withMqttClient: false });
            try {
                const res = await (0, supertest_1.default)(noMqttApp.server)
                    .post("/api/rooms")
                    .send({ name: "No MQTT Room" })
                    .expect(200);
                const roomId = res.body.room.id;
                await (0, supertest_1.default)(noMqttApp.server)
                    .delete(`/api/rooms/${roomId}`)
                    .expect(200);
            }
            finally {
                (0, tempStorage_1.resetStorage)();
                await noMqttApp.close();
            }
        });
    });
    // ── Sensor removal ──────────────────────────────────────────────
    (0, vitest_1.describe)("sensor removal", () => {
        (0, vitest_1.it)("updates MQTT sensor_count state", async () => {
            const roomId = await createRoom("Sensor Count Room");
            await addSensor(roomId, "sensor-a");
            await addSensor(roomId, "sensor-b");
            app.mqttClient.reset(); // Clear publishes from setup
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/sensor-a`)
                .expect(200);
            // Give async fire-and-forget a tick to settle
            await new Promise((r) => setTimeout(r, 50));
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const publishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(publishes.length).toBeGreaterThanOrEqual(1);
            const lastPublish = publishes[publishes.length - 1];
            (0, vitest_1.expect)(lastPublish.payload).toBe("1"); // 2 sensors → 1 after removal
            (0, vitest_1.expect)(lastPublish.options?.retain).toBe(true);
        });
        (0, vitest_1.it)("strips removed deviceId from namedZones[].sensorParticipation", async () => {
            const roomId = await createRoom("Zone Participation Room");
            await addSensor(roomId, "sensor-a");
            await addSensor(roomId, "sensor-b");
            // Add named zones that reference both sensors
            await addNamedZone(roomId, {
                id: "zone-1",
                name: "Kitchen",
                sensorParticipation: { "sensor-a": true, "sensor-b": true },
            });
            await addNamedZone(roomId, {
                id: "zone-2",
                name: "Living",
                sensorParticipation: { "sensor-a": true, "sensor-b": false },
            });
            // Remove sensor-a
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/sensor-a`)
                .expect(200);
            // Fetch the room to verify persisted state
            const getRes = await (0, supertest_1.default)(app.server)
                .get(`/api/rooms/${roomId}`)
                .expect(200);
            const updatedRoom = getRes.body.room;
            (0, vitest_1.expect)(updatedRoom.namedZones).toBeDefined();
            (0, vitest_1.expect)(updatedRoom.namedZones).toHaveLength(2);
            const kitchen = updatedRoom.namedZones.find((z) => z.name === "Kitchen");
            const living = updatedRoom.namedZones.find((z) => z.name === "Living");
            // sensor-a should be gone from both zones
            (0, vitest_1.expect)(kitchen.sensorParticipation).toEqual({ "sensor-b": true });
            (0, vitest_1.expect)(living.sensorParticipation).toEqual({ "sensor-b": false });
        });
        (0, vitest_1.it)("succeeds cleanly when room has no named zones", async () => {
            const roomId = await createRoom("No Zones Room");
            await addSensor(roomId, "sensor-a");
            const res = await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/sensor-a`)
                .expect(200);
            (0, vitest_1.expect)(res.body.room.sensors).toEqual([]);
            // namedZones should be undefined (never set)
            (0, vitest_1.expect)(res.body.room.namedZones).toBeUndefined();
        });
    });
    // ── Combined lifecycle ───────────────────────────────────────────
    (0, vitest_1.describe)("combined lifecycle", () => {
        (0, vitest_1.it)("room deletion after sensor removal completes full cleanup", async () => {
            const roomId = await createRoom("Full Lifecycle Room");
            await addSensor(roomId, "sensor-a");
            await addSensor(roomId, "sensor-b");
            app.mqttClient.reset();
            // Step 1: Remove one sensor
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}/sensors/sensor-a`)
                .expect(200);
            // Step 2: Delete the room
            await (0, supertest_1.default)(app.server)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);
            await new Promise((r) => setTimeout(r, 50));
            // Verify: sensor_count was updated (from removal) AND discovery topic was cleared (from deletion)
            const sensorCountTopic = `ep_room/${roomId}/sensor_count/state`;
            const sensorCountPublishes = app.mqttClient.getPublishesForTopic(sensorCountTopic);
            (0, vitest_1.expect)(sensorCountPublishes.length).toBeGreaterThanOrEqual(1);
            const discoveryTopic = `homeassistant/device/ep_room_${roomId}/config`;
            const discoveryPublishes = app.mqttClient.getPublishesForTopic(discoveryTopic);
            (0, vitest_1.expect)(discoveryPublishes.length).toBeGreaterThanOrEqual(1);
            const lastDiscovery = discoveryPublishes[discoveryPublishes.length - 1];
            (0, vitest_1.expect)(lastDiscovery.payload).toBe("");
            (0, vitest_1.expect)(lastDiscovery.options?.retain).toBe(true);
        });
    });
});
