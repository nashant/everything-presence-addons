import { describe, it, expect } from "vitest";
import {
	transformPoint,
	inverseTransformPoint,
	transformZoneToDeviceSpace,
	transformZonesToDeviceSpace,
	transformZoneToRoomSpace,
	isDeviceZoneRect,
	type DeviceZoneRect,
	type DeviceZonePolygon,
} from "../../domain/coordinateTransform";
import type {
	ZoneRect,
	ZonePolygon,
	DevicePlacement,
	Point,
} from "../../domain/types";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Assert two points are equal within tolerance (default 0.01 mm). */
function expectPointClose(actual: Point, expected: Point, tol = 0.01) {
	expect(actual.x).toBeCloseTo(expected.x, -Math.log10(tol));
	expect(actual.y).toBeCloseTo(expected.y, -Math.log10(tol));
}

/** Build a simple test ZoneRect. */
function makeRect(overrides: Partial<ZoneRect> = {}): ZoneRect {
	return {
		id: "z1",
		type: "regular",
		x: 1000,
		y: 500,
		width: 200,
		height: 100,
		...overrides,
	};
}

/** Build a simple test ZonePolygon. */
function makePolygon(
	vertices: Point[],
	overrides: Partial<ZonePolygon> = {},
): ZonePolygon {
	return {
		id: "p1",
		type: "regular",
		vertices,
		...overrides,
	};
}

// ─────────────────────────────────────────────────────────────────
// transformPoint
// ─────────────────────────────────────────────────────────────────

describe("transformPoint", () => {
	it("identity: sensor at origin, 0° rotation", () => {
		// With 0° rotation, effectiveAngle = 90° → rotation of −90° applied
		// A point at (100, 0) in room-space should become (0, -100) in device-space
		// because −90° rotation: (x cos(−90) − y sin(−90), x sin(−90) + y cos(−90))
		// = (x·0 − y·(−1), x·(−1) + y·0) = (y, −x)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		expectPointClose(result, { x: 0, y: -100 });
	});

	it("identity: sensor at origin, 0° rotation, point on Y axis", () => {
		// (0, 100) → rotate −90° → (100, 0)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const result = transformPoint({ x: 0, y: 100 }, sensor);
		expectPointClose(result, { x: 100, y: 0 });
	});

	it("90° rotation", () => {
		// effectiveAngle = 180° → rotation of −180°
		// cos(−180°) = −1, sin(−180°) = 0
		// (100, 0) → (−100, 0)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 90 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		expectPointClose(result, { x: -100, y: 0 });
	});

	it("180° rotation", () => {
		// effectiveAngle = 270° → rotation of −270° = +90°
		// cos(−270°) = 0, sin(−270°) = 1
		// (100, 0) → (0, 100)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 180 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		expectPointClose(result, { x: 0, y: 100 });
	});

	it("270° rotation", () => {
		// effectiveAngle = 360° = 0° → rotation of 0°
		// (100, 0) → (100, 0)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		expectPointClose(result, { x: 100, y: 0 });
	});

	it("45° rotation", () => {
		// effectiveAngle = 135° → rotation of −135°
		// cos(−135°) = −√2/2, sin(−135°) = −√2/2
		// (100, 0) → (100·(−√2/2) − 0, 100·(−√2/2) + 0) = (−70.71, −70.71)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 45 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		const s = Math.SQRT2 / 2;
		expectPointClose(result, { x: -100 * s, y: -100 * s });
	});

	it("sensor at offset position", () => {
		// Sensor at (500, 300), 0° rotation
		// Point (600, 300) → translate → (100, 0) → rotate −90° → (0, −100)
		const sensor: DevicePlacement = { x: 500, y: 300, rotationDeg: 0 };
		const result = transformPoint({ x: 600, y: 300 }, sensor);
		expectPointClose(result, { x: 0, y: -100 });
	});

	it("rotationDeg undefined defaults to 0°", () => {
		const sensor: DevicePlacement = { x: 0, y: 0 };
		const result = transformPoint({ x: 100, y: 0 }, sensor);
		expectPointClose(result, { x: 0, y: -100 });
	});
});

// ─────────────────────────────────────────────────────────────────
// inverseTransformPoint
// ─────────────────────────────────────────────────────────────────

describe("inverseTransformPoint", () => {
	it("undoes the forward transform at 0° rotation", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const devicePt = transformPoint({ x: 100, y: 200 }, sensor);
		const roundTrip = inverseTransformPoint(devicePt, sensor);
		expectPointClose(roundTrip, { x: 100, y: 200 });
	});

	it("undoes the forward transform at 90° rotation", () => {
		const sensor: DevicePlacement = { x: 300, y: 400, rotationDeg: 90 };
		const devicePt = transformPoint({ x: 500, y: 600 }, sensor);
		const roundTrip = inverseTransformPoint(devicePt, sensor);
		expectPointClose(roundTrip, { x: 500, y: 600 });
	});

	it("undoes the forward transform at 45° rotation with offset", () => {
		const sensor: DevicePlacement = { x: 1500, y: 2000, rotationDeg: 45 };
		const original: Point = { x: 2000, y: 2500 };
		const devicePt = transformPoint(original, sensor);
		const roundTrip = inverseTransformPoint(devicePt, sensor);
		expectPointClose(roundTrip, original);
	});

	it("undoes the forward transform at 180°", () => {
		const sensor: DevicePlacement = { x: -100, y: 200, rotationDeg: 180 };
		const original: Point = { x: 300, y: -50 };
		const devicePt = transformPoint(original, sensor);
		const roundTrip = inverseTransformPoint(devicePt, sensor);
		expectPointClose(roundTrip, original);
	});

	it("undoes the forward transform at 270°", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const original: Point = { x: 42, y: 99 };
		const devicePt = transformPoint(original, sensor);
		const roundTrip = inverseTransformPoint(devicePt, sensor);
		expectPointClose(roundTrip, original);
	});
});

// ─────────────────────────────────────────────────────────────────
// transformZoneToDeviceSpace — ZoneRect
// ─────────────────────────────────────────────────────────────────

describe("transformZoneToDeviceSpace (ZoneRect)", () => {
	it("identity-like: sensor at origin, 0° rotation converts center to begin/end", () => {
		// Rect centered at (1000, 500), 200×100
		// Corners in room: (900,450) (1100,450) (1100,550) (900,550)
		// With 0° (effective 90°, rotate −90°): (x,y) → (y, −x)
		// (900,450) → (450, −900), (1100,450) → (450, −1100)
		// (1100,550) → (550, −1100), (900,550) → (550, −900)
		// beginX=450, endX=550, beginY=−1100, endY=−900
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const zone = makeRect();
		const result = transformZoneToDeviceSpace(zone, sensor);

		expect(isDeviceZoneRect(result)).toBe(true);
		const dz = result as DeviceZoneRect;
		expect(dz.id).toBe("z1");
		expect(dz.type).toBe("regular");
		expect(dz.beginX).toBeCloseTo(450, 0);
		expect(dz.endX).toBeCloseTo(550, 0);
		expect(dz.beginY).toBeCloseTo(-1100, 0);
		expect(dz.endY).toBeCloseTo(-900, 0);
	});

	it("270° rotation (effective 360° = identity rotation) just translates", () => {
		// Sensor at origin, 270° → effective 360° → rotate 0°
		// (x,y) → (x, y) — no rotation, just coordinates as-is
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const zone = makeRect({ x: 100, y: 50, width: 40, height: 20 });
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;

		// Corners: (80,40) (120,40) (120,60) (80,60)
		expect(result.beginX).toBeCloseTo(80, 0);
		expect(result.endX).toBeCloseTo(120, 0);
		expect(result.beginY).toBeCloseTo(40, 0);
		expect(result.endY).toBeCloseTo(60, 0);
	});

	it("preserves enabled and label", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const zone = makeRect({ enabled: true, label: "Bed" });
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;
		expect(result.enabled).toBe(true);
		expect(result.label).toBe("Bed");
	});

	it("omits enabled/label when undefined in source", () => {
		const sensor: DevicePlacement = { x: 0, y: 0 };
		const zone = makeRect();
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;
		expect("enabled" in result).toBe(false);
		expect("label" in result).toBe(false);
	});

	it("sensor at offset, 180° rotation", () => {
		// Sensor at (1000, 500), 180° → effective 270° → rotate −270° = +90°
		// cos(+90°) = 0, sin(+90°) = 1
		// Rect center at (1000, 500) → translate → (0, 0) → rotate → (0, 0)
		// All corners symmetric → beginX = −halfH, endX = halfH, same for Y with halfW
		const sensor: DevicePlacement = { x: 1000, y: 500, rotationDeg: 180 };
		const zone = makeRect({ x: 1000, y: 500, width: 200, height: 100 });
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;

		// Corners relative: (±100, ±50) → rotate +90°: (x,y) → (−y, x)
		// (−100,−50) → (50, −100), (100,−50) → (50, 100)
		// (100,50) → (−50, 100), (−100,50) → (−50, −100)
		expect(result.beginX).toBeCloseTo(-50, 0);
		expect(result.endX).toBeCloseTo(50, 0);
		expect(result.beginY).toBeCloseTo(-100, 0);
		expect(result.endY).toBeCloseTo(100, 0);
	});
});

// ─────────────────────────────────────────────────────────────────
// transformZoneToDeviceSpace — ZonePolygon
// ─────────────────────────────────────────────────────────────────

describe("transformZoneToDeviceSpace (ZonePolygon)", () => {
	it("transforms all vertices", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const poly = makePolygon([
			{ x: 100, y: 200 },
			{ x: 300, y: 200 },
			{ x: 300, y: 400 },
		]);
		const result = transformZoneToDeviceSpace(poly, sensor);

		expect(isDeviceZoneRect(result)).toBe(false);
		const dp = result as DeviceZonePolygon;
		expect(dp.id).toBe("p1");
		expect(dp.vertices).toHaveLength(3);

		// 270° → effective 360° → identity rotation
		expectPointClose(dp.vertices[0], { x: 100, y: 200 });
		expectPointClose(dp.vertices[1], { x: 300, y: 200 });
		expectPointClose(dp.vertices[2], { x: 300, y: 400 });
	});

	it("90° rotation transforms polygon vertices", () => {
		// 90° → effective 180° → rotate −180°: (x,y) → (−x, −y)
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 90 };
		const poly = makePolygon([
			{ x: 100, y: 200 },
			{ x: 300, y: 400 },
		]);
		const result = transformZoneToDeviceSpace(poly, sensor) as DeviceZonePolygon;

		expectPointClose(result.vertices[0], { x: -100, y: -200 });
		expectPointClose(result.vertices[1], { x: -300, y: -400 });
	});

	it("preserves enabled and label on polygon", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const poly = makePolygon(
			[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
			{ enabled: false, label: "Entry" },
		);
		const result = transformZoneToDeviceSpace(poly, sensor) as DeviceZonePolygon;
		expect(result.enabled).toBe(false);
		expect(result.label).toBe("Entry");
	});
});

// ─────────────────────────────────────────────────────────────────
// transformZonesToDeviceSpace (batch)
// ─────────────────────────────────────────────────────────────────

describe("transformZonesToDeviceSpace", () => {
	it("transforms mixed rect + polygon array", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 270 };
		const zones = [
			makeRect({ id: "r1" }),
			makePolygon([{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }], { id: "p1" }),
		];
		const results = transformZonesToDeviceSpace(zones, sensor);
		expect(results).toHaveLength(2);
		expect(isDeviceZoneRect(results[0])).toBe(true);
		expect(isDeviceZoneRect(results[1])).toBe(false);
	});

	it("handles empty array", () => {
		const results = transformZonesToDeviceSpace([], { x: 0, y: 0 });
		expect(results).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────
// Inverse round-trip: transformZoneToRoomSpace
// ─────────────────────────────────────────────────────────────────

describe("transformZoneToRoomSpace (inverse round-trip)", () => {
	const TOL = 0.01; // mm

	it("round-trips ZoneRect at 0° rotation", () => {
		const sensor: DevicePlacement = { x: 500, y: 300, rotationDeg: 0 };
		const original = makeRect({ x: 700, y: 400, width: 200, height: 100 });
		const device = transformZoneToDeviceSpace(original, sensor) as DeviceZoneRect;
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZoneRect;

		expect(roundTrip.x).toBeCloseTo(original.x, -Math.log10(TOL));
		expect(roundTrip.y).toBeCloseTo(original.y, -Math.log10(TOL));
		expect(roundTrip.width).toBeCloseTo(original.width, -Math.log10(TOL));
		expect(roundTrip.height).toBeCloseTo(original.height, -Math.log10(TOL));
	});

	it("round-trips ZoneRect at 90° rotation", () => {
		const sensor: DevicePlacement = { x: 1000, y: 1000, rotationDeg: 90 };
		const original = makeRect({ x: 1200, y: 1300, width: 300, height: 150 });
		const device = transformZoneToDeviceSpace(original, sensor) as DeviceZoneRect;
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZoneRect;

		expect(roundTrip.x).toBeCloseTo(original.x, -Math.log10(TOL));
		expect(roundTrip.y).toBeCloseTo(original.y, -Math.log10(TOL));
		expect(roundTrip.width).toBeCloseTo(original.width, -Math.log10(TOL));
		expect(roundTrip.height).toBeCloseTo(original.height, -Math.log10(TOL));
	});

	it("round-trips ZoneRect at 180° rotation", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 180 };
		const original = makeRect({ x: 500, y: 250, width: 100, height: 80 });
		const device = transformZoneToDeviceSpace(original, sensor) as DeviceZoneRect;
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZoneRect;

		expect(roundTrip.x).toBeCloseTo(original.x, -Math.log10(TOL));
		expect(roundTrip.y).toBeCloseTo(original.y, -Math.log10(TOL));
		expect(roundTrip.width).toBeCloseTo(original.width, -Math.log10(TOL));
		expect(roundTrip.height).toBeCloseTo(original.height, -Math.log10(TOL));
	});

	it("round-trips ZoneRect at 270° rotation", () => {
		const sensor: DevicePlacement = { x: 200, y: 800, rotationDeg: 270 };
		const original = makeRect({ x: 400, y: 900, width: 60, height: 40 });
		const device = transformZoneToDeviceSpace(original, sensor) as DeviceZoneRect;
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZoneRect;

		expect(roundTrip.x).toBeCloseTo(original.x, -Math.log10(TOL));
		expect(roundTrip.y).toBeCloseTo(original.y, -Math.log10(TOL));
		expect(roundTrip.width).toBeCloseTo(original.width, -Math.log10(TOL));
		expect(roundTrip.height).toBeCloseTo(original.height, -Math.log10(TOL));
	});

	it("round-trips ZonePolygon at arbitrary angle", () => {
		const sensor: DevicePlacement = { x: 1000, y: 2000, rotationDeg: 137 };
		const original = makePolygon([
			{ x: 1200, y: 2100 },
			{ x: 1400, y: 2200 },
			{ x: 1300, y: 2400 },
			{ x: 1100, y: 2300 },
		]);
		const device = transformZoneToDeviceSpace(original, sensor) as DeviceZonePolygon;
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZonePolygon;

		expect(roundTrip.vertices).toHaveLength(4);
		for (let i = 0; i < original.vertices.length; i++) {
			expectPointClose(roundTrip.vertices[i], original.vertices[i], TOL);
		}
	});

	it("preserves metadata through round-trip", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 90 };
		const original = makeRect({ enabled: true, label: "Test Zone" });
		const device = transformZoneToDeviceSpace(original, sensor);
		const roundTrip = transformZoneToRoomSpace(device, sensor) as ZoneRect;

		expect(roundTrip.id).toBe(original.id);
		expect(roundTrip.type).toBe(original.type);
		expect(roundTrip.enabled).toBe(original.enabled);
		expect(roundTrip.label).toBe(original.label);
	});
});

// ─────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────

describe("edge cases", () => {
	it("negative rotationDeg works correctly", () => {
		// −90° → effective 0° → rotate 0° → identity
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: -90 };
		const result = transformPoint({ x: 100, y: 200 }, sensor);
		expectPointClose(result, { x: 100, y: 200 });
	});

	it("rotationDeg > 360° wraps correctly", () => {
		// 360° → same as 0°, effective 450° = effective 90°
		const sensor0: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const sensor360: DevicePlacement = { x: 0, y: 0, rotationDeg: 360 };

		const pt = { x: 100, y: 200 };
		const r0 = transformPoint(pt, sensor0);
		const r360 = transformPoint(pt, sensor360);

		expectPointClose(r0, r360);
	});

	it("zone at sensor position transforms to origin", () => {
		const sensor: DevicePlacement = { x: 500, y: 500, rotationDeg: 0 };
		const zone = makeRect({ x: 500, y: 500, width: 100, height: 100 });
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;

		// Center should map to origin — begin/end should be symmetric
		const centerX = (result.beginX + result.endX) / 2;
		const centerY = (result.beginY + result.endY) / 2;
		expect(centerX).toBeCloseTo(0, 0);
		expect(centerY).toBeCloseTo(0, 0);
	});

	it("very large coordinates preserve precision", () => {
		const sensor: DevicePlacement = { x: 100000, y: 100000, rotationDeg: 45 };
		const original: Point = { x: 105000, y: 103000 };
		const device = transformPoint(original, sensor);
		const roundTrip = inverseTransformPoint(device, sensor);
		expectPointClose(roundTrip, original, 0.01);
	});

	it("zero-dimension rect still transforms", () => {
		const sensor: DevicePlacement = { x: 0, y: 0, rotationDeg: 0 };
		const zone = makeRect({ width: 0, height: 0 });
		const result = transformZoneToDeviceSpace(zone, sensor) as DeviceZoneRect;
		// Zero-width rect → beginX == endX, beginY == endY
		expect(result.beginX).toBe(result.endX);
		expect(result.beginY).toBe(result.endY);
	});
});
