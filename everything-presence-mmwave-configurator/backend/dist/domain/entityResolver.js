"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityResolver = void 0;
const logger_1 = require("../logger");
const deviceMappingStorage_1 = require("../config/deviceMappingStorage");
const deviceEntityService_1 = require("./deviceEntityService");
// Track devices for which we've already logged deprecation warnings
const deprecationWarned = new Set();
/**
 * Utility for resolving entity IDs from stored mappings or template patterns.
 * Provides backward compatibility during migration from entityNamePrefix to entityMappings.
 *
 * PREFERRED: Use deviceEntityService for new code. This class is maintained for
 * backward compatibility during migration.
 */
class EntityResolver {
    /**
     * Resolve an entity ID directly from device-level storage.
     * This is the preferred method for new code.
     *
     * @param deviceId - Home Assistant device ID
     * @param entityKey - Key in the device mappings (e.g., "presence", "maxDistance")
     * @returns Resolved entity ID or null if not found
     */
    static resolveFromDevice(deviceId, entityKey) {
        return deviceEntityService_1.deviceEntityService.getEntityId(deviceId, entityKey);
    }
    /**
     * Check if a device has mappings in device-level storage.
     */
    static hasDeviceMappings(deviceId) {
        return deviceMappingStorage_1.deviceMappingStorage.hasMapping(deviceId);
    }
    /**
     * Check if a room has entity mappings configured.
     */
    static hasMappings(room) {
        return !!room.entityMappings && Object.keys(room.entityMappings).length > 3; // More than just metadata
    }
    /**
     * Resolve an entity ID from mappings, with fallback to template resolution.
     *
     * @param mappings - Stored entity mappings (preferred)
     * @param entityNamePrefix - Legacy prefix for template resolution (fallback)
     * @param mappingKey - Key in the mappings object (e.g., "presenceEntity")
     * @param template - Template pattern for fallback (e.g., "binary_sensor.${name}_occupancy")
     * @returns Resolved entity ID or null if not found
     */
    static resolve(mappings, entityNamePrefix, mappingKey, template) {
        // First, try to get from stored mappings
        if (mappings) {
            const stored = mappings[mappingKey];
            if (typeof stored === 'string') {
                return stored;
            }
        }
        // Fallback to template resolution
        if (template && entityNamePrefix) {
            return template.replace('${name}', entityNamePrefix);
        }
        return null;
    }
    /**
     * Resolve a zone entity set from mappings or templates.
     *
     * @param mappings - Stored entity mappings
     * @param entityNamePrefix - Legacy prefix
     * @param mappingGroupKey - Key for the zone group (e.g., "zoneConfigEntities")
     * @param zoneKey - Key for the specific zone (e.g., "zone1")
     * @param templateGroup - Template group from device profile
     * @returns Resolved zone entity set or null
     */
    static resolveZoneEntitySet(mappings, entityNamePrefix, mappingGroupKey, zoneKey, templateGroup) {
        // Try stored mappings first
        if (mappings) {
            const group = mappings[mappingGroupKey];
            if (group && typeof group === 'object') {
                const zoneSet = group[zoneKey];
                if (zoneSet && zoneSet.beginX && zoneSet.endX && zoneSet.beginY && zoneSet.endY) {
                    return zoneSet;
                }
            }
        }
        // Fallback to template resolution
        if (templateGroup && entityNamePrefix) {
            const beginX = templateGroup.beginX?.replace('${name}', entityNamePrefix);
            const endX = templateGroup.endX?.replace('${name}', entityNamePrefix);
            const beginY = templateGroup.beginY?.replace('${name}', entityNamePrefix);
            const endY = templateGroup.endY?.replace('${name}', entityNamePrefix);
            if (beginX && endX && beginY && endY) {
                return {
                    beginX,
                    endX,
                    beginY,
                    endY,
                    offDelay: templateGroup.offDelay?.replace('${name}', entityNamePrefix),
                };
            }
        }
        return null;
    }
    /**
     * Resolve a polygon zone entity from mappings or templates.
     */
    static resolvePolygonZoneEntity(mappings, entityNamePrefix, mappingGroupKey, zoneKey, template) {
        // Try stored mappings first
        if (mappings) {
            const group = mappings[mappingGroupKey];
            if (group && typeof group === 'object') {
                const entityId = group[zoneKey];
                if (typeof entityId === 'string') {
                    return entityId;
                }
            }
        }
        // Fallback to template resolution
        if (template && entityNamePrefix) {
            return template.replace('${name}', entityNamePrefix);
        }
        return null;
    }
    /**
     * Resolve a tracking target entity.
     */
    static resolveTargetEntity(mappings, entityNamePrefix, targetNum, property) {
        const targetKey = `target${targetNum}`;
        // Try stored mappings first
        if (mappings?.trackingTargets) {
            const target = mappings.trackingTargets[targetKey];
            if (target && typeof target[property] === 'string') {
                return target[property];
            }
        }
        // Fallback to template resolution
        if (entityNamePrefix) {
            const domain = property === 'active' ? 'binary_sensor' : 'sensor';
            return `${domain}.${entityNamePrefix}_target_${targetNum}_${property}`;
        }
        return null;
    }
    /**
     * Get the effective entity prefix from mappings or legacy field.
     * Useful for operations that still need a prefix (e.g., logging, debugging).
     */
    static getEffectivePrefix(room) {
        // If we have mappings, try to extract a prefix from one of the entities
        if (room.entityMappings?.presenceEntity) {
            const match = room.entityMappings.presenceEntity.match(/^[^.]+\.(.+)_occupancy$/);
            if (match)
                return match[1];
        }
        // Fall back to legacy field
        return room.entityNamePrefix;
    }
    /**
     * Check if mappings need re-discovery (e.g., missing critical entities).
     */
    static needsRediscovery(mappings, requiredKeys) {
        if (!mappings) {
            return { needed: true, missingKeys: requiredKeys };
        }
        const missingKeys = [];
        for (const key of requiredKeys) {
            const value = mappings[key];
            if (!value || (typeof value !== 'string' && typeof value !== 'object')) {
                missingKeys.push(key);
            }
        }
        return {
            needed: missingKeys.length > 0,
            missingKeys,
        };
    }
    /**
     * Create a resolver function for a specific room.
     * Useful for repeated resolution in loops.
     *
     * UPDATED: Now tries device-level mappings first, then falls back to room.entityMappings.
     * Uses getEffectivePrefix to derive the most reliable prefix from mappings.
     */
    static createResolver(room) {
        const { entityMappings, deviceId } = room;
        // Use effective prefix derived from mappings (more reliable than potentially corrupted entityNamePrefix)
        const effectivePrefix = EntityResolver.getEffectivePrefix(room);
        // Check if device has mappings in device-level storage (preferred)
        const hasDeviceMapping = deviceId ? deviceMappingStorage_1.deviceMappingStorage.hasMapping(deviceId) : false;
        // Log deprecation warning once per device when falling back to room mappings
        if (!hasDeviceMapping && entityMappings && deviceId && !deprecationWarned.has(deviceId)) {
            logger_1.logger.warn({ deviceId, roomId: room.id }, 'Using deprecated room.entityMappings - device needs migration to device-level storage');
            deprecationWarned.add(deviceId);
        }
        return {
            /**
             * Resolve an entity by mapping key.
             * Tries device-level mapping first, then room.entityMappings, then template.
             */
            resolve: (mappingKey, template) => {
                // Try device-level mapping first (preferred)
                if (hasDeviceMapping && deviceId) {
                    const deviceResult = deviceEntityService_1.deviceEntityService.getEntityId(deviceId, mappingKey);
                    if (deviceResult)
                        return deviceResult;
                }
                // Fall back to room.entityMappings (deprecated)
                return EntityResolver.resolve(entityMappings, effectivePrefix, mappingKey, template);
            },
            /**
             * Resolve zone coordinate entities.
             * Tries device-level mapping first for zone entity sets.
             */
            resolveZone: (groupKey, zoneKey, templateGroup) => {
                // Try device-level mapping first
                if (hasDeviceMapping && deviceId) {
                    const zoneType = groupKey === 'zoneConfigEntities' ? 'regular'
                        : groupKey === 'exclusionZoneConfigEntities' ? 'exclusion' : 'entry';
                    const zoneIndex = parseInt(zoneKey.replace(/\D/g, ''), 10) || 1;
                    const deviceResult = deviceEntityService_1.deviceEntityService.getZoneEntitySet(deviceId, zoneType, zoneIndex);
                    if (deviceResult)
                        return deviceResult;
                }
                // Fall back to room.entityMappings
                return EntityResolver.resolveZoneEntitySet(entityMappings, effectivePrefix, groupKey, zoneKey, templateGroup);
            },
            /**
             * Resolve polygon zone entity.
             * Tries device-level mapping first.
             */
            resolvePolygon: (groupKey, zoneKey, template) => {
                // Try device-level mapping first
                if (hasDeviceMapping && deviceId) {
                    const zoneType = groupKey === 'polygonZoneEntities' ? 'polygon'
                        : groupKey === 'polygonExclusionEntities' ? 'polygonExclusion' : 'polygonEntry';
                    const zoneIndex = parseInt(zoneKey.replace(/\D/g, ''), 10) || 1;
                    const deviceResult = deviceEntityService_1.deviceEntityService.getPolygonZoneEntity(deviceId, zoneType, zoneIndex);
                    if (deviceResult)
                        return deviceResult;
                }
                // Fall back to room.entityMappings
                return EntityResolver.resolvePolygonZoneEntity(entityMappings, effectivePrefix, groupKey, zoneKey, template);
            },
            /**
             * Resolve tracking target entity.
             * Tries device-level mapping first.
             */
            resolveTarget: (targetNum, property) => {
                // Try device-level mapping first
                if (hasDeviceMapping && deviceId) {
                    const targetSet = deviceEntityService_1.deviceEntityService.getTargetEntities(deviceId, targetNum);
                    if (targetSet && targetSet[property]) {
                        return targetSet[property];
                    }
                }
                // Fall back to room.entityMappings
                return EntityResolver.resolveTargetEntity(entityMappings, effectivePrefix, targetNum, property);
            },
            /**
             * Check if room has any entity mappings (device or room level).
             */
            hasMappings: () => hasDeviceMapping || EntityResolver.hasMappings(room),
            /**
             * Check if device has device-level mappings (preferred).
             */
            hasDeviceMappings: () => hasDeviceMapping,
            /**
             * Get the effective entity prefix.
             */
            getPrefix: () => effectivePrefix,
            /**
             * Get the device ID for this room.
             */
            getDeviceId: () => deviceId,
        };
    }
    /**
     * Clear the deprecation warning cache (for testing).
     */
    static clearDeprecationWarnings() {
        deprecationWarned.clear();
    }
}
exports.EntityResolver = EntityResolver;
