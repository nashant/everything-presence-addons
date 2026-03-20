"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaHelperApi = exports.HaHelperApiError = void 0;
/**
 * Structured error for HA API failures.
 * Preserves HTTP status and HA error message for upstream handling.
 */
class HaHelperApiError extends Error {
    constructor(message, status, haError, flowId, stepId) {
        super(message);
        this.status = status;
        this.haError = haError;
        this.flowId = flowId;
        this.stepId = stepId;
        this.name = "HaHelperApiError";
    }
}
exports.HaHelperApiError = HaHelperApiError;
// ── HaHelperApi ──────────────────────────────────────────────────────
/**
 * Wraps HA Config Entry Flow and Options Flow REST calls
 * for template helper lifecycle management.
 *
 * Lifecycle:
 *   1. createTemplateHelper() — create via Config Entry Flow
 *   2. attachHelperToDevice() — attach via Options Flow
 *   3. deleteTemplateHelper() — delete config entry
 *
 * All methods throw HaHelperApiError on failure with HTTP status,
 * HA error message, and flow context for debugging.
 */
class HaHelperApi {
    constructor(opts) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this.token = opts.token;
        this.logger = opts.logger;
    }
    /**
     * Create a template helper via the Config Entry Flow API.
     *
     * Sequence:
     *   1. POST /api/config/config_entries/flow  → init flow (menu step)
     *   2. POST /api/config/config_entries/flow/{flow_id} → select entity type
     *   3. POST /api/config/config_entries/flow/{flow_id} → submit form → create_entry
     */
    async createTemplateHelper(params) {
        // Step 1: Initiate the config entry flow for the template integration
        const initResponse = await this._fetch("/api/config/config_entries/flow", "POST", { handler: "template", show_advanced_options: true });
        const flowId = initResponse.flow_id;
        this.logger.debug({ action: "create", flowId, entityType: params.type }, "template helper: flow initiated");
        // Step 2: Select the entity type from the menu
        const menuResponse = await this._fetch(`/api/config/config_entries/flow/${flowId}`, "POST", { next_step_id: params.type });
        if (menuResponse.type === "abort") {
            throw new HaHelperApiError(`Config Entry Flow aborted at menu step: ${menuResponse.step_id ?? "unknown"}`, 422, String(menuResponse.reason ?? "flow aborted"), flowId, "menu");
        }
        // Step 3: Submit the form with entity details
        const formData = {
            name: params.name,
            state: params.state,
        };
        if (params.deviceClass) {
            formData.device_class = params.deviceClass;
        }
        const createResponse = await this._fetch(`/api/config/config_entries/flow/${flowId}`, "POST", formData);
        if (createResponse.type !== "create_entry") {
            throw new HaHelperApiError(`Expected create_entry but got ${createResponse.type} at step ${createResponse.step_id ?? "unknown"}`, 422, `Unexpected flow step type: ${createResponse.type}`, flowId, createResponse.step_id);
        }
        const configEntryId = createResponse.result?.config_entry_id;
        if (!configEntryId) {
            throw new HaHelperApiError("create_entry response missing config_entry_id", 500, "Missing config_entry_id in response", flowId, "create_entry");
        }
        this.logger.info({
            action: "create",
            configEntryId,
            entityType: params.type,
            name: params.name,
        }, "template helper created");
        return { configEntryId };
    }
    /**
     * Attach a template helper to a device via the Options Flow API.
     *
     * Sequence:
     *   1. POST /api/config/config_entries/options/flow → init options flow
     *   2. POST /api/config/config_entries/options/flow/{flow_id} → submit with device_id
     */
    async attachHelperToDevice(configEntryId, deviceId, state) {
        // Step 1: Start the options flow
        const initResponse = await this._fetch("/api/config/config_entries/options/flow", "POST", { handler: configEntryId });
        const flowId = initResponse.flow_id;
        this.logger.debug({ action: "attach", configEntryId, deviceId, flowId }, "template helper: options flow initiated");
        // Step 2: Submit options with device_id
        const submitResponse = await this._fetch(`/api/config/config_entries/options/flow/${flowId}`, "POST", { state, device_id: deviceId });
        if (submitResponse.type !== "create_entry" &&
            submitResponse.type !== "abort") {
            // Some HA versions return type: "create_entry" for options flow completion,
            // others may use different completion types. Log unexpected types as warning.
            this.logger.warn({
                action: "attach",
                configEntryId,
                deviceId,
                responseType: submitResponse.type,
            }, "template helper: unexpected options flow response type");
        }
        this.logger.info({ action: "attach", configEntryId, deviceId }, "template helper attached to device");
    }
    /**
     * Delete a template helper by removing its config entry.
     */
    async deleteTemplateHelper(configEntryId) {
        await this._fetch(`/api/config/config_entries/entry/${configEntryId}`, "DELETE");
        this.logger.info({ action: "delete", configEntryId }, "template helper deleted");
    }
    /**
     * Look up the HA device registry ID for an MQTT device by its identifier.
     *
     * Calls GET /api/config/device_registry/list and filters for an entry
     * whose `identifiers` array contains `["mqtt", mqttIdentifier]`.
     *
     * @returns HA device ID or null if not found
     */
    async lookupHaDeviceId(mqttIdentifier) {
        const entries = await this._fetch("/api/config/device_registry/list", "GET");
        for (const entry of entries) {
            if (!Array.isArray(entry.identifiers))
                continue;
            for (const pair of entry.identifiers) {
                if (Array.isArray(pair) &&
                    pair[0] === "mqtt" &&
                    pair[1] === mqttIdentifier) {
                    this.logger.debug({ mqttIdentifier, haDeviceId: entry.id }, "resolved MQTT identifier to HA device ID");
                    return entry.id;
                }
            }
        }
        this.logger.warn({ mqttIdentifier }, "MQTT identifier not found in HA device registry");
        return null;
    }
    /**
     * Look up entity IDs created by specific config entries.
     *
     * Calls GET /api/config/entity_registry/list and filters for entities
     * whose `config_entry_id` matches one of the provided IDs.
     *
     * @returns Map of configEntryId → entityId
     */
    async lookupEntityIdsByConfigEntry(configEntryIds) {
        if (configEntryIds.length === 0)
            return {};
        const entries = await this._fetch("/api/config/entity_registry/list", "GET");
        const targetSet = new Set(configEntryIds);
        const result = {};
        for (const entry of entries) {
            if (entry.config_entry_id && targetSet.has(entry.config_entry_id)) {
                result[entry.config_entry_id] = entry.entity_id;
            }
        }
        this.logger.debug({
            requested: configEntryIds.length,
            resolved: Object.keys(result).length,
        }, "looked up entity IDs by config entry");
        return result;
    }
    /**
     * Internal fetch helper. Handles auth header, JSON serialization,
     * and structured error extraction.
     */
    async _fetch(path, method, body) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
        };
        const init = { method, headers };
        if (body !== undefined) {
            init.body = JSON.stringify(body);
        }
        let res;
        try {
            res = await fetch(url, init);
        }
        catch (err) {
            throw new HaHelperApiError(`Network error calling ${method} ${path}: ${err.message}`, 0, err.message);
        }
        if (!res.ok) {
            let haError;
            try {
                const errorBody = await res.text();
                haError = errorBody;
            }
            catch {
                // Ignore body parse failures
            }
            this.logger.error({ method, path, status: res.status, haError }, "template helper API call failed");
            throw new HaHelperApiError(`HA API error: ${method} ${path} returned ${res.status}`, res.status, haError);
        }
        return (await res.json());
    }
}
exports.HaHelperApi = HaHelperApi;
