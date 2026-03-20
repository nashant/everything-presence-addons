"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockWriteClient = void 0;
/**
 * In-memory mock of IHaWriteClient for integration tests.
 *
 * Records every service call for assertion and allows configuring
 * per-service responses.
 */
class MockWriteClient {
    constructor() {
        this.calls = [];
        this.responses = new Map(); // "domain.service" -> response
    }
    // ── Helpers ──────────────────────────────────────────────────────
    getCalls() {
        return [...this.calls];
    }
    getLastCall() {
        return this.calls[this.calls.length - 1];
    }
    getCallsForService(domain, service) {
        return this.calls.filter((c) => c.domain === domain && c.service === service);
    }
    setResponse(domain, service, response) {
        this.responses.set(`${domain}.${service}`, response);
    }
    reset() {
        this.calls = [];
        this.responses.clear();
    }
    // ── IHaWriteClient implementation ────────────────────────────────
    async callService(domain, service, data, options) {
        this.calls.push({ domain, service, data, options });
        return this.responses.get(`${domain}.${service}`) ?? undefined;
    }
    async setNumberEntity(entityId, value) {
        await this.callService("number", "set_value", {
            entity_id: entityId,
            value,
        });
    }
    async setSelectEntity(entityId, option) {
        await this.callService("select", "select_option", {
            entity_id: entityId,
            option,
        });
    }
    async setSwitchEntity(entityId, on) {
        await this.callService("switch", on ? "turn_on" : "turn_off", {
            entity_id: entityId,
        });
    }
    async setInputBooleanEntity(entityId, on) {
        await this.callService("input_boolean", on ? "turn_on" : "turn_off", {
            entity_id: entityId,
        });
    }
    async setTextEntity(entityId, value) {
        await this.callService("text", "set_value", {
            entity_id: entityId,
            value,
        });
    }
}
exports.MockWriteClient = MockWriteClient;
