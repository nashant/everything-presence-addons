"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockReadTransport = void 0;
const uuid_1 = require("uuid");
/**
 * In-memory mock of IHaReadTransport for integration tests.
 *
 * Provides helpers to seed devices, entities, areas, states, and services,
 * and faithfully implements subscriptions so tests can verify state-change flows.
 */
class MockReadTransport {
    constructor() {
        this.activeTransport = "websocket";
        this.isConnected = true;
        this.devices = [];
        this.entities = [];
        this.areas = [];
        this.states = new Map();
        this.services = new Map(); // domain -> service names
        this.subscriptions = new Map();
    }
    // ── Seeders ──────────────────────────────────────────────────────
    addDevice(device) {
        this.devices.push(device);
    }
    addEntity(entity) {
        this.entities.push(entity);
    }
    addArea(area) {
        this.areas.push(area);
    }
    setState(entityId, state) {
        const oldState = this.states.get(entityId) ?? null;
        this.states.set(entityId, state);
        // Fire subscriptions
        for (const sub of this.subscriptions.values()) {
            if (sub.entityIds.length === 0 || sub.entityIds.includes(entityId)) {
                sub.callback(entityId, state, oldState);
            }
        }
    }
    addService(domain, service) {
        const existing = this.services.get(domain) ?? [];
        existing.push(`${domain}.${service}`);
        this.services.set(domain, existing);
    }
    reset() {
        this.devices = [];
        this.entities = [];
        this.areas = [];
        this.states.clear();
        this.services.clear();
        this.subscriptions.clear();
    }
    // ── IHaReadTransport implementation ──────────────────────────────
    async listDevices() {
        return [...this.devices];
    }
    async listEntityRegistry() {
        return [...this.entities];
    }
    async listAreaRegistry() {
        return [...this.areas];
    }
    async getServicesForTarget(_target, _expandGroup) {
        // Return all registered services for simplicity
        return Array.from(this.services.values()).flat();
    }
    async getServicesByDomain(domain) {
        return this.services.get(domain) ?? [];
    }
    async getState(entityId) {
        return this.states.get(entityId) ?? null;
    }
    async getStates(entityIds) {
        const result = new Map();
        for (const id of entityIds) {
            const s = this.states.get(id);
            if (s)
                result.set(id, s);
        }
        return result;
    }
    async getAllStates() {
        return Array.from(this.states.values());
    }
    subscribeToStateChanges(entityIds, callback) {
        const id = (0, uuid_1.v4)();
        this.subscriptions.set(id, { entityIds, callback });
        return id;
    }
    unsubscribe(subscriptionId) {
        this.subscriptions.delete(subscriptionId);
    }
    unsubscribeAll() {
        this.subscriptions.clear();
    }
    async connect() {
        // no-op
    }
    disconnect() {
        // no-op
    }
    async waitUntilReady() {
        // no-op — always ready
    }
}
exports.MockReadTransport = MockReadTransport;
