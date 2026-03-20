"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockMqttClient = void 0;
/**
 * In-memory mock of IMqttClient for unit/integration tests.
 *
 * Records every publish call for assertion and allows configuring
 * connection state. Follows the DI pattern of MockReadTransport
 * and MockWriteClient.
 */
class MockMqttClient {
    constructor() {
        this._isConnected = true;
        this._lastError = null;
        this._publishCalls = [];
    }
    // ── Helpers ──────────────────────────────────────────────────────
    get publishCalls() {
        return [...this._publishCalls];
    }
    getLastPublish() {
        return this._publishCalls[this._publishCalls.length - 1];
    }
    getPublishesForTopic(topic) {
        return this._publishCalls.filter((c) => c.topic === topic);
    }
    setConnected(connected) {
        this._isConnected = connected;
    }
    setLastError(error) {
        this._lastError = error;
    }
    reset() {
        this._publishCalls = [];
        this._isConnected = true;
        this._lastError = null;
    }
    // ── IMqttClient implementation ───────────────────────────────────
    get isConnected() {
        return this._isConnected;
    }
    get lastError() {
        return this._lastError;
    }
    async publish(topic, payload, options) {
        if (!this._isConnected) {
            throw new Error("MockMqttClient: not connected");
        }
        this._publishCalls.push({ topic, payload, options });
    }
    async disconnect() {
        this._isConnected = false;
    }
}
exports.MockMqttClient = MockMqttClient;
