/**
 * Zone coverage analysis: per-sensor FOV cone overlap.
 *
 * Pure functions — no side effects, no HA/backend dependencies.
 *
 * Uses grid-point sampling to compute what fraction of each zone falls
 * within a sensor's FOV cone. More precise than the frontend's vertex-only
 * check (RoomBuilderPage.tsx:511-542) and generalises to N sensors.
 *
 * Convention (matching frontend buildRadarPath / coordinateTransform.ts):
 * - rotationDeg 0° → sensor forward is +Y in room-space
 * - Effective angle = (rotationDeg + 90) × π / 180
 * - Point-in-cone = distance ≤ maxRange AND |angleDiff| ≤ halfFov
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
// Geometry primitives
// ─────────────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Mirrors the frontend implementation in geometry.ts.
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
	if (polygon.length < 3) return true;

	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		const intersect =
			yi > point.y !== yj > point.y &&
			point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

/**
 * Test whether a point lies within a sensor's FOV cone.
 *
 * @param point      - The point to test (room-space, mm)
 * @param sensorPos  - Sensor position (room-space, mm)
 * @param rotationDeg - Sensor rotation in degrees (0° = forward along +Y)
 * @param fovDeg     - Full field-of-view angle in degrees
 * @param maxRangeMm - Maximum detection range in mm
 */
export function isPointInCone(
	point: Point,
	sensorPos: Point,
	rotationDeg: number,
	fovDeg: number,
	maxRangeMm: number,
): boolean {
	const dx = point.x - sensorPos.x;
	const dy = point.y - sensorPos.y;
	const dist = Math.sqrt(dx * dx + dy * dy);

	// Distance check
	if (dist > maxRangeMm) return false;

	// Point at sensor position is inside the cone (atan2(0,0) is degenerate)
	if (dist < 1e-6) return true;

	// Angle check with +90° offset
	const effectiveAngle = ((rotationDeg + 90) * Math.PI) / 180;
	const halfFov = (fovDeg * Math.PI) / 360; // fovDeg/2 in radians

	let angleDiff = Math.atan2(dy, dx) - effectiveAngle;
	// Normalise to [-π, π]
	while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
	while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

	return Math.abs(angleDiff) <= halfFov;
}

// ─────────────────────────────────────────────────────────────────
// Grid-point sampling
// ─────────────────────────────────────────────────────────────────

/**
 * Generate grid sample points within a zone boundary.
 *
 * For ZoneRect (center-based): uniform grid within x ± width/2, y ± height/2.
 * For ZonePolygon: uniform grid within bounding box, filtered to points
 * inside the polygon using ray-casting.
 *
 * @param zone     - The zone to sample
 * @param gridSize - Divisions per axis (default 10) → (gridSize+1)² candidate points
 */
export function getZoneSamplePoints(
	zone: Zone,
	gridSize: number = 10,
): Point[] {
	const points: Point[] = [];

	if (isZoneRect(zone)) {
		const halfW = zone.width / 2;
		const halfH = zone.height / 2;
		const minX = zone.x - halfW;
		const maxX = zone.x + halfW;
		const minY = zone.y - halfH;
		const maxY = zone.y + halfH;

		const stepX = gridSize > 0 ? (maxX - minX) / gridSize : 0;
		const stepY = gridSize > 0 ? (maxY - minY) / gridSize : 0;

		for (let i = 0; i <= gridSize; i++) {
			for (let j = 0; j <= gridSize; j++) {
				points.push({
					x: minX + i * stepX,
					y: minY + j * stepY,
				});
			}
		}
	} else {
		const poly = zone as ZonePolygon;
		const xs = poly.vertices.map((v) => v.x);
		const ys = poly.vertices.map((v) => v.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);

		const stepX = gridSize > 0 ? (maxX - minX) / gridSize : 0;
		const stepY = gridSize > 0 ? (maxY - minY) / gridSize : 0;

		for (let i = 0; i <= gridSize; i++) {
			for (let j = 0; j <= gridSize; j++) {
				const p: Point = {
					x: minX + i * stepX,
					y: minY + j * stepY,
				};
				if (isPointInPolygon(p, poly.vertices)) {
					points.push(p);
				}
			}
		}
	}

	return points;
}

// ─────────────────────────────────────────────────────────────────
// Coverage computation
// ─────────────────────────────────────────────────────────────────

/**
 * Compute the fraction of a zone covered by a single sensor's FOV cone.
 *
 * Scatters grid sample points across the zone, tests each against the cone,
 * returns the fraction that fall inside (0.0 to 1.0).
 *
 * @param zone            - The zone to analyse
 * @param sensorPlacement - Sensor position and rotation in room-space
 * @param fovDeg          - Sensor field-of-view in degrees
 * @param maxRangeMm      - Sensor max detection range in mm
 * @param gridSize        - Grid divisions per axis (default 10)
 * @returns Coverage fraction 0.0 to 1.0
 */
export function computeZoneCoverage(
	zone: Zone,
	sensorPlacement: DevicePlacement,
	fovDeg: number,
	maxRangeMm: number,
	gridSize: number = 10,
): number {
	const samplePoints = getZoneSamplePoints(zone, gridSize);
	if (samplePoints.length === 0) return 0;

	const sensorPos: Point = { x: sensorPlacement.x, y: sensorPlacement.y };
	const rotationDeg = sensorPlacement.rotationDeg ?? 0;

	let insideCount = 0;
	for (const point of samplePoints) {
		if (isPointInCone(point, sensorPos, rotationDeg, fovDeg, maxRangeMm)) {
			insideCount++;
		}
	}

	return insideCount / samplePoints.length;
}

/**
 * Compute coverage matrix for all zones × all sensors.
 *
 * @param zones    - Room zones
 * @param sensors  - Array of sensor specs (placement + FOV + range)
 * @param gridSize - Grid divisions per axis (default 10)
 * @returns 2D array [zoneIndex][sensorIndex] of coverage fractions (0.0–1.0)
 */
export function computeAllCoverage(
	zones: Zone[],
	sensors: Array<{
		placement: DevicePlacement;
		fovDeg: number;
		maxRangeMm: number;
	}>,
	gridSize: number = 10,
): number[][] {
	return zones.map((zone) =>
		sensors.map((sensor) =>
			computeZoneCoverage(
				zone,
				sensor.placement,
				sensor.fovDeg,
				sensor.maxRangeMm,
				gridSize,
			),
		),
	);
}
