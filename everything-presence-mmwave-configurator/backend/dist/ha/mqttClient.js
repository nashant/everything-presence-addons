"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttClientWrapper = void 0;
exports.discoverBrokerUrl = discoverBrokerUrl;
exports.createMqttClient = createMqttClient;
const mqtt_1 = __importDefault(require("mqtt"));
// ── Broker discovery ─────────────────────────────────────────────────
const AVAILABILITY_TOPIC = "ep_room/configurator/availability";
/**
 * Discover the MQTT broker URL using a priority chain:
 * 1. Supervisor API (add-on mode) — GET /services/mqtt
 * 2. MQTT_BROKER_URL env var (standalone mode)
 * 3. null (MQTT disabled)
 *
 * Never throws — returns null on any error.
 */
async function discoverBrokerUrl(haMode, supervisorApiUrl, mqttBrokerUrl, token) {
    // 1. Try Supervisor API
    if (haMode === "supervisor" && supervisorApiUrl && token) {
        try {
            const url = `${supervisorApiUrl}/services/mqtt`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const body = (await response.json());
                const host = body?.data?.host;
                const port = body?.data?.port ?? 1883;
                const ssl = body?.data?.ssl ?? false;
                if (host) {
                    const protocol = ssl ? "mqtts" : "mqtt";
                    return {
                        brokerUrl: `${protocol}://${host}:${port}`,
                        source: "supervisor",
                    };
                }
            }
            // 404 or missing data — fall through
        }
        catch {
            // Network error — fall through to env var
        }
    }
    // 2. Try env var
    if (mqttBrokerUrl) {
        return { brokerUrl: mqttBrokerUrl, source: "env" };
    }
    // 3. No broker
    return { brokerUrl: null, source: "none" };
}
// ── Wrapper class ────────────────────────────────────────────────────
/**
 * Wraps the mqtt.js client with connect/disconnect lifecycle,
 * availability publishing, and error tracking.
 */
class MqttClientWrapper {
    constructor(brokerUrl, logger) {
        this.client = null;
        this._lastError = null;
        this.brokerUrl = brokerUrl;
        this.log = logger.child({ component: "mqtt" });
    }
    get isConnected() {
        return this.client?.connected ?? false;
    }
    get lastError() {
        return this._lastError;
    }
    async connect() {
        this.log.info({ broker: this.redactUrl(this.brokerUrl), event: "connecting" }, "MQTT connecting");
        this.client = await mqtt_1.default.connectAsync(this.brokerUrl, {
            reconnectPeriod: 5000,
            will: {
                topic: AVAILABILITY_TOPIC,
                payload: Buffer.from("offline"),
                retain: true,
                qos: 1,
            },
        });
        this.client.on("error", (err) => {
            this._lastError = err;
            this.log.warn({ error: err.message, broker: this.redactUrl(this.brokerUrl), event: "error" }, "MQTT client error");
        });
        this.client.on("reconnect", () => {
            this.log.info({ broker: this.redactUrl(this.brokerUrl), event: "reconnecting" }, "MQTT reconnecting");
        });
        this.client.on("close", () => {
            this.log.info({ broker: this.redactUrl(this.brokerUrl), event: "disconnected" }, "MQTT disconnected");
        });
        // Publish online availability with retain
        await this.client.publishAsync(AVAILABILITY_TOPIC, "online", {
            retain: true,
            qos: 1,
        });
        this.log.info({ broker: this.redactUrl(this.brokerUrl), event: "connected" }, "MQTT connected");
    }
    async disconnect() {
        if (!this.client)
            return;
        try {
            // Publish offline before disconnecting
            await this.client.publishAsync(AVAILABILITY_TOPIC, "offline", {
                retain: true,
                qos: 1,
            });
        }
        catch {
            // Best-effort — broker may already be unreachable
        }
        await this.client.endAsync();
        this.log.info({ broker: this.redactUrl(this.brokerUrl), event: "disconnected" }, "MQTT client disconnected cleanly");
        this.client = null;
    }
    async publish(topic, payload, options) {
        if (!this.client?.connected) {
            this.log.warn({ topic, event: "publish_skipped" }, "MQTT publish skipped — not connected");
            return;
        }
        try {
            await this.client.publishAsync(topic, payload, {
                retain: options?.retain ?? false,
                qos: options?.qos ?? 0,
            });
        }
        catch (err) {
            this._lastError = err;
            this.log.error({ topic, error: err.message, event: "publish_error" }, "MQTT publish failed");
        }
    }
    /**
     * Redact credentials from broker URLs for safe logging.
     * mqtt://user:pass@host:1883 → mqtt://***@host:1883
     */
    redactUrl(url) {
        try {
            const parsed = new URL(url);
            if (parsed.username || parsed.password) {
                parsed.username = "***";
                parsed.password = "";
            }
            return parsed.toString().replace(/\/$/, "");
        }
        catch {
            return "mqtt://<invalid-url>";
        }
    }
}
exports.MqttClientWrapper = MqttClientWrapper;
// ── Factory ──────────────────────────────────────────────────────────
/**
 * Top-level async factory for creating an MQTT client.
 * Returns null (with info/warn log) if no broker is configured or
 * connection fails. Never throws, never blocks startup.
 */
async function createMqttClient(config, logger) {
    const log = logger.child({ component: "mqtt" });
    const discovery = await discoverBrokerUrl(config.ha.mode, config.ha.supervisorApiUrl, config.mqttBrokerUrl, config.ha.token);
    log.info({ broker: discovery.brokerUrl ? "<configured>" : null, source: discovery.source }, "MQTT broker discovery result");
    if (!discovery.brokerUrl) {
        log.info("MQTT disabled — no broker configured");
        return null;
    }
    try {
        const wrapper = new MqttClientWrapper(discovery.brokerUrl, logger);
        await wrapper.connect();
        return wrapper;
    }
    catch (err) {
        log.warn({ error: err.message, source: discovery.source }, "MQTT connection failed — features disabled");
        return null;
    }
}
