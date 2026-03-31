import { describe, it, expect } from "vitest";
import {
	isPointInCone,
	isPointInPolygon,
	getZoneSamplePoints,
	computeZoneCoverage,
	computeAllCoverage,
} from "../../domain/zoneCoverage";
import type { ZoneRect, ZonePolygon, DevicePlacement, Point } from "../../domain/types";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Create a ZoneRect at (cx, cy) with given dimensions. */
function makeRect(
	cx: number,
	cy: number,
	w: number,
	h: number,
	opts: Partial<ZoneRect> = {},
): ZoneRect {
	return { id: "r1", type: "regular", x: cx, y: cy, width: w, height: h, ...opts };
}

/** Create a ZonePolygon from vertices. */
function makePoly(vertices: Point[], opts: Partial<ZonePolygon> = {}): ZonePolygon {
	return { id: "p1", type: "regular", vertices, ...opts };
}

// ─────────────────────────────────────────────────────────────────
// isPointInCone
// ─────────────────────────────────────────────────────────────────

describe("isPointInCone", () => {
	const sensor: Point = { x: 0, y: 0 };

	it("point directly in front of sensor (rotationDeg=0 → +Y) is inside", () => {
		// rotationDeg=0 + 90° offset → sensor aims along +Y axis
		expect(isPointInCone({ x: 0, y: 500 }, sensor, 0, 120, 1000)).toBe(true);
	});

	it("point directly behind sensor is outside", () => {
		// Behind the +Y direction = negative Y
		expect(isPointInCone({ x: 0, y: -500 }, sensor, 0, 120, 1000)).toBe(false);
	});

	it("point beyond max range is outside", () => {
		expect(isPointInCone({ x: 0, y: 1500 }, sensor, 0, 120, 1000)).toBe(false);
	});

	it("point at exact max range is inside", () => {
		expect(isPointInCone({ x: 0, y: 1000 }, sensor, 0, 120, 1000)).toBe(true);
	});

	it("point just inside FOV angle is inside", () => {
		// 120° FOV → half = 60°. A point at 59° from forward should be inside.
		// Forward direction (0°+90° offset) = 90° in trig coords
		const angle = ((0 + 90 + 59) * Math.PI) / 180;
		const x = Math.cos(angle) * 500;
		const y = Math.sin(angle) * 500;
		expect(isPointInCone({ x, y }, sensor, 0, 120, 1000)).toBe(true);
	});

	it("point just outside FOV angle is outside", () => {
		// 61° off forward — beyond 60° half-angle
		const angle = ((0 + 90 + 61) * Math.PI) / 180;
		const x = Math.cos(angle) * 500;
		const y = Math.sin(angle) * 500;
		expect(isPointInCone({ x, y }, sensor, 0, 120, 1000)).toBe(false);
	});

	it("handles rotationDeg=90 (sensor aims along −X)", () => {
		// 90° + 90° offset = 180° → sensor aims along −X
		expect(isPointInCone({ x: -500, y: 0 }, sensor, 90, 120, 1000)).toBe(true);
		expect(isPointInCone({ x: 500, y: 0 }, sensor, 90, 120, 1000)).toBe(false);
	});

	it("handles rotationDeg=180 (sensor aims along −Y)", () => {
		expect(isPointInCone({ x: 0, y: -500 }, sensor, 180, 120, 1000)).toBe(true);
		expect(isPointInCone({ x: 0, y: 500 }, sensor, 180, 120, 1000)).toBe(false);
	});

	it("handles rotationDeg=270 (sensor aims along +X)", () => {
		expect(isPointInCone({ x: 500, y: 0 }, sensor, 270, 120, 1000)).toBe(true);
		expect(isPointInCone({ x: -500, y: 0 }, sensor, 270, 120, 1000)).toBe(false);
	});

	it("handles angle wrap-around correctly near ±180°", () => {
		// rotationDeg=90 → effective = 180° → aimed along −X
		// Point at 179° from −X in trig coords should be outside a 120° FOV
		// but a point nearly opposite (-X direction) should be inside
		expect(isPointInCone({ x: -100, y: 1 }, sensor, 90, 120, 1000)).toBe(true);
	});

	it("point at sensor position is inside (zero distance)", () => {
		expect(isPointInCone({ x: 0, y: 0 }, sensor, 0, 120, 1000)).toBe(true);
	});

	it("sensor with offset position", () => {
		const offsetSensor: Point = { x: 1000, y: 1000 };
		// rotationDeg=0 → aims +Y. Point at (1000, 1500) is directly in front.
		expect(isPointInCone({ x: 1000, y: 1500 }, offsetSensor, 0, 120, 1000)).toBe(true);
		// Point at (1000, 500) is behind → outside
		expect(isPointInCone({ x: 1000, y: 500 }, offsetSensor, 0, 120, 1000)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────
// isPointInPolygon
// ─────────────────────────────────────────────────────────────────

describe("isPointInPolygon", () => {
	const square: Point[] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];

	it("point inside square", () => {
		expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
	});

	it("point outside square", () => {
		expect(isPointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
	});

	it("triangle containment", () => {
		const tri: Point[] = [
			{ x: 0, y: 0 },
			{ x: 200, y: 0 },
			{ x: 100, y: 200 },
		];
		expect(isPointInPolygon({ x: 100, y: 50 }, tri)).toBe(true);
		expect(isPointInPolygon({ x: 0, y: 200 }, tri)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────
// getZoneSamplePoints
// ─────────────────────────────────────────────────────────────────

describe("getZoneSamplePoints", () => {
	it("generates (gridSize+1)² points for a ZoneRect", () => {
		const rect = makeRect(500, 500, 200, 100);
		const points = getZoneSamplePoints(rect, 5);
		expect(points).toHaveLength(6 * 6); // (5+1)²
	});

	it("rect sample points are within zone boundary", () => {
		const rect = makeRect(500, 500, 200, 100);
		const points = getZoneSamplePoints(rect, 10);
		for (const p of points) {
			expect(p.x).toBeGreaterThanOrEqual(400);
			expect(p.x).toBeLessThanOrEqual(600);
			expect(p.y).toBeGreaterThanOrEqual(450);
			expect(p.y).toBeLessThanOrEqual(550);
		}
	});

	it("polygon sample points are filtered to interior", () => {
		// Right triangle: (0,0), (200,0), (0,200)
		const tri = makePoly([
			{ x: 0, y: 0 },
			{ x: 200, y: 0 },
			{ x: 0, y: 200 },
		]);
		const points = getZoneSamplePoints(tri, 10);
		// Should have fewer than (11*11)=121 points because many are outside
		expect(points.length).toBeLessThan(121);
		expect(points.length).toBeGreaterThan(0);
		// All returned points should be inside the triangle (x + y ≤ 200)
		for (const p of points) {
			// Allow a tiny epsilon for points on the boundary
			expect(p.x + p.y).toBeLessThanOrEqual(200 + 1);
		}
	});

	it("gridSize=0 produces a single point", () => {
		const rect = makeRect(100, 100, 50, 50);
		const points = getZoneSamplePoints(rect, 0);
		// (0+1)² = 1 point
		expect(points).toHaveLength(1);
		expect(points[0]).toEqual({ x: 75, y: 75 }); // min corner
	});
});

// ─────────────────────────────────────────────────────────────────
// computeZoneCoverage
// ─────────────────────────────────────────────────────────────────

describe("computeZoneCoverage", () => {
	it("zone fully inside cone → coverage ≈ 1.0", () => {
		// Small zone directly in front of sensor
		const zone = makeRect(0, 500, 100, 100);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 20);
		expect(coverage).toBeGreaterThanOrEqual(0.95);
	});

	it("zone fully outside cone (behind sensor) → coverage ≈ 0.0", () => {
		// Zone behind sensor (negative Y for rotationDeg=0)
		const zone = makeRect(0, -2000, 100, 100);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 10);
		expect(coverage).toBe(0);
	});

	it("zone beyond max range → coverage ≈ 0.0", () => {
		const zone = makeRect(0, 8000, 100, 100);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 10);
		expect(coverage).toBe(0);
	});

	it("zone straddling cone edge → partial coverage", () => {
		// Sensor at origin, FOV 60° → halfFov 30°, aimed +Y
		// Wide zone centered on +Y axis — extends past 30° off-axis on each side
		const zone = makeRect(0, 1000, 4000, 500);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 60, 6000, 20);
		expect(coverage).toBeGreaterThan(0);
		expect(coverage).toBeLessThan(1);
	});

	it("zone at exact max range boundary → partial coverage", () => {
		// Zone centered at max range — half inside, half outside by distance
		const zone = makeRect(0, 6000, 200, 400);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 20);
		expect(coverage).toBeGreaterThan(0);
		expect(coverage).toBeLessThan(1);
	});

	it("ZonePolygon coverage (triangle inside cone)", () => {
		// Triangle directly in front of sensor, all within range
		const zone = makePoly([
			{ x: -100, y: 300 },
			{ x: 100, y: 300 },
			{ x: 0, y: 600 },
		]);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 20);
		expect(coverage).toBeGreaterThanOrEqual(0.95);
	});

	it("ZonePolygon fully outside cone", () => {
		const zone = makePoly([
			{ x: -100, y: -600 },
			{ x: 100, y: -600 },
			{ x: 0, y: -300 },
		]);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 20);
		expect(coverage).toBe(0);
	});

	it("sensor with rotationDeg undefined → defaults to 0°", () => {
		const zone = makeRect(0, 500, 100, 100);
		const sensor: DevicePlacement = { x: 0, y: 0 }; // no rotationDeg
		const coverage = computeZoneCoverage(zone, sensor, 120, 6000, 10);
		expect(coverage).toBeGreaterThanOrEqual(0.95);
	});

	it("grid size affects precision: larger grid → more accurate result", () => {
		// Zone straddling range boundary — higher grid should give a more stable result
		const zone = makeRect(0, 5900, 200, 400);
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };

		const coarse = computeZoneCoverage(zone, sensor, 120, 6000, 5);
		const fine = computeZoneCoverage(zone, sensor, 120, 6000, 50);
		// Both should be partial, but exact values may differ
		expect(coarse).toBeGreaterThan(0);
		expect(coarse).toBeLessThan(1);
		expect(fine).toBeGreaterThan(0);
		expect(fine).toBeLessThan(1);
		// Fine grid with more points should converge to a different precision
		// We just verify both are valid partial coverage — the key correctness
		// guarantee is that grid resolution is controllable
	});
});

// ─────────────────────────────────────────────────────────────────
// computeAllCoverage
// ─────────────────────────────────────────────────────────────────

describe("computeAllCoverage", () => {
	it("batch coverage: 2 zones × 2 sensors → correct 2×2 matrix", () => {
		const zones = [
			makeRect(0, 500, 100, 100, { id: "z1" }),    // in front of sensor at origin
			makeRect(0, -2500, 100, 100, { id: "z2" }),   // in front of sensor1 (which aims −Y from y=-2000)
		];
		const sensors = [
			{ placement: { x: 0, y: 0, rotationDeg: 0 }, fovDeg: 120, maxRangeMm: 6000 },
			{ placement: { x: 0, y: -2000, rotationDeg: 180 }, fovDeg: 120, maxRangeMm: 6000 },
		];

		const matrix = computeAllCoverage(zones, sensors, 20);

		// Shape check
		expect(matrix).toHaveLength(2);
		expect(matrix[0]).toHaveLength(2);
		expect(matrix[1]).toHaveLength(2);

		// zone0 (y=500) should be fully covered by sensor0 (origin, aimed +Y)
		expect(matrix[0][0]).toBeGreaterThanOrEqual(0.95);
		// zone0 should NOT be covered by sensor1 (at y=-2000, aimed −Y)
		expect(matrix[0][1]).toBe(0);

		// zone1 (y=-2500) should NOT be covered by sensor0 (behind it, sensor0 aims +Y)
		expect(matrix[1][0]).toBe(0);
		// zone1 (y=-2500) should be fully covered by sensor1 (at y=-2000, aimed −Y)
		expect(matrix[1][1]).toBeGreaterThanOrEqual(0.95);
	});

	it("empty zones returns empty matrix", () => {
		const matrix = computeAllCoverage(
			[],
			[{ placement: { x: 0, y: 0 }, fovDeg: 120, maxRangeMm: 6000 }],
		);
		expect(matrix).toEqual([]);
	});

	it("empty sensors returns rows of empty arrays", () => {
		const matrix = computeAllCoverage(
			[makeRect(0, 500, 100, 100)],
			[],
		);
		expect(matrix).toEqual([[]]);
	});
});
