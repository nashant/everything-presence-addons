"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mockMqttClient_1 = require("../helpers/mockMqttClient");
const mqttDiscovery_1 = require("../../domain/mqttDiscovery");
// ── Test fixtures ────────────────────────────────────────────────────
function makeRoom(overrides) {
    return {
        id: "abc-123-def",
        name: "Living Room",
        units: "metric",
        zones: [],
        sensors: [
            {
                deviceId: "sensor-1",
                profileId: "everything_presence_lite",
                placement: { x: 0, y: 0 },
            },
            {
                deviceId: "sensor-2",
                profileId: "everything_presence_one",
                placement: { x: 1000, y: 0 },
            },
        ],
        ...overrides,
    };
}
const TEST_VERSION = "2.0.12";
// ── Tests ────────────────────────────────────────────────────────────
(0, vitest_1.describe)("buildRoomDevicePayload", () => {
    const room = makeRoom();
    (0, vitest_1.it)("returns correct device identity (identifiers, name, manufacturer, model, sw)", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(payload.dev.ids).toEqual(["ep_room_abc-123-def"]);
        (0, vitest_1.expect)(payload.dev.name).toBe("Room: Living Room");
        (0, vitest_1.expect)(payload.dev.mf).toBe("Everything Presence");
        (0, vitest_1.expect)(payload.dev.mdl).toBe("Room Aggregation");
        (0, vitest_1.expect)(payload.dev.sw).toBe(TEST_VERSION);
    });
    (0, vitest_1.it)("includes origin block", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(payload.o).toEqual({
            name: "EP Configurator",
            sw: TEST_VERSION,
            url: "https://everythingpresence.com",
        });
    });
    (0, vitest_1.it)("does NOT include occupancy component (now a template helper)", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(payload.cmps.occupancy).toBeUndefined();
    });
    (0, vitest_1.it)("does NOT include target_count component (now a template helper)", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(payload.cmps.target_count).toBeUndefined();
    });
    (0, vitest_1.it)("includes exactly 6 components (config + diagnostic, no aggregation placeholders)", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(Object.keys(payload.cmps)).toHaveLength(6);
        (0, vitest_1.expect)(Object.keys(payload.cmps).sort()).toEqual([
            "co2_mode",
            "humidity_mode",
            "lux_mode",
            "presence_mode",
            "sensor_count",
            "temperature_mode",
        ]);
    });
    (0, vitest_1.it)("includes sensor_count component with entity_category diagnostic", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        const sc = payload.cmps.sensor_count;
        (0, vitest_1.expect)(sc).toBeDefined();
        (0, vitest_1.expect)(sc.p).toBe("sensor");
        (0, vitest_1.expect)(sc.entity_category).toBe("diagnostic");
        (0, vitest_1.expect)(sc.name).toBe("Sensor Count");
    });
    (0, vitest_1.it)("includes mode components (presence, temp, humidity, co2, lux) with entity_category config", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        for (const key of [
            "presence_mode",
            "temperature_mode",
            "humidity_mode",
            "co2_mode",
            "lux_mode",
        ]) {
            const cmp = payload.cmps[key];
            (0, vitest_1.expect)(cmp, `component ${key} should exist`).toBeDefined();
            (0, vitest_1.expect)(cmp.p).toBe("sensor");
            (0, vitest_1.expect)(cmp.entity_category).toBe("config");
        }
    });
    (0, vitest_1.it)("all components have correct state topics under ep_room/{roomId}/", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        for (const [key, cmp] of Object.entries(payload.cmps)) {
            (0, vitest_1.expect)(cmp.stat_t).toBe(`ep_room/abc-123-def/${key}/state`);
        }
    });
    (0, vitest_1.it)("includes availability topic", () => {
        const payload = (0, mqttDiscovery_1.buildRoomDevicePayload)(room, TEST_VERSION);
        (0, vitest_1.expect)(payload.avty).toEqual([
            { topic: "ep_room/abc-123-def/availability" },
        ]);
    });
});
(0, vitest_1.describe)("buildInitialStates", () => {
    (0, vitest_1.it)("returns sensor_count matching room.sensors.length", () => {
        const room = makeRoom();
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(states.sensor_count).toBe("2");
    });
    (0, vitest_1.it)("returns sensor_count 0 when sensors is undefined", () => {
        const room = makeRoom({ sensors: undefined });
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(states.sensor_count).toBe("0");
    });
    (0, vitest_1.it)('returns mode defaults ("any" for presence, "average" for environmental)', () => {
        const room = makeRoom();
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(states.presence_mode).toBe("any");
        (0, vitest_1.expect)(states.temperature_mode).toBe("average");
        (0, vitest_1.expect)(states.humidity_mode).toBe("average");
        (0, vitest_1.expect)(states.co2_mode).toBe("average");
        (0, vitest_1.expect)(states.lux_mode).toBe("average");
    });
    (0, vitest_1.it)("returns configured mode values from metadata", () => {
        const room = makeRoom({
            metadata: {
                presence_mode: "majority",
                temperature_mode: "min",
                humidity_mode: "max",
            },
        });
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(states.presence_mode).toBe("majority");
        (0, vitest_1.expect)(states.temperature_mode).toBe("min");
        (0, vitest_1.expect)(states.humidity_mode).toBe("max");
        // Unconfigured still get defaults
        (0, vitest_1.expect)(states.co2_mode).toBe("average");
        (0, vitest_1.expect)(states.lux_mode).toBe("average");
    });
    (0, vitest_1.it)("does NOT include occupancy or target_count (now template helpers)", () => {
        const room = makeRoom();
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(states.occupancy).toBeUndefined();
        (0, vitest_1.expect)(states.target_count).toBeUndefined();
    });
    (0, vitest_1.it)("returns exactly 6 state keys (config + diagnostic, no aggregation placeholders)", () => {
        const room = makeRoom();
        const states = (0, mqttDiscovery_1.buildInitialStates)(room);
        (0, vitest_1.expect)(Object.keys(states)).toHaveLength(6);
        (0, vitest_1.expect)(Object.keys(states).sort()).toEqual([
            "co2_mode",
            "humidity_mode",
            "lux_mode",
            "presence_mode",
            "sensor_count",
            "temperature_mode",
        ]);
    });
});
(0, vitest_1.describe)("publishRoomDevice", () => {
    let mockClient;
    (0, vitest_1.beforeEach)(() => {
        mockClient = new mockMqttClient_1.MockMqttClient();
    });
    (0, vitest_1.it)("publishes discovery to correct topic with retain:true", async () => {
        const room = makeRoom();
        await (0, mqttDiscovery_1.publishRoomDevice)(room, mockClient, TEST_VERSION);
        const discoveryPublishes = mockClient.getPublishesForTopic("homeassistant/device/ep_room_abc-123-def/config");
        (0, vitest_1.expect)(discoveryPublishes).toHaveLength(1);
        (0, vitest_1.expect)(discoveryPublishes[0].options?.retain).toBe(true);
        // Verify payload is valid JSON with expected structure
        const payload = JSON.parse(discoveryPublishes[0].payload);
        (0, vitest_1.expect)(payload.dev.ids).toEqual(["ep_room_abc-123-def"]);
        (0, vitest_1.expect)(payload.cmps).toBeDefined();
    });
    (0, vitest_1.it)('publishes availability "online" with retain:true', async () => {
        const room = makeRoom();
        await (0, mqttDiscovery_1.publishRoomDevice)(room, mockClient, TEST_VERSION);
        const avtyPublishes = mockClient.getPublishesForTopic("ep_room/abc-123-def/availability");
        (0, vitest_1.expect)(avtyPublishes).toHaveLength(1);
        (0, vitest_1.expect)(avtyPublishes[0].payload).toBe("online");
        (0, vitest_1.expect)(avtyPublishes[0].options?.retain).toBe(true);
    });
    (0, vitest_1.it)("publishes all initial entity states with retain:true (6 states, no occupancy/target_count)", async () => {
        const room = makeRoom();
        await (0, mqttDiscovery_1.publishRoomDevice)(room, mockClient, TEST_VERSION);
        const expectedStateKeys = [
            "sensor_count",
            "presence_mode",
            "temperature_mode",
            "humidity_mode",
            "co2_mode",
            "lux_mode",
        ];
        for (const key of expectedStateKeys) {
            const publishes = mockClient.getPublishesForTopic(`ep_room/abc-123-def/${key}/state`);
            (0, vitest_1.expect)(publishes, `state for ${key} should be published`).toHaveLength(1);
            (0, vitest_1.expect)(publishes[0].options?.retain).toBe(true);
        }
        // Verify removed keys are NOT published
        for (const key of ["occupancy", "target_count"]) {
            const publishes = mockClient.getPublishesForTopic(`ep_room/abc-123-def/${key}/state`);
            (0, vitest_1.expect)(publishes, `state for ${key} should NOT be published`).toHaveLength(0);
        }
    });
    (0, vitest_1.it)("is no-op when client is null", async () => {
        const room = makeRoom();
        // Should not throw
        await (0, mqttDiscovery_1.publishRoomDevice)(room, null, TEST_VERSION);
    });
});
(0, vitest_1.describe)("updateRoomDeviceStates", () => {
    let mockClient;
    (0, vitest_1.beforeEach)(() => {
        mockClient = new mockMqttClient_1.MockMqttClient();
    });
    (0, vitest_1.it)("publishes only state values (no discovery republish)", async () => {
        const room = makeRoom();
        await (0, mqttDiscovery_1.updateRoomDeviceStates)(room, mockClient);
        // No discovery topic publish
        const discoveryPublishes = mockClient.getPublishesForTopic("homeassistant/device/ep_room_abc-123-def/config");
        (0, vitest_1.expect)(discoveryPublishes).toHaveLength(0);
        // State topics published (6 config/diagnostic entities, no occupancy/target_count)
        const statePublishes = mockClient.publishCalls.filter((c) => c.topic.startsWith("ep_room/abc-123-def/") && c.topic.endsWith("/state"));
        (0, vitest_1.expect)(statePublishes.length).toBe(6);
        // All retained
        for (const pub of statePublishes) {
            (0, vitest_1.expect)(pub.options?.retain).toBe(true);
        }
    });
    (0, vitest_1.it)("is no-op when client is null", async () => {
        const room = makeRoom();
        await (0, mqttDiscovery_1.updateRoomDeviceStates)(room, null);
    });
});
(0, vitest_1.describe)("removeRoomDevice", () => {
    let mockClient;
    (0, vitest_1.beforeEach)(() => {
        mockClient = new mockMqttClient_1.MockMqttClient();
    });
    (0, vitest_1.it)("publishes empty string to correct topic with retain:true", async () => {
        await (0, mqttDiscovery_1.removeRoomDevice)("abc-123-def", mockClient);
        const publishes = mockClient.getPublishesForTopic("homeassistant/device/ep_room_abc-123-def/config");
        (0, vitest_1.expect)(publishes).toHaveLength(1);
        (0, vitest_1.expect)(publishes[0].payload).toBe("");
        (0, vitest_1.expect)(publishes[0].options?.retain).toBe(true);
    });
    (0, vitest_1.it)("is no-op when client is null", async () => {
        await (0, mqttDiscovery_1.removeRoomDevice)("abc-123-def", null);
    });
});
