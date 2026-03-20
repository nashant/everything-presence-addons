"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pino_1 = __importDefault(require("pino"));
const haHelperApi_1 = require("../../ha/haHelperApi");
const aggregationService_1 = require("../../domain/aggregationService");
const silentLogger = (0, pino_1.default)({ level: "silent" });
const BASE_URL = "http://localhost:8123";
const TOKEN = "test-token";
// ── Helpers ──────────────────────────────────────────────────────
function createApi() {
    return new haHelperApi_1.HaHelperApi({ baseUrl: BASE_URL, token: TOKEN, logger: silentLogger });
}
/** Build a mock fetch that returns sequential responses */
function mockFetchSequence(responses) {
    let callIndex = 0;
    const calls = [];
    const mock = vitest_1.vi.fn(async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        const response = responses[callIndex];
        if (!response) {
            throw new Error(`Unexpected fetch call #${callIndex + 1}: ${String(url)}`);
        }
        callIndex++;
        return {
            ok: response.ok,
            status: response.status ?? (response.ok ? 200 : 500),
            json: async () => response.body,
            text: async () => typeof response.body === "string"
                ? response.body
                : JSON.stringify(response.body),
        };
    });
    return { mock, calls };
}
/** Minimal device profile with zone entities */
function makeProfile(id, limits) {
    return {
        id,
        label: id,
        manufacturer: "EP",
        capabilities: {},
        limits,
        entities: {
            zone1Occupancy: {
                template: "binary_sensor.${name}_zone_1_occupancy",
                category: "sensor",
                subcategory: "zoneOccupancy",
                required: false,
                zoneIndex: 1,
            },
            zone2Occupancy: {
                template: "binary_sensor.${name}_zone_2_occupancy",
                category: "sensor",
                subcategory: "zoneOccupancy",
                required: false,
                zoneIndex: 2,
            },
            zone1TargetCount: {
                template: "sensor.${name}_zone_1_target_count",
                category: "sensor",
                subcategory: "zoneTargetCount",
                required: false,
                zoneIndex: 1,
            },
            zone2TargetCount: {
                template: "sensor.${name}_zone_2_target_count",
                category: "sensor",
                subcategory: "zoneTargetCount",
                required: false,
                zoneIndex: 2,
            },
        },
        entityMap: {},
    };
}
/** Create a DeviceMapping for tests */
function makeMapping(deviceId, overrides = {}) {
    return {
        deviceId,
        profileId: "ep_lite",
        deviceName: `Sensor ${deviceId}`,
        esphomeNodeName: `sensor_${deviceId.replace(/-/g, "_")}`,
        discoveredAt: "2026-01-01T00:00:00Z",
        lastUpdated: "2026-01-01T00:00:00Z",
        confirmedByUser: true,
        autoMatchedCount: 5,
        manuallyMappedCount: 0,
        mappings: {
            presence: `binary_sensor.sensor_${deviceId}_occupancy`,
            trackingTargetCount: `sensor.sensor_${deviceId}_target_count`,
            zone1Occupancy: `binary_sensor.sensor_${deviceId}_zone_1_occupancy`,
            zone2Occupancy: `binary_sensor.sensor_${deviceId}_zone_2_occupancy`,
            zone1TargetCount: `sensor.sensor_${deviceId}_zone_1_target_count`,
            zone2TargetCount: `sensor.sensor_${deviceId}_zone_2_target_count`,
        },
        unmappedEntities: [],
        ...overrides,
    };
}
/** Standard 2-sensor room config */
function makeRoom(overrides = {}) {
    return {
        id: "room-1",
        name: "Living Room",
        units: "metric",
        zones: [],
        sensors: [
            { deviceId: "dev-a", profileId: "ep_lite", placement: { x: 0, y: 0 } },
            { deviceId: "dev-b", profileId: "ep_lite", placement: { x: 3000, y: 0 } },
        ],
        namedZones: [
            {
                id: "zone-couch",
                name: "Couch",
                type: "regular",
                sensorParticipation: { "dev-a": true, "dev-b": true },
                geometry: { id: "zone-couch", type: "regular", x: 0, y: 0, width: 1500, height: 1500 },
            },
            {
                id: "zone-tv",
                name: "TV Area",
                type: "regular",
                sensorParticipation: { "dev-a": true, "dev-b": true },
                geometry: { id: "zone-tv", type: "regular", x: 1500, y: 0, width: 1500, height: 1500 },
            },
        ],
        ...overrides,
    };
}
/** Default aggregation config */
const DEFAULT_CONFIG = {
    presenceMode: "any",
    tieBreaker: "occupied",
    environmentalMethod: "average",
};
/** The profile used by both sensors */
const EP_LITE_PROFILE = makeProfile("ep_lite", {
    maxZones: 4,
    maxExclusionZones: 2,
    maxEntryZones: 2,
});
/** Profile loader mock */
function makeProfileLoader(profiles = [EP_LITE_PROFILE]) {
    return {
        listProfiles: () => profiles,
        getProfileById: (id) => profiles.find((p) => p.id === id),
    };
}
/** Build standard create→attach flow responses for N helpers */
function createHelperResponses(count, startIdx = 1) {
    const responses = [];
    for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        // create: 3 calls (init, menu, form)
        responses.push({ ok: true, body: { flow_id: `create-${idx}`, type: "menu" } }, { ok: true, body: { flow_id: `create-${idx}`, type: "form" } }, {
            ok: true,
            body: {
                flow_id: `create-${idx}`,
                type: "create_entry",
                result: { config_entry_id: `entry-${idx}` },
            },
        });
        // attach: 2 calls (init options, submit)
        responses.push({ ok: true, body: { flow_id: `opt-${idx}`, type: "form" } }, { ok: true, body: { flow_id: `opt-${idx}`, type: "create_entry" } });
    }
    return responses;
}
/** Device registry response containing our MQTT device */
const DEVICE_REGISTRY_RESPONSE = [
    {
        id: "ha-device-123",
        identifiers: [["mqtt", "ep_room_living_room"]],
        name: "Living Room",
    },
    {
        id: "ha-device-other",
        identifiers: [["zwave", "node-5"]],
        name: "Other",
    },
];
/** Entity registry response */
function entityRegistryResponse(configEntryIds) {
    return configEntryIds.map((ceId, i) => ({
        entity_id: `binary_sensor.helper_${i + 1}`,
        config_entry_id: ceId,
    }));
}
/** Build a full reconcile mock sequence: delete stale → device lookup → create N helpers → entity lookup */
function buildReconcileMocks(opts) {
    const responses = [];
    // Delete stale helpers
    for (let i = 0; i < (opts.staleCount ?? 0); i++) {
        responses.push({ ok: true, body: { require_restart: false } });
    }
    // Device registry lookup
    responses.push({ ok: true, body: DEVICE_REGISTRY_RESPONSE });
    // Create helpers (5 calls each: init, menu, form, opt-init, opt-submit)
    responses.push(...createHelperResponses(opts.helperCount));
    // Entity registry lookup
    const ceIds = opts.configEntryIds ?? Array.from({ length: opts.helperCount }, (_, i) => `entry-${i + 1}`);
    responses.push({ ok: true, body: entityRegistryResponse(ceIds) });
    return responses;
}
/** Build service with standard deps */
function createService(mappings, api) {
    const haHelperApi = api ?? createApi();
    const service = new aggregationService_1.AggregationService({
        haHelperApi,
        profileLoader: makeProfileLoader(),
        logger: silentLogger,
        getDeviceMapping: (deviceId) => mappings[deviceId] ?? null,
    });
    return { service, api: haHelperApi };
}
// ── Tests ────────────────────────────────────────────────────────
(0, vitest_1.describe)("AggregationService", () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.describe)("reconcile: creates room occupancy helper for 2-sensor room (any mode)", () => {
        (0, vitest_1.it)("creates room-level occupancy template helper", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            // 0 stale, device lookup, 6 helpers (room occ, room tc, 2 zone occ, 2 zone tc), entity lookup
            const responses = buildReconcileMocks({ helperCount: 6 });
            const { mock, calls } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
            (0, vitest_1.expect)(result.created).toHaveLength(6);
            // Check that room occupancy helper was created
            const roomOcc = result.haEntities.templateHelpers?.find((h) => h.type === "room_occupancy");
            (0, vitest_1.expect)(roomOcc).toBeDefined();
            (0, vitest_1.expect)(roomOcc.configEntryId).toBe("entry-1");
        });
    });
    (0, vitest_1.describe)("reconcile: creates per-zone occupancy helpers using slot allocator assignments", () => {
        (0, vitest_1.it)("creates zone occupancy helpers for each named zone", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const responses = buildReconcileMocks({ helperCount: 6 });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            const zoneOccHelpers = result.haEntities.templateHelpers?.filter((h) => h.type === "zone_occupancy");
            (0, vitest_1.expect)(zoneOccHelpers).toHaveLength(2);
            (0, vitest_1.expect)(zoneOccHelpers[0].zoneId).toBe("zone-couch");
            (0, vitest_1.expect)(zoneOccHelpers[1].zoneId).toBe("zone-tv");
        });
    });
    (0, vitest_1.describe)("reconcile: creates environmental helpers for sensors with temperature/humidity", () => {
        (0, vitest_1.it)("creates environmental template helpers", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a", {
                    mappings: {
                        ...makeMapping("dev-a").mappings,
                        temperature: "sensor.sensor_dev_a_temperature",
                        humidity: "sensor.sensor_dev_a_humidity",
                    },
                }),
                "dev-b": makeMapping("dev-b", {
                    mappings: {
                        ...makeMapping("dev-b").mappings,
                        temperature: "sensor.sensor_dev_b_temperature",
                        humidity: "sensor.sensor_dev_b_humidity",
                    },
                }),
            };
            // 6 base + 2 environmental (temp + humidity) = 8 helpers
            const responses = buildReconcileMocks({ helperCount: 8 });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            const envHelpers = result.haEntities.templateHelpers?.filter((h) => h.type === "environmental");
            (0, vitest_1.expect)(envHelpers).toHaveLength(2);
            (0, vitest_1.expect)(envHelpers.map((h) => h.environmentalType).sort()).toEqual([
                "humidity",
                "temperature",
            ]);
        });
    });
    (0, vitest_1.describe)("reconcile: skips sensors without device mappings (partial discovery)", () => {
        (0, vitest_1.it)("creates helpers from only the mapped sensor", async () => {
            // Only dev-a has a mapping; dev-b does not
            const mappings = {
                "dev-a": makeMapping("dev-a"),
            };
            // Still creates helpers, but only from dev-a's entities
            // Room occupancy (1 presence), room tc (1 tc), 2 zone occ (1 each), 2 zone tc = 6
            const responses = buildReconcileMocks({ helperCount: 6 });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
            // Helpers are created from only the one mapped sensor
            (0, vitest_1.expect)(result.created.length).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)("reconcile: attaches all helpers to MQTT room device", () => {
        (0, vitest_1.it)("calls attachHelperToDevice for each created helper", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const responses = buildReconcileMocks({ helperCount: 6 });
            const { mock, calls } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            // Each helper = 3 create calls + 2 attach calls = 5 calls
            // Attach calls include device_id
            const attachCalls = calls.filter((c) => c.url.includes("/config/config_entries/options/flow") &&
                !c.url.includes("/config/config_entries/options/flow/"));
            // 6 helpers → 6 attach init calls
            (0, vitest_1.expect)(attachCalls).toHaveLength(6);
            // Check the submit calls contain device_id
            const attachSubmits = calls.filter((c) => c.url.includes("/config/config_entries/options/flow/opt-") &&
                c.init.body);
            for (const call of attachSubmits) {
                const body = JSON.parse(call.init.body);
                (0, vitest_1.expect)(body.device_id).toBe("ha-device-123");
            }
        });
    });
    (0, vitest_1.describe)("reconcile: tracks all created helpers in room.haEntities", () => {
        (0, vitest_1.it)("returns haEntities with all template helpers tracked", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const responses = buildReconcileMocks({ helperCount: 6 });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            const helpers = result.haEntities.templateHelpers;
            (0, vitest_1.expect)(helpers).toHaveLength(6);
            // Each helper should have configEntryId, entityId, and type
            for (const h of helpers) {
                (0, vitest_1.expect)(h.configEntryId).toBeTruthy();
                (0, vitest_1.expect)(h.entityId).toBeTruthy();
                (0, vitest_1.expect)(h.type).toBeTruthy();
            }
            // Check types distribution
            const types = helpers.map((h) => h.type);
            (0, vitest_1.expect)(types.filter((t) => t === "room_occupancy")).toHaveLength(1);
            (0, vitest_1.expect)(types.filter((t) => t === "room_target_count")).toHaveLength(1);
            (0, vitest_1.expect)(types.filter((t) => t === "zone_occupancy")).toHaveLength(2);
            (0, vitest_1.expect)(types.filter((t) => t === "zone_target_count")).toHaveLength(2);
            // mqttDeviceId should be set
            (0, vitest_1.expect)(result.haEntities.mqttDeviceId).toBe("ha-device-123");
            (0, vitest_1.expect)(result.haEntities.updatedAt).toBeTruthy();
        });
    });
    (0, vitest_1.describe)("reconcile: deletes stale helpers before creating new ones (idempotent)", () => {
        (0, vitest_1.it)("deletes existing helpers then creates fresh set", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            // Room has 2 existing stale helpers
            const room = makeRoom({
                haEntities: {
                    templateHelpers: [
                        { configEntryId: "old-entry-1", entityId: "binary_sensor.old_1", type: "room_occupancy" },
                        { configEntryId: "old-entry-2", entityId: "sensor.old_2", type: "room_target_count" },
                    ],
                },
            });
            // 2 delete + device lookup + 6 create + entity lookup
            const responses = buildReconcileMocks({ staleCount: 2, helperCount: 6 });
            const { mock, calls } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(room, DEFAULT_CONFIG, "ep_room_living_room");
            // First 2 calls should be DELETE for stale helpers
            (0, vitest_1.expect)(calls[0].init.method).toBe("DELETE");
            (0, vitest_1.expect)(calls[0].url).toContain("old-entry-1");
            (0, vitest_1.expect)(calls[1].init.method).toBe("DELETE");
            (0, vitest_1.expect)(calls[1].url).toContain("old-entry-2");
            (0, vitest_1.expect)(result.deleted).toEqual(["old-entry-1", "old-entry-2"]);
            (0, vitest_1.expect)(result.created).toHaveLength(6);
        });
    });
    (0, vitest_1.describe)("cleanup: deletes all tracked template helpers", () => {
        (0, vitest_1.it)("calls deleteTemplateHelper for each tracked helper", async () => {
            const room = makeRoom({
                haEntities: {
                    templateHelpers: [
                        { configEntryId: "entry-1", entityId: "binary_sensor.h1", type: "room_occupancy" },
                        { configEntryId: "entry-2", entityId: "sensor.h2", type: "room_target_count" },
                        { configEntryId: "entry-3", entityId: "binary_sensor.h3", type: "zone_occupancy", zoneId: "z1" },
                    ],
                },
            });
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { require_restart: false } },
                { ok: true, body: { require_restart: false } },
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService({});
            await service.cleanup(room);
            (0, vitest_1.expect)(calls).toHaveLength(3);
            (0, vitest_1.expect)(calls[0].init.method).toBe("DELETE");
            (0, vitest_1.expect)(calls[0].url).toContain("entry-1");
            (0, vitest_1.expect)(calls[1].url).toContain("entry-2");
            (0, vitest_1.expect)(calls[2].url).toContain("entry-3");
        });
    });
    (0, vitest_1.describe)("cleanup: handles missing configEntryIds gracefully (already deleted in HA)", () => {
        (0, vitest_1.it)("does not throw when delete returns 404", async () => {
            const room = makeRoom({
                haEntities: {
                    templateHelpers: [
                        { configEntryId: "gone-entry", entityId: "binary_sensor.gone", type: "room_occupancy" },
                        { configEntryId: "still-here", entityId: "sensor.still", type: "room_target_count" },
                    ],
                },
            });
            const { mock } = mockFetchSequence([
                { ok: false, status: 404, body: { message: "Not found" } },
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService({});
            // Should not throw
            await (0, vitest_1.expect)(service.cleanup(room)).resolves.toBeUndefined();
        });
    });
    (0, vitest_1.describe)("reconcile: returns structured result with created/deleted/errors", () => {
        (0, vitest_1.it)("ReconcileResult contains all tracking arrays", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const room = makeRoom({
                haEntities: {
                    templateHelpers: [
                        { configEntryId: "old-1", entityId: "binary_sensor.old", type: "room_occupancy" },
                    ],
                },
            });
            const responses = buildReconcileMocks({ staleCount: 1, helperCount: 6 });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(room, DEFAULT_CONFIG, "ep_room_living_room");
            // Structured result
            (0, vitest_1.expect)(result).toHaveProperty("haEntities");
            (0, vitest_1.expect)(result).toHaveProperty("created");
            (0, vitest_1.expect)(result).toHaveProperty("deleted");
            (0, vitest_1.expect)(result).toHaveProperty("errors");
            (0, vitest_1.expect)(result.deleted).toEqual(["old-1"]);
            (0, vitest_1.expect)(result.created).toHaveLength(6);
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)("reconcile: returns error when HA device ID lookup fails (MQTT device not yet discovered)", () => {
        (0, vitest_1.it)("returns error in ReconcileResult when device not found", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
            };
            // Device registry returns empty (MQTT device not yet discovered)
            const { mock } = mockFetchSequence([
                { ok: true, body: [] }, // empty device registry
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            (0, vitest_1.expect)(result.errors).toHaveLength(1);
            (0, vitest_1.expect)(result.errors[0].name).toBe("device_lookup");
            (0, vitest_1.expect)(result.errors[0].cause).toMatch(/not found/i);
            (0, vitest_1.expect)(result.created).toHaveLength(0);
            (0, vitest_1.expect)(result.haEntities.templateHelpers).toEqual([]);
        });
    });
    (0, vitest_1.describe)("reconcile: individual helper creation failure does not abort reconciliation", () => {
        (0, vitest_1.it)("continues creating other helpers when one fails", async () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const responses = [];
            // Device registry lookup
            responses.push({ ok: true, body: DEVICE_REGISTRY_RESPONSE });
            // Helper 1 (room occupancy): FAILS at init
            responses.push({ ok: false, status: 500, body: "Internal error" });
            // Helper 2 (room target count): succeeds
            responses.push({ ok: true, body: { flow_id: "create-2", type: "menu" } }, { ok: true, body: { flow_id: "create-2", type: "form" } }, { ok: true, body: { flow_id: "create-2", type: "create_entry", result: { config_entry_id: "entry-2" } } }, { ok: true, body: { flow_id: "opt-2", type: "form" } }, { ok: true, body: { flow_id: "opt-2", type: "create_entry" } });
            // Helpers 3-6: all succeed
            responses.push(...createHelperResponses(4, 3));
            // Entity registry lookup
            responses.push({
                ok: true,
                body: entityRegistryResponse(["entry-2", "entry-3", "entry-4", "entry-5", "entry-6"]),
            });
            const { mock } = mockFetchSequence(responses);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            // 1 failure + 5 successes
            (0, vitest_1.expect)(result.errors).toHaveLength(1);
            (0, vitest_1.expect)(result.errors[0].name).toBe("Living Room Occupancy");
            (0, vitest_1.expect)(result.created).toHaveLength(5);
            (0, vitest_1.expect)(result.haEntities.templateHelpers).toHaveLength(5);
        });
    });
    (0, vitest_1.describe)("reconcile: no sensors with mappings yields empty result", () => {
        (0, vitest_1.it)("returns empty helpers when no sensors have device mappings", async () => {
            // No mappings at all
            const mappings = {};
            const { mock } = mockFetchSequence([]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const { service } = createService(mappings);
            const result = await service.reconcile(makeRoom(), DEFAULT_CONFIG, "ep_room_living_room");
            (0, vitest_1.expect)(result.created).toHaveLength(0);
            (0, vitest_1.expect)(result.deleted).toHaveLength(0);
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
            (0, vitest_1.expect)(result.haEntities.templateHelpers).toEqual([]);
        });
    });
    (0, vitest_1.describe)("resolveEntityIds", () => {
        (0, vitest_1.it)("resolves zone entity IDs via device mapping keys", () => {
            const mappings = {
                "dev-a": makeMapping("dev-a"),
                "dev-b": makeMapping("dev-b"),
            };
            const { service } = createService(mappings);
            const room = makeRoom();
            // Manually compute slot assignments
            const getProfileLimits = (profileId) => EP_LITE_PROFILE.limits;
            const allocationResult = (0, slotAllocator_1.allocateSlots)(room.namedZones, room.sensors, getProfileLimits);
            const contributions = service.resolveEntityIds(room, allocationResult.assignments);
            (0, vitest_1.expect)(contributions).toHaveLength(2);
            // dev-a should have zone-couch mapped to slot 1, zone-tv mapped to slot 2
            const contribA = contributions.find((c) => c.deviceId === "dev-a");
            (0, vitest_1.expect)(contribA.presence).toBe("binary_sensor.sensor_dev-a_occupancy");
            (0, vitest_1.expect)(contribA.zoneOccupancy["zone-couch"]).toBe("binary_sensor.sensor_dev-a_zone_1_occupancy");
            (0, vitest_1.expect)(contribA.zoneOccupancy["zone-tv"]).toBe("binary_sensor.sensor_dev-a_zone_2_occupancy");
            (0, vitest_1.expect)(contribA.zoneTargetCount["zone-couch"]).toBe("sensor.sensor_dev-a_zone_1_target_count");
        });
    });
    (0, vitest_1.describe)("lookupHaDeviceId", () => {
        (0, vitest_1.it)("resolves MQTT identifier to HA device ID", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: DEVICE_REGISTRY_RESPONSE },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const result = await api.lookupHaDeviceId("ep_room_living_room");
            (0, vitest_1.expect)(result).toBe("ha-device-123");
        });
        (0, vitest_1.it)("returns null when MQTT identifier not found", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: DEVICE_REGISTRY_RESPONSE },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const result = await api.lookupHaDeviceId("nonexistent_device");
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)("lookupEntityIdsByConfigEntry", () => {
        (0, vitest_1.it)("maps configEntryId to entityId", async () => {
            const { mock } = mockFetchSequence([
                {
                    ok: true,
                    body: [
                        { entity_id: "binary_sensor.room_occ", config_entry_id: "entry-1" },
                        { entity_id: "sensor.room_tc", config_entry_id: "entry-2" },
                        { entity_id: "sensor.unrelated", config_entry_id: "other-entry" },
                    ],
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const result = await api.lookupEntityIdsByConfigEntry(["entry-1", "entry-2"]);
            (0, vitest_1.expect)(result).toEqual({
                "entry-1": "binary_sensor.room_occ",
                "entry-2": "sensor.room_tc",
            });
        });
        (0, vitest_1.it)("returns empty map for empty input", async () => {
            const api = createApi();
            // Should not even call fetch
            const result = await api.lookupEntityIdsByConfigEntry([]);
            (0, vitest_1.expect)(result).toEqual({});
        });
    });
});
// Import allocateSlots for the resolveEntityIds test
const slotAllocator_1 = require("../../domain/slotAllocator");
