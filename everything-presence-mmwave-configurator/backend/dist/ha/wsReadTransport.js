"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsReadTransport = void 0;
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const logger_1 = require("../logger");
/**
 * WebSocket-based read transport for Home Assistant.
 *
 * Provides real-time state updates and efficient bulk queries
 * via the Home Assistant WebSocket API.
 */
class WsReadTransport {
    constructor(config) {
        this.activeTransport = 'websocket';
        this.nextId = 1;
        this.pending = new Map();
        this.subscriptions = new Map();
        this._isConnected = false;
        this.stateSubscriptionActive = false;
        this.config = config;
        this.readyPromise = this.createReadyPromise();
    }
    get isConnected() {
        return this._isConnected;
    }
    createReadyPromise() {
        return new Promise((resolve, reject) => {
            this.setReady = resolve;
            this.rejectReady = reject;
        });
    }
    // ─────────────────────────────────────────────────────────────────
    // Connection Management
    // ─────────────────────────────────────────────────────────────────
    connect() {
        return new Promise((resolve, reject) => {
            // Build WebSocket URL from base URL
            // HA WebSocket is at /api/websocket, so we keep /api in the path
            const base = this.config.baseUrl.replace(/\/api\/?$/, '');
            const wsBase = base.replace(/^http/, 'ws');
            const url = `${wsBase}/api/websocket`;
            logger_1.logger.info({ url }, 'WsReadTransport: Connecting to HA WebSocket');
            this.socket = new ws_1.default(url, ...(process.env.VERIFY_SSL?.toLowerCase() === 'false'
                ? [{ rejectUnauthorized: false }]
                : []));
            const connectionTimeout = setTimeout(() => {
                if (!this._isConnected) {
                    logger_1.logger.error('WsReadTransport: Connection timeout');
                    this.socket?.close();
                    reject(new Error('WebSocket connection timeout'));
                }
            }, 10000);
            this.socket.on('open', () => {
                logger_1.logger.info('WsReadTransport: WebSocket opened, awaiting auth_required');
            });
            this.socket.on('message', (raw) => {
                let parsed;
                try {
                    parsed = JSON.parse(raw.toString());
                }
                catch (err) {
                    logger_1.logger.warn({ err, raw: raw.toString() }, 'WsReadTransport: Failed to parse message');
                    return;
                }
                if (parsed.type === 'auth_required') {
                    logger_1.logger.debug('WsReadTransport: Sending auth token');
                    this.sendRaw({ type: 'auth', access_token: this.config.token });
                    return;
                }
                if (parsed.type === 'auth_invalid') {
                    const msg = parsed.message || 'Unknown auth error';
                    logger_1.logger.error({ reason: msg }, 'WsReadTransport: Auth invalid');
                    clearTimeout(connectionTimeout);
                    this.socket?.close();
                    this.rejectReady(new Error(`Auth invalid: ${msg}`));
                    reject(new Error(`Auth invalid: ${msg}`));
                    return;
                }
                if (parsed.type === 'auth_ok') {
                    logger_1.logger.info('WsReadTransport: Authenticated successfully');
                    clearTimeout(connectionTimeout);
                    this._isConnected = true;
                    this.setReady();
                    resolve();
                    if (this.subscriptions.size > 0) {
                        void this.activateStateSubscription();
                    }
                    return;
                }
                // Handle pending request responses
                if ('id' in parsed && this.pending.has(parsed.id)) {
                    const pending = this.pending.get(parsed.id);
                    if (pending) {
                        pending.resolve(parsed);
                        this.pending.delete(parsed.id);
                    }
                    return;
                }
                // Handle state_changed events for subscriptions
                if (parsed.type === 'event' && parsed.event?.event_type === 'state_changed') {
                    this.handleStateChanged(parsed.event.data);
                }
            });
            this.socket.on('error', (err) => {
                logger_1.logger.error({ err }, 'WsReadTransport: WebSocket error');
                if (!this._isConnected) {
                    clearTimeout(connectionTimeout);
                    reject(err);
                }
            });
            this.socket.on('close', (code, reason) => {
                logger_1.logger.warn({ code, reason: reason.toString() }, 'WsReadTransport: WebSocket closed');
                this._isConnected = false;
                this.stateSubscriptionActive = false;
                this.pending.forEach((p) => p.reject(new Error('WebSocket connection closed')));
                this.pending.clear();
                // Reset ready promise for reconnect
                this.readyPromise = this.createReadyPromise();
                // Auto-reconnect after 5 seconds
                this.reconnectTimeout = setTimeout(() => {
                    logger_1.logger.info('WsReadTransport: Attempting reconnect');
                    this.connect().catch((err) => {
                        logger_1.logger.error({ err }, 'WsReadTransport: Reconnect failed');
                    });
                }, 5000);
            });
        });
    }
    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
        }
        this._isConnected = false;
        this.stateSubscriptionActive = false;
    }
    async waitUntilReady() {
        return this.readyPromise;
    }
    // ─────────────────────────────────────────────────────────────────
    // Discovery
    // ─────────────────────────────────────────────────────────────────
    async listDevices() {
        const response = (await this.call({
            type: 'config/device_registry/list',
        }));
        if (response.type === 'result' && response.success) {
            return response.result ?? [];
        }
        logger_1.logger.warn({ response }, 'WsReadTransport: Unexpected response when listing devices');
        return [];
    }
    async listEntityRegistry() {
        const response = (await this.call({
            type: 'config/entity_registry/list',
        }));
        if (response.type === 'result' && response.success) {
            return response.result ?? [];
        }
        logger_1.logger.warn({ response }, 'WsReadTransport: Unexpected response when listing entities');
        return [];
    }
    async listAreaRegistry() {
        const response = (await this.call({
            type: 'config/area_registry/list',
        }));
        if (response.type === 'result' && response.success) {
            return response.result ?? [];
        }
        logger_1.logger.warn({ response }, 'WsReadTransport: Unexpected response when listing areas');
        return [];
    }
    async getServicesForTarget(target, expandGroup = true) {
        const response = (await this.call({
            type: 'get_services_for_target',
            target,
            expand_group: expandGroup,
        }));
        if (response.type === 'result' && response.success) {
            return response.result ?? [];
        }
        logger_1.logger.warn({ response }, 'WsReadTransport: Unexpected response when listing services for target');
        return [];
    }
    async getServicesByDomain(domain) {
        const response = (await this.call({
            type: 'get_services',
        }));
        if (response.type === 'result' && response.success) {
            const allServices = response.result ?? {};
            const domainServices = [];
            if (allServices[domain]) {
                for (const serviceName of Object.keys(allServices[domain])) {
                    domainServices.push(`${domain}.${serviceName}`);
                }
            }
            return domainServices.sort();
        }
        logger_1.logger.warn({ response, domain }, 'WsReadTransport: Unexpected response when listing services');
        return [];
    }
    // ─────────────────────────────────────────────────────────────────
    // State Queries
    // ─────────────────────────────────────────────────────────────────
    async getState(entityId) {
        const states = await this.getStates([entityId]);
        return states.get(entityId) ?? null;
    }
    async getStates(entityIds) {
        const allStates = await this.getAllStates();
        const result = new Map();
        const entityIdSet = new Set(entityIds);
        for (const state of allStates) {
            if (entityIdSet.has(state.entity_id)) {
                result.set(state.entity_id, state);
            }
        }
        return result;
    }
    async getAllStates() {
        const response = (await this.call({
            type: 'get_states',
        }));
        if (response.type === 'result' && response.success) {
            return response.result ?? [];
        }
        logger_1.logger.warn({ response }, 'WsReadTransport: Unexpected response when getting states');
        return [];
    }
    // ─────────────────────────────────────────────────────────────────
    // Real-time Subscriptions
    // ─────────────────────────────────────────────────────────────────
    subscribeToStateChanges(entityIds, callback) {
        const subscriptionId = (0, uuid_1.v4)();
        this.subscriptions.set(subscriptionId, {
            id: subscriptionId,
            entityIds: new Set(entityIds),
            callback,
        });
        // Ensure we're subscribed to state_changed events
        if (!this.stateSubscriptionActive) {
            this.activateStateSubscription();
        }
        logger_1.logger.debug({ subscriptionId, entityCount: entityIds.length }, 'WsReadTransport: Created state subscription');
        return subscriptionId;
    }
    unsubscribe(subscriptionId) {
        this.subscriptions.delete(subscriptionId);
        logger_1.logger.debug({ subscriptionId }, 'WsReadTransport: Removed state subscription');
    }
    unsubscribeAll() {
        this.subscriptions.clear();
        logger_1.logger.debug('WsReadTransport: Removed all state subscriptions');
    }
    async activateStateSubscription() {
        if (this.stateSubscriptionActive)
            return;
        try {
            await this.waitUntilReady();
            await this.call({
                type: 'subscribe_events',
                event_type: 'state_changed',
            });
            this.stateSubscriptionActive = true;
            logger_1.logger.info('WsReadTransport: Subscribed to state_changed events');
        }
        catch (err) {
            logger_1.logger.error({ err }, 'WsReadTransport: Failed to subscribe to state_changed');
        }
    }
    handleStateChanged(data) {
        const { entity_id, old_state, new_state } = data;
        for (const subscription of this.subscriptions.values()) {
            // If entityIds is empty, subscribe to all; otherwise check if entity is in set
            if (subscription.entityIds.size === 0 || subscription.entityIds.has(entity_id)) {
                try {
                    subscription.callback(entity_id, new_state, old_state);
                }
                catch (err) {
                    logger_1.logger.error({ err, subscriptionId: subscription.id }, 'WsReadTransport: Subscription callback error');
                }
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────
    sendRaw(payload) {
        if (!this.socket || this.socket.readyState !== ws_1.default.OPEN) {
            logger_1.logger.warn('WsReadTransport: Socket not open, dropping message');
            return;
        }
        this.socket.send(JSON.stringify(payload));
    }
    async call(command) {
        await this.waitUntilReady();
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.sendRaw({ id, ...command });
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error('WS request timed out'));
                }
            }, 10000);
        });
    }
}
exports.WsReadTransport = WsReadTransport;
