/**
 * Coordinate transform: room-space ↔ device-space.
 *
 * Pure functions — no side effects, no HA/backend dependencies.
 *
 * Convention (matching frontend buildRadarPath in geometry.ts):
 * - rotationDeg 0° means sensor forward is +Y in room-space
 * - Effective angle = (rotationDeg + 90) × π / 180
 * - Room→Device: translate to sensor origin, then rotate by −effectiveAngle
 * - Device→Room: rotate by +effectiveAngle, then translate back
 *
 * ZoneRect x,y is CENTER (frontend convention). Output uses begin/end format
 * for downstream zoneWriter compatibility.
 *
 * All coordinates are in mm.
 */

import {
	type Zone,
	type ZoneRect,
	type ZonePolygon,
	type Point,
	type DevicePlacement,
	isZoneRect,
} from "./types";

// ─────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────

export interface DeviceZoneRect {
	id: string;
	type: "regular" | "exclusion" | "entry";
	beginX: number;
	endX: number;
	beginY: number;
	endY: number;
	enabled?: boolean;
	label?: string;
}

export interface DeviceZonePolygon {
	id: string;
	type: "regular" | "exclusion" | "entry";
	vertices: Point[];
	enabled?: boolean;
	label?: string;
}

export type DeviceZone = DeviceZoneRect | DeviceZonePolygon;

export function isDeviceZoneRect(dz: DeviceZone): dz is DeviceZoneRect {
	return "beginX" in dz;
}

// ─────────────────────────────────────────────────────────────────
// Core point transform
// ─────────────────────────────────────────────────────────────────

/**
 * Compute the effective rotation angle in radians from a DevicePlacement.
 * Adds the 90° offset so 0° rotationDeg means sensor forward is +Y.
 */
function effectiveAngleRad(rotationDeg: number): number {
	return ((rotationDeg + 90) * Math.PI) / 180;
}

/**
 * Transform a single point from room-space to device-space.
 *
 * 1. Translate: subtract sensor position
 * 2. Rotate by −effectiveAngle (undoing the sensor's orientation)
 */
export function transformPoint(
	point: Point,
	sensor: DevicePlacement,
): Point {
	const angle = effectiveAngleRad(sensor.rotationDeg ?? 0);
	const cos = Math.cos(-angle);
	const sin = Math.sin(-angle);

	// Translate to sensor-relative
	const dx = point.x - sensor.x;
	const dy = point.y - sensor.y;

	// Rotate
	return {
		x: dx * cos - dy * sin,
		y: dx * sin + dy * cos,
	};
}

/**
 * Inverse: transform a point from device-space back to room-space.
 *
 * 1. Rotate by +effectiveAngle
 * 2. Translate: add sensor position
 */
export function inverseTransformPoint(
	point: Point,
	sensor: DevicePlacement,
): Point {
	const angle = effectiveAngleRad(sensor.rotationDeg ?? 0);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	// Rotate back to room orientation
	const rx = point.x * cos - point.y * sin;
	const ry = point.x * sin + point.y * cos;

	// Translate back to room origin
	return {
		x: rx + sensor.x,
		y: ry + sensor.y,
	};
}

// ─────────────────────────────────────────────────────────────────
// Zone transforms: room-space → device-space
// ─────────────────────────────────────────────────────────────────

/**
 * Transform a ZoneRect from room-space (center-based) to device-space (begin/end).
 *
 * Transforms the four corners of the rect, then takes the axis-aligned
 * bounding box in device-space as the begin/end output.
 *
 * Note: For non-axis-aligned rotations (e.g. 45°) the bounding box will be
 * larger than the original rect. This is the correct behavior — the device
 * firmware expects axis-aligned zones.
 */
function transformRectToDevice(
	zone: ZoneRect,
	sensor: DevicePlacement,
): DeviceZoneRect {
	const halfW = zone.width / 2;
	const halfH = zone.height / 2;

	// Four corners from center-based rect (no rotation on the zone itself)
	const corners: Point[] = [
		{ x: zone.x - halfW, y: zone.y - halfH },
		{ x: zone.x + halfW, y: zone.y - halfH },
		{ x: zone.x + halfW, y: zone.y + halfH },
		{ x: zone.x - halfW, y: zone.y + halfH },
	];

	const deviceCorners = corners.map((c) => transformPoint(c, sensor));

	const xs = deviceCorners.map((p) => p.x);
	const ys = deviceCorners.map((p) => p.y);

	return {
		id: zone.id,
		type: zone.type,
		beginX: Math.min(...xs),
		endX: Math.max(...xs),
		beginY: Math.min(...ys),
		endY: Math.max(...ys),
		...(zone.enabled !== undefined && { enabled: zone.enabled }),
		...(zone.label !== undefined && { label: zone.label }),
	};
}

/**
 * Transform a ZonePolygon from room-space to device-space.
 */
function transformPolygonToDevice(
	zone: ZonePolygon,
	sensor: DevicePlacement,
): DeviceZonePolygon {
	return {
		id: zone.id,
		type: zone.type,
		vertices: zone.vertices.map((v) => transformPoint(v, sensor)),
		...(zone.enabled !== undefined && { enabled: zone.enabled }),
		...(zone.label !== undefined && { label: zone.label }),
	};
}

/**
 * Transform any zone from room-space to device-space.
 */
export function transformZoneToDeviceSpace(
	zone: Zone,
	sensor: DevicePlacement,
): DeviceZone {
	if (isZoneRect(zone)) {
		return transformRectToDevice(zone, sensor);
	}
	return transformPolygonToDevice(zone as ZonePolygon, sensor);
}

/**
 * Batch transform: all zones from room-space to device-space.
 */
export function transformZonesToDeviceSpace(
	zones: Zone[],
	sensor: DevicePlacement,
): DeviceZone[] {
	return zones.map((z) => transformZoneToDeviceSpace(z, sensor));
}

// ─────────────────────────────────────────────────────────────────
// Zone transforms: device-space → room-space (inverse)
// ─────────────────────────────────────────────────────────────────

/**
 * Transform a DeviceZoneRect back to a room-space ZoneRect.
 *
 * Converts begin/end back to center + width/height by inverse-transforming
 * the four corners, then taking the bounding box center and extents.
 *
 * For axis-aligned rotations (0°, 90°, 180°, 270°) this round-trips exactly.
 * For non-axis-aligned rotations the bounding box expansion means the
 * round-tripped rect may be larger than the original.
 */
function inverseTransformRectToRoom(
	dz: DeviceZoneRect,
	sensor: DevicePlacement,
): ZoneRect {
	const corners: Point[] = [
		{ x: dz.beginX, y: dz.beginY },
		{ x: dz.endX, y: dz.beginY },
		{ x: dz.endX, y: dz.endY },
		{ x: dz.beginX, y: dz.endY },
	];

	const roomCorners = corners.map((c) => inverseTransformPoint(c, sensor));

	const xs = roomCorners.map((p) => p.x);
	const ys = roomCorners.map((p) => p.y);

	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	return {
		id: dz.id,
		type: dz.type,
		x: (minX + maxX) / 2,
		y: (minY + maxY) / 2,
		width: maxX - minX,
		height: maxY - minY,
		...(dz.enabled !== undefined && { enabled: dz.enabled }),
		...(dz.label !== undefined && { label: dz.label }),
	};
}

/**
 * Transform a DeviceZonePolygon back to room-space.
 */
function inverseTransformPolygonToRoom(
	dz: DeviceZonePolygon,
	sensor: DevicePlacement,
): ZonePolygon {
	return {
		id: dz.id,
		type: dz.type,
		vertices: dz.vertices.map((v) => inverseTransformPoint(v, sensor)),
		...(dz.enabled !== undefined && { enabled: dz.enabled }),
		...(dz.label !== undefined && { label: dz.label }),
	};
}

/**
 * Transform any device-space zone back to room-space.
 */
export function transformZoneToRoomSpace(
	deviceZone: DeviceZone,
	sensor: DevicePlacement,
): Zone {
	if (isDeviceZoneRect(deviceZone)) {
		return inverseTransformRectToRoom(deviceZone, sensor);
	}
	return inverseTransformPolygonToRoom(deviceZone as DeviceZonePolygon, sensor);
}
