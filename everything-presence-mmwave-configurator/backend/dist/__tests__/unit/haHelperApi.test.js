"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pino_1 = __importDefault(require("pino"));
const haHelperApi_1 = require("../../ha/haHelperApi");
const silentLogger = (0, pino_1.default)({ level: "silent" });
const BASE_URL = "http://localhost:8123";
const TOKEN = "test-token-abc";
function createApi() {
    return new haHelperApi_1.HaHelperApi({
        baseUrl: BASE_URL,
        token: TOKEN,
        logger: silentLogger,
    });
}
// ── Helpers ──────────────────────────────────────────────────────────
/** Build a mock fetch that returns sequential responses for multiple calls */
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
// ── Tests ────────────────────────────────────────────────────────────
(0, vitest_1.describe)("HaHelperApi", () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.describe)("constructor", () => {
        (0, vitest_1.it)("strips trailing slashes from baseUrl", () => {
            const api = new haHelperApi_1.HaHelperApi({
                baseUrl: "http://localhost:8123///",
                token: TOKEN,
                logger: silentLogger,
            });
            // Verify via a call that the URL is correct
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            // Use deleteTemplateHelper as a simple single-call method
            api.deleteTemplateHelper("test-id").then(() => {
                (0, vitest_1.expect)(calls[0].url).toBe("http://localhost:8123/api/config/config_entries/entry/test-id");
            });
        });
    });
    (0, vitest_1.describe)("createTemplateHelper", () => {
        const params = {
            type: "binary_sensor",
            name: "Living Room Occupancy",
            state: "{{ states('binary_sensor.sensor1_occupancy') }}",
            deviceClass: "occupancy",
        };
        (0, vitest_1.it)("sends correct sequence of POST requests (init → menu → form)", async () => {
            const { mock, calls } = mockFetchSequence([
                // Step 1: init flow
                { ok: true, body: { flow_id: "flow-abc", type: "menu", step_id: "init" } },
                // Step 2: select entity type
                { ok: true, body: { flow_id: "flow-abc", type: "form", step_id: "binary_sensor" } },
                // Step 3: submit form → create_entry
                {
                    ok: true,
                    body: {
                        flow_id: "flow-abc",
                        type: "create_entry",
                        result: { config_entry_id: "entry-xyz" },
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.createTemplateHelper(params);
            (0, vitest_1.expect)(calls).toHaveLength(3);
            // Call 1: init flow
            (0, vitest_1.expect)(calls[0].url).toBe(`${BASE_URL}/api/config/config_entries/flow`);
            (0, vitest_1.expect)(JSON.parse(calls[0].init.body)).toEqual({
                handler: "template",
                show_advanced_options: true,
            });
            // Call 2: select entity type
            (0, vitest_1.expect)(calls[1].url).toBe(`${BASE_URL}/api/config/config_entries/flow/flow-abc`);
            (0, vitest_1.expect)(JSON.parse(calls[1].init.body)).toEqual({
                next_step_id: "binary_sensor",
            });
            // Call 3: submit form
            (0, vitest_1.expect)(calls[2].url).toBe(`${BASE_URL}/api/config/config_entries/flow/flow-abc`);
            (0, vitest_1.expect)(JSON.parse(calls[2].init.body)).toEqual({
                name: "Living Room Occupancy",
                state: "{{ states('binary_sensor.sensor1_occupancy') }}",
                device_class: "occupancy",
            });
        });
        (0, vitest_1.it)("includes Authorization header on all requests", async () => {
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { flow_id: "flow-1", type: "menu" } },
                { ok: true, body: { flow_id: "flow-1", type: "form" } },
                {
                    ok: true,
                    body: {
                        flow_id: "flow-1",
                        type: "create_entry",
                        result: { config_entry_id: "entry-1" },
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.createTemplateHelper(params);
            for (const call of calls) {
                const headers = call.init.headers;
                (0, vitest_1.expect)(headers.Authorization).toBe(`Bearer ${TOKEN}`);
            }
        });
        (0, vitest_1.it)("returns configEntryId from create_entry response", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: { flow_id: "f1", type: "menu" } },
                { ok: true, body: { flow_id: "f1", type: "form" } },
                {
                    ok: true,
                    body: {
                        flow_id: "f1",
                        type: "create_entry",
                        result: { config_entry_id: "cfg-entry-42" },
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const result = await api.createTemplateHelper(params);
            (0, vitest_1.expect)(result).toEqual({ configEntryId: "cfg-entry-42" });
        });
        (0, vitest_1.it)("omits device_class from form when not provided", async () => {
            const paramsNoClass = {
                type: "sensor",
                name: "Room Target Count",
                state: "{{ states('sensor.sensor1_target_count') | int }}",
            };
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { flow_id: "f2", type: "menu" } },
                { ok: true, body: { flow_id: "f2", type: "form" } },
                {
                    ok: true,
                    body: {
                        flow_id: "f2",
                        type: "create_entry",
                        result: { config_entry_id: "entry-2" },
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.createTemplateHelper(paramsNoClass);
            const formBody = JSON.parse(calls[2].init.body);
            (0, vitest_1.expect)(formBody).toEqual({
                name: "Room Target Count",
                state: "{{ states('sensor.sensor1_target_count') | int }}",
            });
            (0, vitest_1.expect)(formBody).not.toHaveProperty("device_class");
        });
        (0, vitest_1.it)("throws HaHelperApiError on non-200 response at init", async () => {
            const { mock } = mockFetchSequence([
                {
                    ok: false,
                    status: 400,
                    body: { message: "Invalid handler" },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const err = await api
                .createTemplateHelper(params)
                .catch((e) => e);
            (0, vitest_1.expect)(err).toBeInstanceOf(haHelperApi_1.HaHelperApiError);
            (0, vitest_1.expect)(err.status).toBe(400);
        });
        (0, vitest_1.it)("throws when flow is aborted at menu step", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: { flow_id: "f3", type: "menu" } },
                {
                    ok: true,
                    body: {
                        flow_id: "f3",
                        type: "abort",
                        step_id: "already_configured",
                        reason: "already_configured",
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const err = await api
                .createTemplateHelper(params)
                .catch((e) => e);
            (0, vitest_1.expect)(err).toBeInstanceOf(haHelperApi_1.HaHelperApiError);
            (0, vitest_1.expect)(err.message).toMatch(/aborted at menu step/);
        });
        (0, vitest_1.it)("throws when create_entry response is missing config_entry_id", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: { flow_id: "f4", type: "menu" } },
                { ok: true, body: { flow_id: "f4", type: "form" } },
                {
                    ok: true,
                    body: {
                        flow_id: "f4",
                        type: "create_entry",
                        result: {},
                    },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await (0, vitest_1.expect)(api.createTemplateHelper(params)).rejects.toThrow(/missing config_entry_id/);
        });
        (0, vitest_1.it)("throws on network error", async () => {
            const mock = vitest_1.vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await (0, vitest_1.expect)(api.createTemplateHelper(params)).rejects.toThrow(haHelperApi_1.HaHelperApiError);
            await (0, vitest_1.expect)(api.createTemplateHelper(params)).rejects.toMatchObject({
                status: 0,
            });
        });
    });
    (0, vitest_1.describe)("attachHelperToDevice", () => {
        (0, vitest_1.it)("sends correct POST to options flow init and submit with device_id", async () => {
            const { mock, calls } = mockFetchSequence([
                // Step 1: init options flow
                {
                    ok: true,
                    body: { flow_id: "opt-flow-1", type: "form", step_id: "init" },
                },
                // Step 2: submit with device_id
                {
                    ok: true,
                    body: { flow_id: "opt-flow-1", type: "create_entry" },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.attachHelperToDevice("config-entry-123", "device-456", "{{ states('binary_sensor.occupancy') }}");
            (0, vitest_1.expect)(calls).toHaveLength(2);
            // Call 1: init options flow
            (0, vitest_1.expect)(calls[0].url).toBe(`${BASE_URL}/api/config/config_entries/options/flow`);
            (0, vitest_1.expect)(JSON.parse(calls[0].init.body)).toEqual({
                handler: "config-entry-123",
            });
            // Call 2: submit with device_id
            (0, vitest_1.expect)(calls[1].url).toBe(`${BASE_URL}/api/config/config_entries/options/flow/opt-flow-1`);
            (0, vitest_1.expect)(JSON.parse(calls[1].init.body)).toEqual({
                state: "{{ states('binary_sensor.occupancy') }}",
                device_id: "device-456",
            });
        });
        (0, vitest_1.it)("includes Authorization header on all requests", async () => {
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { flow_id: "opt-2", type: "form" } },
                { ok: true, body: { flow_id: "opt-2", type: "create_entry" } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.attachHelperToDevice("entry-1", "dev-1", "{{ true }}");
            for (const call of calls) {
                const headers = call.init.headers;
                (0, vitest_1.expect)(headers.Authorization).toBe(`Bearer ${TOKEN}`);
            }
        });
        (0, vitest_1.it)("throws HaHelperApiError on non-200 response at init", async () => {
            const { mock } = mockFetchSequence([
                {
                    ok: false,
                    status: 404,
                    body: { message: "Config entry not found" },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            const err = await api
                .attachHelperToDevice("bad-entry", "dev-1", "{{ true }}")
                .catch((e) => e);
            (0, vitest_1.expect)(err).toBeInstanceOf(haHelperApi_1.HaHelperApiError);
            (0, vitest_1.expect)(err.status).toBe(404);
        });
        (0, vitest_1.it)("throws HaHelperApiError on non-200 response at submit", async () => {
            const { mock } = mockFetchSequence([
                { ok: true, body: { flow_id: "opt-3", type: "form" } },
                {
                    ok: false,
                    status: 500,
                    body: "Internal Server Error",
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await (0, vitest_1.expect)(api.attachHelperToDevice("entry-1", "dev-1", "{{ true }}")).rejects.toThrow(haHelperApi_1.HaHelperApiError);
        });
    });
    (0, vitest_1.describe)("deleteTemplateHelper", () => {
        (0, vitest_1.it)("sends DELETE to correct config entry URL", async () => {
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.deleteTemplateHelper("entry-to-delete");
            (0, vitest_1.expect)(calls).toHaveLength(1);
            (0, vitest_1.expect)(calls[0].url).toBe(`${BASE_URL}/api/config/config_entries/entry/entry-to-delete`);
            (0, vitest_1.expect)(calls[0].init.method).toBe("DELETE");
        });
        (0, vitest_1.it)("includes Authorization header", async () => {
            const { mock, calls } = mockFetchSequence([
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await api.deleteTemplateHelper("entry-1");
            const headers = calls[0].init.headers;
            (0, vitest_1.expect)(headers.Authorization).toBe(`Bearer ${TOKEN}`);
        });
        (0, vitest_1.it)("throws HaHelperApiError on non-200 response", async () => {
            const { mock } = mockFetchSequence([
                {
                    ok: false,
                    status: 404,
                    body: { message: "Entry not found" },
                },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            await (0, vitest_1.expect)(api.deleteTemplateHelper("bad-entry")).rejects.toThrow(haHelperApi_1.HaHelperApiError);
        });
    });
    (0, vitest_1.describe)("full lifecycle", () => {
        (0, vitest_1.it)("create → attach → delete completes successfully", async () => {
            const { mock, calls } = mockFetchSequence([
                // create: init
                { ok: true, body: { flow_id: "create-flow", type: "menu" } },
                // create: menu selection
                { ok: true, body: { flow_id: "create-flow", type: "form" } },
                // create: form submit → create_entry
                {
                    ok: true,
                    body: {
                        flow_id: "create-flow",
                        type: "create_entry",
                        result: { config_entry_id: "lifecycle-entry" },
                    },
                },
                // attach: init options flow
                { ok: true, body: { flow_id: "attach-flow", type: "form" } },
                // attach: submit with device_id
                { ok: true, body: { flow_id: "attach-flow", type: "create_entry" } },
                // delete: remove config entry
                { ok: true, body: { require_restart: false } },
            ]);
            vitest_1.vi.stubGlobal("fetch", mock);
            const api = createApi();
            // Step 1: Create
            const result = await api.createTemplateHelper({
                type: "binary_sensor",
                name: "Room Occupancy",
                state: "{{ states('binary_sensor.sensor1') }}",
                deviceClass: "occupancy",
            });
            (0, vitest_1.expect)(result.configEntryId).toBe("lifecycle-entry");
            // Step 2: Attach to device
            await api.attachHelperToDevice(result.configEntryId, "mqtt-device-123", "{{ states('binary_sensor.sensor1') }}");
            // Step 3: Delete
            await api.deleteTemplateHelper(result.configEntryId);
            // Verify all 6 calls were made in order
            (0, vitest_1.expect)(calls).toHaveLength(6);
            // Verify the flow: create (3 calls) → attach (2 calls) → delete (1 call)
            (0, vitest_1.expect)(calls[0].url).toContain("/config/config_entries/flow");
            (0, vitest_1.expect)(calls[0].init.method).toBe("POST");
            (0, vitest_1.expect)(calls[1].url).toContain("/config/config_entries/flow/create-flow");
            (0, vitest_1.expect)(calls[2].url).toContain("/config/config_entries/flow/create-flow");
            (0, vitest_1.expect)(calls[3].url).toContain("/config/config_entries/options/flow");
            (0, vitest_1.expect)(calls[3].init.method).toBe("POST");
            (0, vitest_1.expect)(calls[4].url).toContain("/config/config_entries/options/flow/attach-flow");
            (0, vitest_1.expect)(calls[5].url).toContain("/config/config_entries/entry/lifecycle-entry");
            (0, vitest_1.expect)(calls[5].init.method).toBe("DELETE");
        });
    });
    (0, vitest_1.describe)("HaHelperApiError", () => {
        (0, vitest_1.it)("preserves status, haError, flowId, and stepId", () => {
            const err = new haHelperApi_1.HaHelperApiError("test error", 422, "already_configured", "flow-123", "menu");
            (0, vitest_1.expect)(err.name).toBe("HaHelperApiError");
            (0, vitest_1.expect)(err.message).toBe("test error");
            (0, vitest_1.expect)(err.status).toBe(422);
            (0, vitest_1.expect)(err.haError).toBe("already_configured");
            (0, vitest_1.expect)(err.flowId).toBe("flow-123");
            (0, vitest_1.expect)(err.stepId).toBe("menu");
            (0, vitest_1.expect)(err).toBeInstanceOf(Error);
        });
    });
});
