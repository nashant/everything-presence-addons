/**
 * Per-sensor zone coverage utilities.
 *
 * Pure functions — no React imports, no side effects. The cone math mirrors
 * the +90° rotation offset convention established in RoomCanvas.isPointInSensorRange.
 *
 * Coordinates are in mm (room world coordinates). Sensor maxRangeMeters is
 * converted to mm internally.
 */

import type { Zone, ZoneRect, ZonePolygon, Point } from '../api/types';
import { isZonePolygon } from '../api/types';

// ---------------------------------------------------------------------------
// Sensor input type — compatible with SensorRenderInfo but decoupled
// ---------------------------------------------------------------------------

export interface CoverageSensorInfo {
  id: string;
  placement?: { x: number; y: number; rotationDeg?: number } | null;
  fovDeg: number;
  maxRangeMeters: number;
}

// ---------------------------------------------------------------------------
// Core: point-in-cone check for a single sensor
// ---------------------------------------------------------------------------

/**
 * Check whether a point falls inside a single sensor's detection cone.
 *
 * Uses the +90° rotation offset convention: rotationDeg=0 means the sensor
 * faces "up" in SVG coords (negative Y), so we add 90° before computing
 * the reference angle.
 *
 * @param pt           World point to test (mm)
 * @param placement    Sensor position + rotation
 * @param fovDeg       Field of view in degrees (full angle, not half)
 * @param maxRangeMeters  Maximum detection range in metres
 */
export function isPointInSensorCone(
  pt: Point,
  placement: { x: number; y: number; rotationDeg?: number },
  fovDeg: number,
  maxRangeMeters: number,
): boolean {
  const dx = pt.x - placement.x;
  const dy = pt.y - placement.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Range check (metres → mm)
  const rangeLimitMm = maxRangeMeters * 1000;
  if (dist > rangeLimitMm) return false;

  // Angle check with +90° offset
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const halfFov = (fovDeg * Math.PI) / 360;
  const ptAngle = Math.atan2(dy, dx);

  // Normalise angle difference to [-π, π]
  let diff = ptAngle - rotationRad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  return Math.abs(diff) <= halfFov;
}

// ---------------------------------------------------------------------------
// Zone vertex extraction
// ---------------------------------------------------------------------------

/** Get the vertices to test for a zone. Rect → 4 corner vertices from center. */
function getZoneVertices(zone: Zone): Point[] {
  if (isZonePolygon(zone)) {
    return (zone as ZonePolygon).vertices;
  }
  const r = zone as ZoneRect;
  const hw = r.width / 2;
  const hh = r.height / 2;
  return [
    { x: r.x - hw, y: r.y - hh },
    { x: r.x + hw, y: r.y - hh },
    { x: r.x + hw, y: r.y + hh },
    { x: r.x - hw, y: r.y + hh },
  ];
}

// ---------------------------------------------------------------------------
// Per-sensor coverage
// ---------------------------------------------------------------------------

export type CoverageLevel = 'full' | 'partial' | 'none';

/**
 * Compute per-sensor coverage for a zone.
 *
 * Returns a Map keyed by sensor ID → 'full' | 'partial' | 'none'.
 * Sensors without a placement are skipped (not included in the map).
 *
 * "Full" means all vertices are inside the cone. "Partial" means at least one
 * vertex is inside but not all. "None" means zero vertices inside.
 */
export function getPerSensorCoverage(
  zone: Zone,
  sensors: CoverageSensorInfo[],
): Map<string, CoverageLevel> {
  const verts = getZoneVertices(zone);
  const result = new Map<string, CoverageLevel>();

  for (const sensor of sensors) {
    if (!sensor.placement) continue;

    const inCount = verts.filter((v) =>
      isPointInSensorCone(v, sensor.placement!, sensor.fovDeg, sensor.maxRangeMeters),
    ).length;

    if (verts.length === 0) {
      // Degenerate zone (zero-area) — no vertices to test
      result.set(sensor.id, 'none');
    } else if (inCount === verts.length) {
      result.set(sensor.id, 'full');
    } else if (inCount > 0) {
      result.set(sensor.id, 'partial');
    } else {
      result.set(sensor.id, 'none');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Aggregate coverage from per-sensor results
// ---------------------------------------------------------------------------

/**
 * Derive aggregate coverage from per-sensor results.
 *
 * - If any sensor has 'full' → aggregate is 'full'
 * - Else if any sensor has 'partial' → aggregate is 'partial'
 * - Else → 'none'
 *
 * An empty map (no sensors evaluated) returns 'none'.
 */
export function getAggregateCoverage(
  perSensor: Map<string, CoverageLevel>,
): CoverageLevel {
  let hasFull = false;
  let hasPartial = false;

  for (const level of perSensor.values()) {
    if (level === 'full') hasFull = true;
    if (level === 'partial') hasPartial = true;
  }

  if (hasFull) return 'full';
  if (hasPartial) return 'partial';
  return 'none';
}
