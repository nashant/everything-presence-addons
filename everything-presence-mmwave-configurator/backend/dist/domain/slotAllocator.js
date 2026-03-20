"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocateSlots = allocateSlots;
/**
 * Returns the maximum slot count for a given zone type from the profile limits.
 * Defaults to 0 if the limit or the profile field is undefined.
 */
function getMaxSlots(limits, zoneType) {
    switch (zoneType) {
        case 'regular':
            return limits.maxZones ?? 0;
        case 'exclusion':
            return limits.maxExclusionZones ?? 0;
        case 'entry':
            return limits.maxEntryZones ?? 0;
    }
}
/**
 * Pure slot allocator: maps room-level named zones to per-sensor hardware slot
 * assignments, respecting per-sensor, per-type capacity limits.
 *
 * Uses a greedy first-fit approach: iterates zones in order, and for each
 * participating sensor assigns the next available slot for that zone type.
 *
 * @param zones - Room zones to allocate (order determines priority)
 * @param sensors - Sensors attached to the room
 * @param getProfileLimits - Lookup function for device profile limits
 * @returns Assignments + structured errors for any failures
 */
function allocateSlots(zones, sensors, getProfileLimits) {
    const assignments = [];
    const errors = [];
    // Build sensor lookup for quick access
    const sensorMap = new Map();
    for (const sensor of sensors) {
        sensorMap.set(sensor.deviceId, sensor);
    }
    // Track per-sensor capacity usage
    const capacityUsed = new Map();
    for (const sensor of sensors) {
        capacityUsed.set(sensor.deviceId, { regular: 0, exclusion: 0, entry: 0 });
    }
    // Greedy first-fit: iterate zones in order
    for (const zone of zones) {
        // Find participating sensors (only those present in the sensors array)
        const participatingDeviceIds = Object.entries(zone.sensorParticipation)
            .filter(([deviceId, participating]) => participating && sensorMap.has(deviceId))
            .map(([deviceId]) => deviceId)
            // Sort for deterministic ordering
            .sort();
        for (const deviceId of participatingDeviceIds) {
            const sensor = sensorMap.get(deviceId);
            const limits = getProfileLimits(sensor.profileId);
            // Missing profile → error
            if (!limits) {
                errors.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    deviceId,
                    reason: `Unknown device profile "${sensor.profileId}" — cannot determine zone capacity`,
                });
                continue;
            }
            const maxForType = getMaxSlots(limits, zone.type);
            const totalMax = (limits.maxZones ?? 0) +
                (limits.maxExclusionZones ?? 0) +
                (limits.maxEntryZones ?? 0);
            // Device doesn't support any zones at all
            if (totalMax === 0) {
                errors.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    deviceId,
                    reason: `Device profile "${sensor.profileId}" does not support zones`,
                });
                continue;
            }
            // Zone type not supported (e.g., entry on EP Pro)
            if (maxForType === 0) {
                errors.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    deviceId,
                    reason: `Device profile "${sensor.profileId}" does not support ${zone.type} zones (max: 0)`,
                });
                continue;
            }
            // Check capacity
            const used = capacityUsed.get(deviceId);
            const usedForType = used[zone.type];
            if (usedForType >= maxForType) {
                errors.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    deviceId,
                    reason: `Sensor at capacity for ${zone.type} zones (${usedForType}/${maxForType})`,
                });
                continue;
            }
            // Assign next slot (1-indexed)
            const slotIndex = usedForType + 1;
            assignments.push({
                deviceId,
                slotIndex,
                zoneId: zone.id,
                zoneType: zone.type,
            });
            // Update capacity tracker
            used[zone.type] = usedForType + 1;
        }
    }
    return { assignments, errors };
}
