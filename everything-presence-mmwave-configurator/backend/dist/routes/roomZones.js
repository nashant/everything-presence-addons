"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoomZonesRouter = void 0;
exports.buildSyntheticZoneId = buildSyntheticZoneId;
const express_1 = require("express");
const storage_1 = require("../config/storage");
const deviceDiscovery_1 = require("../domain/deviceDiscovery");
const zoneWriter_1 = require("../ha/zoneWriter");
const coordinateTransform_1 = require("../domain/coordinateTransform");
const types_1 = require("../domain/types");
const slotAllocator_1 = require("../domain/slotAllocator");
const deviceMappingStorage_1 = require("../config/deviceMappingStorage");
const logger_1 = require("../logger");
/**
 * Build a synthetic zone ID that matches ZoneWriter's extractZoneIndex() convention.
 * e.g., buildSyntheticZoneId('regular', 2) → "Zone 2"
 *       buildSyntheticZoneId('exclusion', 1) → "Exclusion 1"
 *       buildSyntheticZoneId('entry', 3) → "Entry 3"
 */
function buildSyntheticZoneId(type, slotIndex) {
    switch (type) {
        case 'regular':
            return `Zone ${slotIndex}`;
        case 'exclusion':
            return `Exclusion ${slotIndex}`;
        case 'entry':
            return `Entry ${slotIndex}`;
    }
}
const createRoomZonesRouter = (deps) => {
    const router = (0, express_1.Router)();
    const { readTransport, writeClient, profileLoader } = deps;
    const zoneWriter = new zoneWriter_1.ZoneWriter(writeClient);
    const discovery = new deviceDiscovery_1.DeviceDiscoveryService(readTransport);
    /**
     * POST /api/rooms/:roomId/zones/push
     *
     * Push room-level zones to one or more sensors attached to the room.
     * For each sensor, zones are transformed from room-space to device-space
     * using the sensor's placement and installation angle.
     *
     * When the room has `namedZones`, the slot allocator is used to map
     * room-level named zones to per-sensor hardware slots. Mixed rect/polygon
     * geometry is supported.
     *
     * When `namedZones` is absent/empty, the legacy flow is used (backward compat).
     *
     * Body:
     * - deviceIds?: string[]         — push to specific sensors only (default: all)
     * - polygonMode?: boolean        — push polygon zones instead of rect zones (legacy flow)
     * - polygonZones?: ZonePolygon[] — polygon zones (required if polygonMode, legacy flow)
     */
    router.post('/:roomId/zones/push', async (req, res) => {
        const room = storage_1.storage.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const sensors = room.sensors ?? [];
        if (sensors.length === 0) {
            return res.status(400).json({ message: 'Room has no sensors attached' });
        }
        const requestedDeviceIds = req.body?.deviceIds;
        const sensorsToProcess = requestedDeviceIds?.length
            ? sensors.filter(s => requestedDeviceIds.includes(s.deviceId))
            : sensors;
        if (sensorsToProcess.length === 0) {
            return res.status(400).json({ message: 'No matching sensors found' });
        }
        // ── Named zones path ─────────────────────────────────────────
        const namedZones = room.namedZones;
        if (namedZones && namedZones.length > 0) {
            return await pushNamedZones(room, namedZones, sensorsToProcess, req, res);
        }
        // ── Legacy path (backward compat) ────────────────────────────
        const polygonMode = Boolean(req.body?.polygonMode);
        const polygonZones = Array.isArray(req.body?.polygonZones) ? req.body.polygonZones : [];
        // Discover all HA devices to get entityNamePrefix for each sensor
        let deviceLookup = new Map();
        try {
            const devices = await discovery.discover();
            deviceLookup = new Map(devices.map(d => [d.id, d]));
        }
        catch (err) {
            logger_1.logger.warn({ error: err }, 'Device discovery failed for room zone push; will rely on device mappings');
        }
        const results = [];
        for (const sensor of sensorsToProcess) {
            try {
                const profile = profileLoader.getProfileById(sensor.profileId);
                if (!profile) {
                    results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: `Profile "${sensor.profileId}" not found` });
                    continue;
                }
                const device = deviceLookup.get(sensor.deviceId);
                const entityNamePrefix = device?.entityNamePrefix ?? '';
                const hasDeviceMapping = deviceMappingStorage_1.deviceMappingStorage.hasMapping(sensor.deviceId);
                if (!entityNamePrefix && !hasDeviceMapping) {
                    results.push({
                        deviceId: sensor.deviceId,
                        label: sensor.label,
                        ok: false,
                        error: 'No entity name prefix and no device mapping found. Run entity discovery first.',
                    });
                    continue;
                }
                const zoneMap = profile.entityMap;
                if (!zoneMap) {
                    results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: 'Profile does not define zone entities' });
                    continue;
                }
                if (polygonMode) {
                    // Transform polygon zones from room-space to device-space
                    const devicePolygonZones = polygonZones.map(zone => (0, coordinateTransform_1.transformZonePolygonToDevice)(zone, sensor.placement));
                    const result = await zoneWriter.applyPolygonZones(zoneMap, devicePolygonZones, entityNamePrefix, undefined, sensor.deviceId);
                    results.push({
                        deviceId: sensor.deviceId,
                        label: sensor.label,
                        ok: result.ok,
                        warnings: result.failures.length > 0 ? result.failures : undefined,
                    });
                }
                else {
                    // Transform rect zones from room-space to device-space
                    const deviceZones = (room.zones ?? []).map(zone => (0, coordinateTransform_1.transformZoneRectToDevice)(zone, sensor.placement));
                    const result = await zoneWriter.applyZones(zoneMap, deviceZones, entityNamePrefix, undefined, sensor.deviceId);
                    results.push({
                        deviceId: sensor.deviceId,
                        label: sensor.label,
                        ok: result.ok,
                        warnings: result.failures.length > 0 ? result.failures : undefined,
                    });
                }
                logger_1.logger.info({ deviceId: sensor.deviceId, roomId: room.id, polygonMode }, 'Pushed zones to sensor');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger_1.logger.error({ error: err, deviceId: sensor.deviceId, roomId: room.id }, 'Failed to push zones to sensor');
                results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: message });
            }
        }
        const allOk = results.every(r => r.ok);
        return res.json({ ok: allOk, results });
    });
    /**
     * Named-zone push: runs the slot allocator, builds synthetic zone objects
     * per sensor, transforms coordinates, and writes via ZoneWriter.
     */
    async function pushNamedZones(room, namedZones, sensorsToProcess, _req, res) {
        const profileLimitsGetter = (profileId) => {
            const profile = profileLoader.getProfileById(profileId);
            return profile?.limits;
        };
        // Run slot allocator
        const allocation = (0, slotAllocator_1.allocateSlots)(namedZones, sensorsToProcess, profileLimitsGetter);
        if (allocation.errors.length > 0) {
            logger_1.logger.warn({ roomId: room.id, allocationErrors: allocation.errors }, 'Named zone allocation produced errors');
        }
        logger_1.logger.info({ roomId: room.id, zoneCount: namedZones.length, sensorCount: sensorsToProcess.length, assignmentCount: allocation.assignments.length }, 'Named zone push: allocator finished');
        // Build zone-lookup by ID for fast geometry access
        const zoneById = new Map(namedZones.map(z => [z.id, z]));
        // Group assignments by deviceId
        const assignmentsByDevice = new Map();
        for (const assignment of allocation.assignments) {
            let arr = assignmentsByDevice.get(assignment.deviceId);
            if (!arr) {
                arr = [];
                assignmentsByDevice.set(assignment.deviceId, arr);
            }
            arr.push(assignment);
        }
        // Discover HA devices for entityNamePrefix
        let deviceLookup = new Map();
        try {
            const devices = await discovery.discover();
            deviceLookup = new Map(devices.map(d => [d.id, d]));
        }
        catch (err) {
            logger_1.logger.warn({ error: err }, 'Device discovery failed for named zone push; will rely on device mappings');
        }
        const results = [];
        for (const sensor of sensorsToProcess) {
            try {
                const profile = profileLoader.getProfileById(sensor.profileId);
                if (!profile) {
                    results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: `Profile "${sensor.profileId}" not found` });
                    continue;
                }
                const device = deviceLookup.get(sensor.deviceId);
                const entityNamePrefix = device?.entityNamePrefix ?? '';
                const hasDeviceMapping = deviceMappingStorage_1.deviceMappingStorage.hasMapping(sensor.deviceId);
                if (!entityNamePrefix && !hasDeviceMapping) {
                    results.push({
                        deviceId: sensor.deviceId,
                        label: sensor.label,
                        ok: false,
                        error: 'No entity name prefix and no device mapping found. Run entity discovery first.',
                    });
                    continue;
                }
                const zoneMap = profile.entityMap;
                if (!zoneMap) {
                    results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: 'Profile does not define zone entities' });
                    continue;
                }
                const sensorAssignments = assignmentsByDevice.get(sensor.deviceId) ?? [];
                // Build synthetic zone objects from assignments, separated by geometry type
                const rectZones = [];
                const polyZones = [];
                for (const assignment of sensorAssignments) {
                    const sourceZone = zoneById.get(assignment.zoneId);
                    if (!sourceZone)
                        continue;
                    const syntheticId = buildSyntheticZoneId(assignment.zoneType, assignment.slotIndex);
                    const geometry = sourceZone.geometry;
                    if ((0, types_1.isZonePolygon)(geometry)) {
                        const polyZone = {
                            id: syntheticId,
                            type: assignment.zoneType,
                            vertices: geometry.vertices,
                            label: sourceZone.name,
                        };
                        const transformed = (0, coordinateTransform_1.transformZonePolygonToDevice)(polyZone, sensor.placement);
                        polyZones.push(transformed);
                    }
                    else if ((0, types_1.isZoneRect)(geometry)) {
                        const rectZone = {
                            id: syntheticId,
                            type: assignment.zoneType,
                            x: geometry.x,
                            y: geometry.y,
                            width: geometry.width,
                            height: geometry.height,
                            label: sourceZone.name,
                        };
                        const transformed = (0, coordinateTransform_1.transformZoneRectToDevice)(rectZone, sensor.placement);
                        rectZones.push(transformed);
                    }
                }
                // Push rect zones if any
                let rectResult = { ok: true, failures: [] };
                if (rectZones.length > 0) {
                    rectResult = await zoneWriter.applyZones(zoneMap, rectZones, entityNamePrefix, undefined, sensor.deviceId);
                }
                // Push polygon zones if any
                let polyResult = { ok: true, failures: [] };
                if (polyZones.length > 0) {
                    polyResult = await zoneWriter.applyPolygonZones(zoneMap, polyZones, entityNamePrefix, undefined, sensor.deviceId);
                }
                const allFailures = [...rectResult.failures, ...polyResult.failures];
                const ok = rectResult.ok && polyResult.ok;
                results.push({
                    deviceId: sensor.deviceId,
                    label: sensor.label,
                    ok,
                    warnings: allFailures.length > 0 ? allFailures : undefined,
                });
                logger_1.logger.info({ deviceId: sensor.deviceId, roomId: room.id, rectZones: rectZones.length, polyZones: polyZones.length }, 'Pushed named zones to sensor');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger_1.logger.error({ error: err, deviceId: sensor.deviceId, roomId: room.id }, 'Failed to push named zones to sensor');
                results.push({ deviceId: sensor.deviceId, label: sensor.label, ok: false, error: message });
            }
        }
        const allOk = results.every(r => r.ok);
        return res.json({ ok: allOk, results, allocationErrors: allocation.errors });
    }
    return router;
};
exports.createRoomZonesRouter = createRoomZonesRouter;
