/**
 * Device-space ↔ room-space coordinate transforms for the frontend.
 *
 * Mirrors backend/src/domain/coordinateTransform.ts but operates on
 * the frontend Zone types. Used to project hardware zones onto the
 * room canvas using the current sensor placement (which changes live
 * as the user drags the rotation slider).
 */

import type { Zone, ZoneRect, ZonePolygon } from '../api/types';
import { isZoneRect, isZonePolygon } from '../api/types';

interface Point { x: number; y: number }
interface Placement { x: number; y: number; rotationDeg?: number }

/**
 * Effective rotation angle in radians.
 * 0° rotationDeg = sensor forward is +Y → offset by 90°.
 */
function effectiveAngleRad(rotationDeg: number): number {
  return ((rotationDeg + 90) * Math.PI) / 180;
}

/**
 * Transform a point from device-space back to room-space.
 * Rotate by +effectiveAngle then translate by sensor position.
 */
function inverseTransformPoint(point: Point, sensor: Placement): Point {
  const angle = effectiveAngleRad(sensor.rotationDeg ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = point.x * cos - point.y * sin;
  const ry = point.x * sin + point.y * cos;
  return { x: rx + sensor.x, y: ry + sensor.y };
}

/**
 * Transform a raw device-space zone to room-space using the given placement.
 *
 * Accepts Zone objects whose coordinates are in device-space (as returned
 * by the server's rawDeviceZones). Returns a Zone with room-space coords.
 */
export function transformDeviceZoneToRoom(zone: Zone, sensor: Placement): Zone {
  if (isZonePolygon(zone)) {
    const poly = zone as ZonePolygon;
    return {
      ...poly,
      vertices: poly.vertices.map(v => inverseTransformPoint(v, sensor)),
    };
  }

  if (isZoneRect(zone)) {
    const rect = zone as ZoneRect;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    // Transform the 4 corners from device-space, then take bounding box
    const corners: Point[] = [
      { x: rect.x - halfW, y: rect.y - halfH },
      { x: rect.x + halfW, y: rect.y - halfH },
      { x: rect.x + halfW, y: rect.y + halfH },
      { x: rect.x - halfW, y: rect.y + halfH },
    ];
    const roomCorners = corners.map(c => inverseTransformPoint(c, sensor));
    const xs = roomCorners.map(p => p.x);
    const ys = roomCorners.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      ...rect,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // Fallback: return as-is
  return zone;
}
