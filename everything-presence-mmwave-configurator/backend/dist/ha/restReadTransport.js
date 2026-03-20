"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestReadTransport = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../logger");
/**
 * REST-based read transport for Home Assistant.
 *
 * Provides polling-based state updates as a fallback when
 * WebSocket is unavailable. Less efficient than WS but works
 * in more environments.
 */
class RestReadTransport {
    constructor(config, pollingInterval = 1000) {
        this.activeTransport = 'rest';
        this.subscriptions = new Map();
        this._isConnected = false;
        this.config = config;
        this.pollingInterval = pollingInterval;
        // Ensure baseUrl ends with /api for REST calls
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        if (!this.baseUrl.endsWith('/api')) {
            this.baseUrl = this.baseUrl + '/api';
        }
        this.token = config.token;
    }
    get isConnected() {
        return this._isConnected;
    }
    get headers() {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
        };
    }
    buildUrl(path) {
        const normalized = path.startsWith('/') ? path : `/${path}`;
        return `${this.baseUrl}${normalized}`;
    }
    // ─────────────────────────────────────────────────────────────────
    // Connection Management
    // ─────────────────────────────────────────────────────────────────
    async connect() {
        logger_1.logger.info('RestReadTransport: Testing connection to HA REST API');
        try {
            // Test connection by fetching API status
            const url = this.buildUrl('/');
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`REST API health check failed: ${res.status} - ${text}`);
            }
            this._isConnected = true;
            logger_1.logger.info('RestReadTransport: Connected to HA REST API');
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Failed to connect');
            throw err;
        }
    }
    disconnect() {
        this.stopPolling();
        this._isConnected = false;
        logger_1.logger.info('RestReadTransport: Disconnected');
    }
    async waitUntilReady() {
        if (!this._isConnected) {
            await this.connect();
        }
    }
    // ─────────────────────────────────────────────────────────────────
    // Discovery
    // ─────────────────────────────────────────────────────────────────
    async listDevices() {
        try {
            // Try the direct device registry endpoint (Supervisor proxy)
            const url = this.buildUrl('/config/device_registry');
            const res = await fetch(url, { headers: this.headers });
            if (res.ok) {
                return (await res.json());
            }
            // Fallback: Use template API to query device registry
            logger_1.logger.info('RestReadTransport: Using template fallback for device discovery');
            return await this.listDevicesViaTemplate();
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Failed to list devices');
            return [];
        }
    }
    /**
     * Fallback: Query device registry via HA template API.
     * This works when the device_registry endpoint isn't directly accessible.
     */
    async listDevicesViaTemplate() {
        // Jinja2 template that iterates through all states and collects unique device info
        const template = `
{% set devices = namespace(list=[]) %}
{% set seen = namespace(ids=[]) %}
{% for state in states %}
  {% set dev_id = device_id(state.entity_id) %}
  {% if dev_id and dev_id not in seen.ids %}
    {% set seen.ids = seen.ids + [dev_id] %}
    {% set dev_identifiers = device_attr(dev_id, 'identifiers') %}
    {% set dev_connections = device_attr(dev_id, 'connections') %}
    {% set dev_config_entries = device_attr(dev_id, 'config_entries') %}
    {% set devices.list = devices.list + [{
      'id': dev_id,
      'name': device_attr(dev_id, 'name'),
      'manufacturer': device_attr(dev_id, 'manufacturer'),
      'model': device_attr(dev_id, 'model'),
      'sw_version': device_attr(dev_id, 'sw_version'),
      'hw_version': device_attr(dev_id, 'hw_version'),
      'identifiers': dev_identifiers | list if dev_identifiers else [],
      'config_entries': dev_config_entries | list if dev_config_entries else [],
      'connections': dev_connections | list if dev_connections else [],
      'area_id': device_attr(dev_id, 'area_id'),
      'name_by_user': device_attr(dev_id, 'name_by_user')
    }] %}
  {% endif %}
{% endfor %}
{{ devices.list | tojson }}`.trim();
        try {
            const url = this.buildUrl('/template');
            const res = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({ template }),
            });
            if (!res.ok) {
                const text = await res.text();
                logger_1.logger.warn({ status: res.status, text }, 'RestReadTransport: Template API failed');
                return [];
            }
            const resultText = await res.text();
            const devices = JSON.parse(resultText);
            logger_1.logger.info({ count: devices.length }, 'RestReadTransport: Discovered devices via template');
            return devices;
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Template-based device discovery failed');
            return [];
        }
    }
    async listEntityRegistry() {
        try {
            const url = this.buildUrl('/config/entity_registry');
            const res = await fetch(url, { headers: this.headers });
            if (res.ok) {
                return (await res.json());
            }
            // Fallback: Use template API to query entity registry
            logger_1.logger.info('RestReadTransport: Using template fallback for entity registry');
            return await this.listEntityRegistryViaTemplate();
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Failed to list entity registry');
            return [];
        }
    }
    /**
     * Fallback: Query entity registry via HA template API.
     * Note: This provides limited info compared to the full registry endpoint.
     * It focuses on the fields needed for zone availability checking.
     */
    async listEntityRegistryViaTemplate() {
        // Jinja2 template that collects entity info from states
        // Note: disabled_by isn't directly available via template, but we can infer
        // unavailable entities from state
        const template = `
{% set entities = namespace(list=[]) %}
{% for state in states %}
  {% set entities.list = entities.list + [{
    'entity_id': state.entity_id,
    'disabled_by': none,
    'hidden_by': none,
    'platform': state.attributes.get('platform', ''),
    'device_id': device_id(state.entity_id)
  }] %}
{% endfor %}
{{ entities.list | tojson }}`.trim();
        try {
            const url = this.buildUrl('/template');
            const res = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({ template }),
            });
            if (!res.ok) {
                const text = await res.text();
                logger_1.logger.warn({ status: res.status, text }, 'RestReadTransport: Template API failed for entity registry');
                return [];
            }
            const resultText = await res.text();
            const entities = JSON.parse(resultText);
            logger_1.logger.info({ count: entities.length }, 'RestReadTransport: Got entity registry via template');
            return entities;
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Template-based entity registry failed');
            return [];
        }
    }
    async listAreaRegistry() {
        try {
            const url = this.buildUrl('/config/area_registry');
            const res = await fetch(url, { headers: this.headers });
            if (res.ok) {
                return (await res.json());
            }
            // Fallback: Use template API to query area registry
            logger_1.logger.info('RestReadTransport: Using template fallback for area registry');
            return await this.listAreaRegistryViaTemplate();
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Failed to list area registry');
            return [];
        }
    }
    async getServicesForTarget(_target, _expandGroup = true) {
        logger_1.logger.debug('RestReadTransport: getServicesForTarget not supported, returning empty list');
        return [];
    }
    async getServicesByDomain(_domain) {
        logger_1.logger.debug('RestReadTransport: getServicesByDomain not supported, returning empty list');
        return [];
    }
    /**
     * Fallback: Query area registry via HA template API.
     */
    async listAreaRegistryViaTemplate() {
        const template = `
{% set areas = namespace(list=[]) %}
{% for area in areas() %}
  {% set areas.list = areas.list + [{
    'area_id': area,
    'name': area_name(area),
    'picture': none,
    'aliases': [],
    'floor_id': none,
    'icon': none,
    'labels': []
  }] %}
{% endfor %}
{{ areas.list | tojson }}`.trim();
        try {
            const url = this.buildUrl('/template');
            const res = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({ template }),
            });
            if (!res.ok) {
                const text = await res.text();
                logger_1.logger.warn({ status: res.status, text }, 'RestReadTransport: Template API failed for area registry');
                return [];
            }
            const resultText = await res.text();
            const areas = JSON.parse(resultText);
            logger_1.logger.info({ count: areas.length }, 'RestReadTransport: Got area registry via template');
            return areas;
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Template-based area registry failed');
            return [];
        }
    }
    // ─────────────────────────────────────────────────────────────────
    // State Queries
    // ─────────────────────────────────────────────────────────────────
    async getState(entityId) {
        try {
            const url = this.buildUrl(`/states/${entityId}`);
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) {
                if (res.status === 404) {
                    return null;
                }
                const text = await res.text();
                throw new Error(`Failed to get state: ${res.status} - ${text}`);
            }
            return (await res.json());
        }
        catch (err) {
            logger_1.logger.warn({ err, entityId }, 'RestReadTransport: Failed to get entity state');
            return null;
        }
    }
    async getStates(entityIds) {
        const result = new Map();
        // Fetch all states and filter (more efficient than individual calls)
        const allStates = await this.getAllStates();
        const entityIdSet = new Set(entityIds);
        for (const state of allStates) {
            if (entityIdSet.has(state.entity_id)) {
                result.set(state.entity_id, state);
            }
        }
        return result;
    }
    async getAllStates() {
        try {
            const url = this.buildUrl('/states');
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to get all states: ${res.status} - ${text}`);
            }
            return (await res.json());
        }
        catch (err) {
            logger_1.logger.error({ err }, 'RestReadTransport: Failed to get all states');
            return [];
        }
    }
    // ─────────────────────────────────────────────────────────────────
    // Real-time Subscriptions (via Polling)
    // ─────────────────────────────────────────────────────────────────
    subscribeToStateChanges(entityIds, callback) {
        const subscriptionId = (0, uuid_1.v4)();
        this.subscriptions.set(subscriptionId, {
            id: subscriptionId,
            entityIds: new Set(entityIds),
            callback,
            lastStates: new Map(),
        });
        // Start polling if not already running
        this.startPolling();
        logger_1.logger.debug({ subscriptionId, entityCount: entityIds.length }, 'RestReadTransport: Created state subscription (polling)');
        return subscriptionId;
    }
    unsubscribe(subscriptionId) {
        this.subscriptions.delete(subscriptionId);
        // Stop polling if no more subscriptions
        if (this.subscriptions.size === 0) {
            this.stopPolling();
        }
        logger_1.logger.debug({ subscriptionId }, 'RestReadTransport: Removed state subscription');
    }
    unsubscribeAll() {
        this.subscriptions.clear();
        this.stopPolling();
        logger_1.logger.debug('RestReadTransport: Removed all state subscriptions');
    }
    startPolling() {
        if (this.pollingTimer)
            return;
        logger_1.logger.info({ interval: this.pollingInterval }, 'RestReadTransport: Starting polling');
        this.pollingTimer = setInterval(() => {
            this.pollStates().catch((err) => {
                logger_1.logger.error({ err }, 'RestReadTransport: Polling error');
            });
        }, this.pollingInterval);
        // Do an immediate poll
        this.pollStates().catch((err) => {
            logger_1.logger.error({ err }, 'RestReadTransport: Initial poll error');
        });
    }
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
            logger_1.logger.info('RestReadTransport: Stopped polling');
        }
    }
    async pollStates() {
        if (this.subscriptions.size === 0)
            return;
        // Collect all entity IDs we need to poll
        const allEntityIds = new Set();
        for (const sub of this.subscriptions.values()) {
            if (sub.entityIds.size === 0) {
                // Subscription wants all entities - we'll fetch all states
                allEntityIds.clear();
                break;
            }
            sub.entityIds.forEach((id) => allEntityIds.add(id));
        }
        // Fetch states
        let states;
        if (allEntityIds.size === 0) {
            // At least one subscription wants all entities
            states = await this.getAllStates();
        }
        else {
            // Fetch specific entities
            const stateMap = await this.getStates(Array.from(allEntityIds));
            states = Array.from(stateMap.values());
        }
        // Build a map for quick lookup
        const stateMap = new Map();
        for (const state of states) {
            stateMap.set(state.entity_id, state);
        }
        // Check each subscription for changes
        for (const subscription of this.subscriptions.values()) {
            const relevantStates = subscription.entityIds.size === 0
                ? states
                : states.filter((s) => subscription.entityIds.has(s.entity_id));
            for (const newState of relevantStates) {
                const oldState = subscription.lastStates.get(newState.entity_id);
                // Check if state changed
                if (!oldState || this.stateChanged(oldState, newState)) {
                    try {
                        subscription.callback(newState.entity_id, newState, oldState ?? null);
                    }
                    catch (err) {
                        logger_1.logger.error({ err, subscriptionId: subscription.id }, 'RestReadTransport: Subscription callback error');
                    }
                }
                // Update last known state
                subscription.lastStates.set(newState.entity_id, newState);
            }
        }
    }
    stateChanged(oldState, newState) {
        // Compare state value
        if (oldState.state !== newState.state)
            return true;
        // Compare last_updated timestamp
        if (oldState.last_updated !== newState.last_updated)
            return true;
        return false;
    }
}
exports.RestReadTransport = RestReadTransport;
