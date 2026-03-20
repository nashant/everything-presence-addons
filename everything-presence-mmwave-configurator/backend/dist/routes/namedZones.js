"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNamedZonesRouter = exports.parseRoomZone = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const storage_1 = require("../config/storage");
const logger_1 = require("../logger");
const VALID_ZONE_TYPES = ['regular', 'exclusion', 'entry'];
/**
 * Validate and parse a Point (x, y).
 */
const parsePoint = (p) => {
    if (!p || typeof p !== 'object')
        return null;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return null;
    return { x, y };
};
/**
 * Validate and parse zone geometry — either a ZoneRect or ZonePolygon.
 * Returns the parsed geometry or a string error message.
 */
const parseGeometry = (geo) => {
    if (!geo || typeof geo !== 'object') {
        return { ok: false, error: 'geometry is required' };
    }
    // Polygon: has 'vertices' array
    if (Array.isArray(geo.vertices)) {
        const vertices = geo.vertices.map(parsePoint).filter((p) => p !== null);
        if (vertices.length < 3) {
            return { ok: false, error: 'Polygon geometry requires at least 3 valid vertices' };
        }
        const polygon = {
            id: typeof geo.id === 'string' ? geo.id : (0, uuid_1.v4)(),
            type: VALID_ZONE_TYPES.includes(geo.type) ? geo.type : 'regular',
            vertices,
            enabled: geo.enabled !== undefined ? Boolean(geo.enabled) : undefined,
            label: typeof geo.label === 'string' && geo.label.trim() ? geo.label.trim() : undefined,
        };
        return { ok: true, geometry: polygon };
    }
    // Rectangle: must have width and height
    const width = Number(geo.width);
    const height = Number(geo.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return { ok: false, error: 'Rect geometry requires numeric width and height' };
    }
    const rect = {
        id: typeof geo.id === 'string' ? geo.id : (0, uuid_1.v4)(),
        type: VALID_ZONE_TYPES.includes(geo.type) ? geo.type : 'regular',
        x: Number(geo.x ?? 0),
        y: Number(geo.y ?? 0),
        width,
        height,
        enabled: geo.enabled !== undefined ? Boolean(geo.enabled) : undefined,
        label: typeof geo.label === 'string' && geo.label.trim() ? geo.label.trim() : undefined,
    };
    return { ok: true, geometry: rect };
};
/**
 * Validate and parse a RoomZone from request body.
 * Returns the parsed zone or a string error message.
 * On create (no existingId), assigns a new UUID.
 */
const parseRoomZone = (body, existingId) => {
    // Name validation
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
        return { ok: false, error: 'name is required and must be a non-empty string' };
    }
    // Type validation
    const type = VALID_ZONE_TYPES.includes(body?.type) ? body.type : undefined;
    if (!type) {
        return { ok: false, error: `type must be one of: ${VALID_ZONE_TYPES.join(', ')}` };
    }
    // sensorParticipation validation
    const sensorParticipation = {};
    if (body?.sensorParticipation && typeof body.sensorParticipation === 'object') {
        for (const [key, val] of Object.entries(body.sensorParticipation)) {
            sensorParticipation[key] = Boolean(val);
        }
    }
    // Geometry validation
    const geoResult = parseGeometry(body?.geometry);
    if (!geoResult.ok) {
        return { ok: false, error: geoResult.error };
    }
    const zone = {
        id: existingId ?? (0, uuid_1.v4)(),
        name,
        type,
        sensorParticipation,
        geometry: geoResult.geometry,
    };
    return { ok: true, zone };
};
exports.parseRoomZone = parseRoomZone;
const createNamedZonesRouter = () => {
    const router = (0, express_1.Router)();
    // GET /api/rooms/:roomId/named-zones — list all named zones for a room
    router.get('/:roomId/named-zones', (req, res) => {
        const room = storage_1.storage.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        return res.json({ zones: room.namedZones ?? [] });
    });
    // POST /api/rooms/:roomId/named-zones — create a new named zone
    router.post('/:roomId/named-zones', (req, res) => {
        const room = storage_1.storage.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const result = (0, exports.parseRoomZone)(req.body);
        if (!result.ok) {
            logger_1.logger.warn({ roomId: req.params.roomId, error: result.error }, 'Named zone validation failed');
            return res.status(400).json({ message: result.error });
        }
        const namedZones = [...(room.namedZones ?? []), result.zone];
        const updated = { ...room, namedZones };
        storage_1.storage.saveRoom(updated);
        logger_1.logger.info({ roomId: room.id, zoneId: result.zone.id, zoneName: result.zone.name }, 'Named zone created');
        return res.status(201).json({ zone: result.zone });
    });
    // PUT /api/rooms/:roomId/named-zones/:zoneId — update an existing named zone
    router.put('/:roomId/named-zones/:zoneId', (req, res) => {
        const room = storage_1.storage.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const namedZones = room.namedZones ?? [];
        const idx = namedZones.findIndex(z => z.id === req.params.zoneId);
        if (idx === -1) {
            return res.status(404).json({ message: 'Zone not found' });
        }
        const existing = namedZones[idx];
        // Merge: body fields override existing, preserve id
        const merged = {
            ...existing,
            ...req.body,
            id: existing.id, // never allow id to change
        };
        const result = (0, exports.parseRoomZone)(merged, existing.id);
        if (!result.ok) {
            logger_1.logger.warn({ roomId: req.params.roomId, zoneId: req.params.zoneId, error: result.error }, 'Named zone update validation failed');
            return res.status(400).json({ message: result.error });
        }
        const updatedZones = [...namedZones];
        updatedZones[idx] = result.zone;
        const updated = { ...room, namedZones: updatedZones };
        storage_1.storage.saveRoom(updated);
        logger_1.logger.info({ roomId: room.id, zoneId: result.zone.id, zoneName: result.zone.name }, 'Named zone updated');
        return res.json({ zone: result.zone });
    });
    // DELETE /api/rooms/:roomId/named-zones/:zoneId — delete a named zone
    router.delete('/:roomId/named-zones/:zoneId', (req, res) => {
        const room = storage_1.storage.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const namedZones = room.namedZones ?? [];
        const idx = namedZones.findIndex(z => z.id === req.params.zoneId);
        if (idx === -1) {
            return res.status(404).json({ message: 'Zone not found' });
        }
        const removedZone = namedZones[idx];
        const updatedZones = namedZones.filter(z => z.id !== req.params.zoneId);
        const updated = { ...room, namedZones: updatedZones };
        storage_1.storage.saveRoom(updated);
        logger_1.logger.info({ roomId: room.id, zoneId: removedZone.id, zoneName: removedZone.name }, 'Named zone deleted');
        return res.json({ ok: true });
    });
    return router;
};
exports.createNamedZonesRouter = createNamedZonesRouter;
