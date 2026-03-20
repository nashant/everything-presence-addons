"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZoneReader = void 0;
const polygonUtils_1 = require("../domain/polygonUtils");
const entityResolver_1 = require("../domain/entityResolver");
const deviceEntityService_1 = require("../domain/deviceEntityService");
const logger_1 = require("../logger");
class ZoneReader {
    constructor(readTransport) {
        this.readTransport = readTransport;
    }
    normalizeState(state) {
        return typeof state === 'string' ? state.toLowerCase() : '';
    }
    isUnavailableState(state) {
        const normalized = this.normalizeState(state);
        return normalized === '' || normalized === 'unavailable' || normalized === 'unknown';
    }
    parseStateNumber(state) {
        if (!state)
            return null;
        if (this.isUnavailableState(state.state)) {
            return null;
        }
        const value = parseFloat(state.state);
        return Number.isFinite(value) ? value : null;
    }
    /**
     * Read polygon zones from text entities.
     * @param entityMap - Profile entity template map
     * @param entityNamePrefix - Legacy entity name prefix (for fallback)
     * @param entityMappings - Discovered entity mappings (preferred, optional)
     * @param deviceId - Device ID for device-level mapping lookup (preferred, optional)
     */
    async readPolygonZones(entityMap, entityNamePrefix, entityMappings, deviceId) {
        logger_1.logger.debug({ entityNamePrefix, deviceId, hasPolygonZoneEntities: !!entityMap.polygonZoneEntities, hasMappings: !!entityMappings }, 'Starting polygon zone read');
        const zones = [];
        // Regular polygon zones
        if (entityMap.polygonZoneEntities) {
            const polyMap = entityMap.polygonZoneEntities;
            for (let i = 1; i <= 4; i++) {
                const key = `zone${i}`;
                // Try device-level mapping first (preferred), then fall back to legacy resolution
                let entityId = null;
                if (deviceId) {
                    entityId = deviceEntityService_1.deviceEntityService.getPolygonZoneEntity(deviceId, 'polygon', i);
                }
                if (!entityId) {
                    entityId = entityResolver_1.EntityResolver.resolvePolygonZoneEntity(entityMappings, entityNamePrefix, 'polygonZoneEntities', key, polyMap[key]);
                }
                logger_1.logger.debug({ key, entityId, usedDeviceMapping: !!deviceId && !!entityId }, 'Checking polygon zone entity');
                if (!entityId)
                    continue;
                try {
                    const state = await this.readTransport.getState(entityId);
                    logger_1.logger.debug({ key, entityId, state: state?.state, hasState: !!state }, 'Polygon zone entity state');
                    if (!state || !state.state || this.isUnavailableState(state.state)) {
                        continue;
                    }
                    const vertices = (0, polygonUtils_1.textToPolygon)(state.state);
                    if (vertices.length < 3)
                        continue;
                    zones.push({
                        id: `Zone ${i}`,
                        type: 'regular',
                        vertices,
                        enabled: true,
                    });
                }
                catch (error) {
                    logger_1.logger.warn({ key, error }, 'Failed to read polygon zone');
                    continue;
                }
            }
        }
        // Exclusion polygon zones
        if (entityMap.polygonExclusionEntities) {
            const polyMap = entityMap.polygonExclusionEntities;
            for (let i = 1; i <= 2; i++) {
                const key = `exclusion${i}`;
                // Try device-level mapping first
                let entityId = null;
                if (deviceId) {
                    entityId = deviceEntityService_1.deviceEntityService.getPolygonZoneEntity(deviceId, 'polygonExclusion', i);
                }
                if (!entityId) {
                    entityId = entityResolver_1.EntityResolver.resolvePolygonZoneEntity(entityMappings, entityNamePrefix, 'polygonExclusionEntities', key, polyMap[key]);
                }
                if (!entityId)
                    continue;
                try {
                    const state = await this.readTransport.getState(entityId);
                    if (!state || !state.state || this.isUnavailableState(state.state)) {
                        continue;
                    }
                    const vertices = (0, polygonUtils_1.textToPolygon)(state.state);
                    if (vertices.length < 3)
                        continue;
                    zones.push({
                        id: `Exclusion ${i}`,
                        type: 'exclusion',
                        vertices,
                        enabled: true,
                    });
                }
                catch (error) {
                    logger_1.logger.warn({ key, error }, 'Failed to read exclusion polygon');
                    continue;
                }
            }
        }
        // Entry polygon zones
        if (entityMap.polygonEntryEntities) {
            const polyMap = entityMap.polygonEntryEntities;
            for (let i = 1; i <= 2; i++) {
                const key = `entry${i}`;
                // Try device-level mapping first
                let entityId = null;
                if (deviceId) {
                    entityId = deviceEntityService_1.deviceEntityService.getPolygonZoneEntity(deviceId, 'polygonEntry', i);
                }
                if (!entityId) {
                    entityId = entityResolver_1.EntityResolver.resolvePolygonZoneEntity(entityMappings, entityNamePrefix, 'polygonEntryEntities', key, polyMap[key]);
                }
                if (!entityId)
                    continue;
                try {
                    const state = await this.readTransport.getState(entityId);
                    if (!state || !state.state || this.isUnavailableState(state.state)) {
                        continue;
                    }
                    const vertices = (0, polygonUtils_1.textToPolygon)(state.state);
                    if (vertices.length < 3)
                        continue;
                    zones.push({
                        id: `Entry ${i}`,
                        type: 'entry',
                        vertices,
                        enabled: true,
                    });
                }
                catch (error) {
                    logger_1.logger.warn({ key, error }, 'Failed to read entry polygon');
                    continue;
                }
            }
        }
        logger_1.logger.debug({ count: zones.length }, 'Read polygon zones from device');
        return zones;
    }
    /**
     * Read rectangular zones from number entities.
     * @param zoneMap - Profile entity template map
     * @param entityNamePrefix - Legacy entity name prefix (for fallback)
     * @param entityMappings - Discovered entity mappings (preferred, optional)
     * @param deviceId - Device ID for device-level mapping lookup (preferred, optional)
     */
    async readZones(zoneMap, entityNamePrefix, entityMappings, deviceId) {
        const zones = [];
        const regularZoneMap = zoneMap.zoneConfigEntities || zoneMap;
        for (let i = 1; i <= 4; i++) {
            const key = `zone${i}`;
            const mapping = regularZoneMap[key];
            if (!mapping && !deviceId)
                continue;
            try {
                // Try device-level mapping first (preferred), then fall back to legacy resolution
                let zoneEntitySet = deviceId ? deviceEntityService_1.deviceEntityService.getZoneEntitySet(deviceId, 'regular', i) : null;
                if (!zoneEntitySet) {
                    zoneEntitySet = entityResolver_1.EntityResolver.resolveZoneEntitySet(entityMappings, entityNamePrefix, 'zoneConfigEntities', key, mapping);
                }
                if (!zoneEntitySet)
                    continue;
                const { beginX: beginXEntity, endX: endXEntity, beginY: beginYEntity, endY: endYEntity } = zoneEntitySet;
                const [beginXState, endXState, beginYState, endYState] = await Promise.all([
                    this.readTransport.getState(beginXEntity),
                    this.readTransport.getState(endXEntity),
                    this.readTransport.getState(beginYEntity),
                    this.readTransport.getState(endYEntity),
                ]);
                if (!beginXState || !endXState || !beginYState || !endYState)
                    continue;
                const beginX = this.parseStateNumber(beginXState);
                const endX = this.parseStateNumber(endXState);
                const beginY = this.parseStateNumber(beginYState);
                const endY = this.parseStateNumber(endYState);
                if (beginX === null || endX === null || beginY === null || endY === null)
                    continue;
                // Skip unconfigured zones (all zeros)
                if (beginX === 0 && endX === 0 && beginY === 0 && endY === 0)
                    continue;
                const x = Math.min(beginX, endX);
                const y = Math.min(beginY, endY);
                const width = Math.abs(endX - beginX);
                const height = Math.abs(endY - beginY);
                // Skip zones with no area
                if (width === 0 || height === 0)
                    continue;
                zones.push({
                    id: `Zone ${i}`,
                    type: 'regular',
                    x,
                    y,
                    width,
                    height,
                });
            }
            catch (error) {
                logger_1.logger.warn({ key, error }, 'Failed to read zone');
                continue;
            }
        }
        // Exclusion zones (occupancy masks)
        if (zoneMap.exclusionZoneConfigEntities || deviceId) {
            const exclusionMap = zoneMap.exclusionZoneConfigEntities || {};
            for (let i = 1; i <= 2; i++) {
                const key = `exclusion${i}`;
                const mapping = exclusionMap[key];
                if (!mapping && !deviceId)
                    continue;
                try {
                    // Try device-level mapping first
                    let zoneEntitySet = deviceId ? deviceEntityService_1.deviceEntityService.getZoneEntitySet(deviceId, 'exclusion', i) : null;
                    if (!zoneEntitySet) {
                        zoneEntitySet = entityResolver_1.EntityResolver.resolveZoneEntitySet(entityMappings, entityNamePrefix, 'exclusionZoneConfigEntities', key, mapping);
                    }
                    if (!zoneEntitySet)
                        continue;
                    const { beginX: beginXEntity, endX: endXEntity, beginY: beginYEntity, endY: endYEntity } = zoneEntitySet;
                    const [beginXState, endXState, beginYState, endYState] = await Promise.all([
                        this.readTransport.getState(beginXEntity),
                        this.readTransport.getState(endXEntity),
                        this.readTransport.getState(beginYEntity),
                        this.readTransport.getState(endYEntity),
                    ]);
                    if (!beginXState || !endXState || !beginYState || !endYState)
                        continue;
                    const beginX = this.parseStateNumber(beginXState);
                    const endX = this.parseStateNumber(endXState);
                    const beginY = this.parseStateNumber(beginYState);
                    const endY = this.parseStateNumber(endYState);
                    if (beginX === null || endX === null || beginY === null || endY === null)
                        continue;
                    if (beginX === 0 && endX === 0 && beginY === 0 && endY === 0)
                        continue;
                    const x = Math.min(beginX, endX);
                    const y = Math.min(beginY, endY);
                    const width = Math.abs(endX - beginX);
                    const height = Math.abs(endY - beginY);
                    if (width === 0 || height === 0)
                        continue;
                    zones.push({
                        id: `Exclusion ${i}`,
                        type: 'exclusion',
                        x,
                        y,
                        width,
                        height,
                    });
                }
                catch {
                    continue;
                }
            }
        }
        // Entry zones
        if (zoneMap.entryZoneConfigEntities || deviceId) {
            const entryMap = zoneMap.entryZoneConfigEntities || {};
            for (let i = 1; i <= 2; i++) {
                const key = `entry${i}`;
                const mapping = entryMap[key];
                if (!mapping && !deviceId)
                    continue;
                try {
                    // Try device-level mapping first
                    let zoneEntitySet = deviceId ? deviceEntityService_1.deviceEntityService.getZoneEntitySet(deviceId, 'entry', i) : null;
                    if (!zoneEntitySet) {
                        zoneEntitySet = entityResolver_1.EntityResolver.resolveZoneEntitySet(entityMappings, entityNamePrefix, 'entryZoneConfigEntities', key, mapping);
                    }
                    if (!zoneEntitySet)
                        continue;
                    const { beginX: beginXEntity, endX: endXEntity, beginY: beginYEntity, endY: endYEntity } = zoneEntitySet;
                    const [beginXState, endXState, beginYState, endYState] = await Promise.all([
                        this.readTransport.getState(beginXEntity),
                        this.readTransport.getState(endXEntity),
                        this.readTransport.getState(beginYEntity),
                        this.readTransport.getState(endYEntity),
                    ]);
                    if (!beginXState || !endXState || !beginYState || !endYState)
                        continue;
                    const beginX = this.parseStateNumber(beginXState);
                    const endX = this.parseStateNumber(endXState);
                    const beginY = this.parseStateNumber(beginYState);
                    const endY = this.parseStateNumber(endYState);
                    if (beginX === null || endX === null || beginY === null || endY === null)
                        continue;
                    if (beginX === 0 && endX === 0 && beginY === 0 && endY === 0)
                        continue;
                    const x = Math.min(beginX, endX);
                    const y = Math.min(beginY, endY);
                    const width = Math.abs(endX - beginX);
                    const height = Math.abs(endY - beginY);
                    if (width === 0 || height === 0)
                        continue;
                    zones.push({
                        id: `Entry ${i}`,
                        type: 'entry',
                        x,
                        y,
                        width,
                        height,
                    });
                }
                catch {
                    continue;
                }
            }
        }
        logger_1.logger.info({ count: zones.length, zones: zones.map(z => ({ id: z.id, type: z.type, x: z.x, y: z.y })) }, 'Read rectangular zones from device');
        return zones;
    }
}
exports.ZoneReader = ZoneReader;
