"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaWriteClient = void 0;
const logger_1 = require("../logger");
class HaWriteClient {
    constructor(config) {
        // Ensure baseUrl ends with /api for REST calls
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        if (!this.baseUrl.endsWith('/api')) {
            this.baseUrl = this.baseUrl + '/api';
        }
        this.token = config.token;
        logger_1.logger.info('HaWriteClient initialized (REST-only for writes)');
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
    async callService(domain, service, data, options) {
        const query = options?.returnResponse ? '?return_response=true' : '';
        const url = this.buildUrl(`/services/${domain}/${service}${query}`);
        logger_1.logger.debug({ domain, service, entityId: data.entity_id }, 'Calling HA service');
        const res = await fetch(url, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const text = await res.text();
            const error = `HA service call failed: ${res.status} ${res.statusText} - ${text}`;
            logger_1.logger.error({ domain, service, status: res.status, error: text }, 'Service call failed');
            throw new Error(error);
        }
        // Always try to parse the response body as JSON
        // HA service calls can return response data (e.g., ESPHome api.respond)
        try {
            const text = await res.text();
            if (text && text.trim()) {
                const responseData = JSON.parse(text);
                logger_1.logger.debug({ domain, service, responseData }, 'Service call successful with response');
                return responseData;
            }
        }
        catch {
            // JSON parse failed, return undefined
            logger_1.logger.debug({ domain, service }, 'Service call successful (no parseable response)');
        }
        logger_1.logger.debug({ domain, service }, 'Service call successful');
        return undefined;
    }
    async setNumberEntity(entityId, value) {
        await this.callService('number', 'set_value', {
            entity_id: entityId,
            value,
        });
    }
    async setSelectEntity(entityId, option) {
        await this.callService('select', 'select_option', {
            entity_id: entityId,
            option,
        });
    }
    async setSwitchEntity(entityId, on) {
        await this.callService('switch', on ? 'turn_on' : 'turn_off', {
            entity_id: entityId,
        });
    }
    async setInputBooleanEntity(entityId, on) {
        await this.callService('input_boolean', on ? 'turn_on' : 'turn_off', {
            entity_id: entityId,
        });
    }
    async setTextEntity(entityId, value) {
        await this.callService('text', 'set_value', {
            entity_id: entityId,
            value,
        });
    }
}
exports.HaWriteClient = HaWriteClient;
