"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mqttClient_1 = require("../../ha/mqttClient");
const pino_1 = __importDefault(require("pino"));
const silentLogger = (0, pino_1.default)({ level: "silent" });
(0, vitest_1.describe)("discoverBrokerUrl", () => {
    (0, vitest_1.it)("returns URL from MQTT_BROKER_URL when provided", async () => {
        const result = await (0, mqttClient_1.discoverBrokerUrl)("standalone", undefined, "mqtt://localhost:1883");
        (0, vitest_1.expect)(result.brokerUrl).toBe("mqtt://localhost:1883");
        (0, vitest_1.expect)(result.source).toBe("env");
    });
    (0, vitest_1.it)("returns null when no env var and not supervisor mode", async () => {
        const result = await (0, mqttClient_1.discoverBrokerUrl)("standalone", undefined, undefined);
        (0, vitest_1.expect)(result.brokerUrl).toBeNull();
        (0, vitest_1.expect)(result.source).toBe("none");
    });
    (0, vitest_1.it)("returns null when mqttBrokerUrl is undefined (empty string trimmed)", async () => {
        // The config layer trims empty strings to undefined, so test that path
        const result = await (0, mqttClient_1.discoverBrokerUrl)("standalone", undefined, undefined);
        (0, vitest_1.expect)(result.brokerUrl).toBeNull();
        (0, vitest_1.expect)(result.source).toBe("none");
    });
    (0, vitest_1.it)("prefers supervisor API over env var when in supervisor mode", async () => {
        // Mock fetch for supervisor API
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: { host: "core-mosquitto", port: 1883, ssl: false },
            }),
        });
        vitest_1.vi.stubGlobal("fetch", mockFetch);
        const result = await (0, mqttClient_1.discoverBrokerUrl)("supervisor", "http://supervisor", "mqtt://fallback:1883", "test-token");
        (0, vitest_1.expect)(result.brokerUrl).toBe("mqtt://core-mosquitto:1883");
        (0, vitest_1.expect)(result.source).toBe("supervisor");
        (0, vitest_1.expect)(mockFetch).toHaveBeenCalledWith("http://supervisor/services/mqtt", { headers: { Authorization: "Bearer test-token" } });
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)("falls back to env var when supervisor API returns 404", async () => {
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });
        vitest_1.vi.stubGlobal("fetch", mockFetch);
        const result = await (0, mqttClient_1.discoverBrokerUrl)("supervisor", "http://supervisor", "mqtt://fallback:1883", "test-token");
        (0, vitest_1.expect)(result.brokerUrl).toBe("mqtt://fallback:1883");
        (0, vitest_1.expect)(result.source).toBe("env");
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)("falls back to env var when supervisor API throws network error", async () => {
        const mockFetch = vitest_1.vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
        vitest_1.vi.stubGlobal("fetch", mockFetch);
        const result = await (0, mqttClient_1.discoverBrokerUrl)("supervisor", "http://supervisor", "mqtt://fallback:1883", "test-token");
        (0, vitest_1.expect)(result.brokerUrl).toBe("mqtt://fallback:1883");
        (0, vitest_1.expect)(result.source).toBe("env");
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)("returns mqtts URL when supervisor reports ssl: true", async () => {
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: { host: "core-mosquitto", port: 8883, ssl: true },
            }),
        });
        vitest_1.vi.stubGlobal("fetch", mockFetch);
        const result = await (0, mqttClient_1.discoverBrokerUrl)("supervisor", "http://supervisor", undefined, "test-token");
        (0, vitest_1.expect)(result.brokerUrl).toBe("mqtts://core-mosquitto:8883");
        (0, vitest_1.expect)(result.source).toBe("supervisor");
        vitest_1.vi.unstubAllGlobals();
    });
});
(0, vitest_1.describe)("createMqttClient", () => {
    (0, vitest_1.it)("returns null when no broker is configured", async () => {
        const config = {
            port: 42069,
            ha: {
                mode: "standalone",
                baseUrl: "http://localhost:8123/api",
                token: "test",
            },
            frontendDist: null,
            firmware: {
                lanPort: 38080,
                cacheDir: "/tmp/fw",
                maxVersionsPerDevice: 3,
            },
            // no mqttBrokerUrl
        };
        const result = await (0, mqttClient_1.createMqttClient)(config, silentLogger);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("returns null when broker connection fails", async () => {
        const config = {
            port: 42069,
            ha: {
                mode: "standalone",
                baseUrl: "http://localhost:8123/api",
                token: "test",
            },
            frontendDist: null,
            firmware: {
                lanPort: 38080,
                cacheDir: "/tmp/fw",
                maxVersionsPerDevice: 3,
            },
            mqttBrokerUrl: "mqtt://nonexistent-host:1883",
        };
        // connectAsync will fail connecting to a nonexistent host
        // createMqttClient should catch and return null
        const result = await (0, mqttClient_1.createMqttClient)(config, silentLogger);
        (0, vitest_1.expect)(result).toBeNull();
    }, 15000); // Allow extra time for connection timeout
});
