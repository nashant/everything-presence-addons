"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const coordinateTransform_1 = require("../../domain/coordinateTransform");
// ── Helpers ──────────────────────────────────────────────────────
/** Assert two Points are close (handles floating-point imprecision). */
function expectPointClose(actual, expected, precision = 5) {
    (0, vitest_1.expect)(actual.x).toBeCloseTo(expected.x, precision);
    (0, vitest_1.expect)(actual.y).toBeCloseTo(expected.y, precision);
}
const SQRT2_OVER_2 = Math.SQRT2 / 2; // ≈ 0.70711
// ── deviceToRoom ─────────────────────────────────────────────────
(0, vitest_1.describe)('deviceToRoom', () => {
    (0, vitest_1.it)('identity: 0° rotation at origin passes through unchanged', () => {
        const p = { x: 0, y: 0, rotationDeg: 0 };
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 2, p), { x: 1, y: 2 });
    });
    (0, vitest_1.it)('90° rotation at origin', () => {
        const p = { x: 0, y: 0, rotationDeg: 90 };
        // (1, 0) → (0, 1)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 0, p), { x: 0, y: 1 });
        // (1, 2) → (-2, 1)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 2, p), { x: -2, y: 1 });
    });
    (0, vitest_1.it)('180° rotation at origin', () => {
        const p = { x: 0, y: 0, rotationDeg: 180 };
        // (1, 2) → (-1, -2)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 2, p), { x: -1, y: -2 });
    });
    (0, vitest_1.it)('270° rotation at origin', () => {
        const p = { x: 0, y: 0, rotationDeg: 270 };
        // (1, 2) → (2, -1)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 2, p), { x: 2, y: -1 });
    });
    (0, vitest_1.it)('non-zero placement offset with 0° rotation', () => {
        const p = { x: 100, y: 200, rotationDeg: 0 };
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 2, p), { x: 101, y: 202 });
    });
    (0, vitest_1.it)('non-zero placement offset with 90° rotation', () => {
        const p = { x: 10, y: 20, rotationDeg: 90 };
        // (1, 0) rotated 90° → (0, 1), then +offset → (10, 21)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 0, p), { x: 10, y: 21 });
    });
    (0, vitest_1.it)('installationAngle only (rotationDeg=0)', () => {
        const p = { x: 0, y: 0, installationAngle: 90 };
        // effective = 0 + 90 = 90°, same as 90° rotation
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 0, p), { x: 0, y: 1 });
    });
    (0, vitest_1.it)('combined rotationDeg + installationAngle', () => {
        const p = { x: 0, y: 0, rotationDeg: 45, installationAngle: 45 };
        // effective = 45 + 45 = 90°
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 0, p), { x: 0, y: 1 });
    });
    (0, vitest_1.it)('explicit installationAngle parameter overrides placement.installationAngle', () => {
        const p = { x: 0, y: 0, rotationDeg: 0, installationAngle: 90 };
        // explicit installationAngle=45 overrides placement's 90
        // effective = 0 + 45 = 45°
        const result = (0, coordinateTransform_1.deviceToRoom)(1, 0, p, 45);
        expectPointClose(result, { x: SQRT2_OVER_2, y: SQRT2_OVER_2 });
    });
    (0, vitest_1.it)('45° rotation produces expected diagonal coordinates', () => {
        const p = { x: 0, y: 0, rotationDeg: 45 };
        // (1, 0) at 45° → (cos45, sin45) ≈ (0.7071, 0.7071)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(1, 0, p), { x: SQRT2_OVER_2, y: SQRT2_OVER_2 });
        // (0, 1) at 45° → (-sin45, cos45) ≈ (-0.7071, 0.7071)
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(0, 1, p), { x: -SQRT2_OVER_2, y: SQRT2_OVER_2 });
    });
    (0, vitest_1.it)('defaults missing rotationDeg to 0', () => {
        const p = { x: 5, y: 10 };
        // No rotationDeg or installationAngle → effective 0°
        expectPointClose((0, coordinateTransform_1.deviceToRoom)(3, 4, p), { x: 8, y: 14 });
    });
});
// ── roomToDevice ─────────────────────────────────────────────────
(0, vitest_1.describe)('roomToDevice', () => {
    (0, vitest_1.it)('identity: 0° rotation at origin passes through unchanged', () => {
        const p = { x: 0, y: 0, rotationDeg: 0 };
        expectPointClose((0, coordinateTransform_1.roomToDevice)(1, 2, p), { x: 1, y: 2 });
    });
    (0, vitest_1.it)('90° rotation at origin (mirror of deviceToRoom)', () => {
        const p = { x: 0, y: 0, rotationDeg: 90 };
        // deviceToRoom(1, 0) → (0, 1), so roomToDevice(0, 1) → (1, 0)
        expectPointClose((0, coordinateTransform_1.roomToDevice)(0, 1, p), { x: 1, y: 0 });
        // deviceToRoom(1, 2) → (-2, 1), so roomToDevice(-2, 1) → (1, 2)
        expectPointClose((0, coordinateTransform_1.roomToDevice)(-2, 1, p), { x: 1, y: 2 });
    });
    (0, vitest_1.it)('180° rotation at origin (mirror of deviceToRoom)', () => {
        const p = { x: 0, y: 0, rotationDeg: 180 };
        // deviceToRoom(1, 2) → (-1, -2)
        expectPointClose((0, coordinateTransform_1.roomToDevice)(-1, -2, p), { x: 1, y: 2 });
    });
    (0, vitest_1.it)('270° rotation at origin (mirror of deviceToRoom)', () => {
        const p = { x: 0, y: 0, rotationDeg: 270 };
        // deviceToRoom(1, 2) → (2, -1)
        expectPointClose((0, coordinateTransform_1.roomToDevice)(2, -1, p), { x: 1, y: 2 });
    });
    (0, vitest_1.it)('non-zero offset with 0° rotation', () => {
        const p = { x: 100, y: 200, rotationDeg: 0 };
        expectPointClose((0, coordinateTransform_1.roomToDevice)(101, 202, p), { x: 1, y: 2 });
    });
    (0, vitest_1.describe)('round-trip property: roomToDevice(deviceToRoom(dx,dy)) ≈ (dx,dy)', () => {
        const testPoints = [
            [0, 0],
            [1, 0],
            [0, 1],
            [3.7, -2.1],
            [-5, 8],
        ];
        (0, vitest_1.it)('at 0°', () => {
            const p = { x: 50, y: 75, rotationDeg: 0 };
            for (const [dx, dy] of testPoints) {
                const room = (0, coordinateTransform_1.deviceToRoom)(dx, dy, p);
                expectPointClose((0, coordinateTransform_1.roomToDevice)(room.x, room.y, p), { x: dx, y: dy });
            }
        });
        (0, vitest_1.it)('at 90°', () => {
            const p = { x: 10, y: 20, rotationDeg: 90 };
            for (const [dx, dy] of testPoints) {
                const room = (0, coordinateTransform_1.deviceToRoom)(dx, dy, p);
                expectPointClose((0, coordinateTransform_1.roomToDevice)(room.x, room.y, p), { x: dx, y: dy });
            }
        });
        (0, vitest_1.it)('at 45°', () => {
            const p = { x: -5, y: 30, rotationDeg: 45 };
            for (const [dx, dy] of testPoints) {
                const room = (0, coordinateTransform_1.deviceToRoom)(dx, dy, p);
                expectPointClose((0, coordinateTransform_1.roomToDevice)(room.x, room.y, p), { x: dx, y: dy });
            }
        });
        (0, vitest_1.it)('at combined rotationDeg=30 + installationAngle=15', () => {
            const p = { x: 7, y: -3, rotationDeg: 30, installationAngle: 15 };
            for (const [dx, dy] of testPoints) {
                const room = (0, coordinateTransform_1.deviceToRoom)(dx, dy, p);
                expectPointClose((0, coordinateTransform_1.roomToDevice)(room.x, room.y, p), { x: dx, y: dy });
            }
        });
        (0, vitest_1.it)('with explicit installationAngle parameter', () => {
            const p = { x: 0, y: 0, rotationDeg: 10, installationAngle: 999 };
            const explicitAngle = 25;
            for (const [dx, dy] of testPoints) {
                const room = (0, coordinateTransform_1.deviceToRoom)(dx, dy, p, explicitAngle);
                expectPointClose((0, coordinateTransform_1.roomToDevice)(room.x, room.y, p, explicitAngle), { x: dx, y: dy });
            }
        });
    });
});
// ── transformZoneRectToDevice ────────────────────────────────────
(0, vitest_1.describe)('transformZoneRectToDevice', () => {
    const baseZone = {
        id: 'z1',
        type: 'regular',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
    };
    (0, vitest_1.it)('0° at origin: identity', () => {
        const p = { x: 0, y: 0, rotationDeg: 0 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(baseZone, p);
        (0, vitest_1.expect)(result.x).toBeCloseTo(0);
        (0, vitest_1.expect)(result.y).toBeCloseTo(0);
        (0, vitest_1.expect)(result.width).toBeCloseTo(100);
        (0, vitest_1.expect)(result.height).toBeCloseTo(50);
    });
    (0, vitest_1.it)('0° with placement offset subtracts offset', () => {
        const p = { x: 5, y: 10, rotationDeg: 0 };
        const zone = { ...baseZone, x: 15, y: 20, width: 30, height: 40 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(zone, p);
        (0, vitest_1.expect)(result.x).toBeCloseTo(10);
        (0, vitest_1.expect)(result.y).toBeCloseTo(10);
        (0, vitest_1.expect)(result.width).toBeCloseTo(30);
        (0, vitest_1.expect)(result.height).toBeCloseTo(40);
    });
    (0, vitest_1.it)('90° at origin: width and height swap', () => {
        const p = { x: 0, y: 0, rotationDeg: 90 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(baseZone, p);
        // Corners: (0,0),(100,0),(100,50),(0,50)
        // roomToDevice with -90°: cos=0, sin=-1
        //   (0,0)→(0,0)  (100,0)→(0,-100)  (100,50)→(50,-100)  (0,50)→(50,0)
        // AABB: x=0, y=-100, w=50, h=100
        (0, vitest_1.expect)(result.x).toBeCloseTo(0);
        (0, vitest_1.expect)(result.y).toBeCloseTo(-100);
        (0, vitest_1.expect)(result.width).toBeCloseTo(50);
        (0, vitest_1.expect)(result.height).toBeCloseTo(100);
    });
    (0, vitest_1.it)('45° at origin: AABB is larger than original rect', () => {
        const p = { x: 0, y: 0, rotationDeg: 45 };
        const square = { ...baseZone, width: 100, height: 100 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(square, p);
        // AABB of a rotated 100×100 square at 45° is ~141.42 × 141.42
        const expectedSide = 100 * Math.SQRT2;
        (0, vitest_1.expect)(result.width).toBeCloseTo(expectedSide, 2);
        (0, vitest_1.expect)(result.height).toBeCloseTo(expectedSide, 2);
    });
    (0, vitest_1.it)('AABB containment: all original corners map inside the output rect', () => {
        const p = { x: 10, y: 20, rotationDeg: 33 };
        const zone = { ...baseZone, x: 5, y: 5, width: 80, height: 60 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(zone, p);
        // Transform each corner and check it lies within the AABB
        const corners = [
            { x: zone.x, y: zone.y },
            { x: zone.x + zone.width, y: zone.y },
            { x: zone.x + zone.width, y: zone.y + zone.height },
            { x: zone.x, y: zone.y + zone.height },
        ];
        for (const corner of corners) {
            const dc = (0, coordinateTransform_1.roomToDevice)(corner.x, corner.y, p);
            (0, vitest_1.expect)(dc.x).toBeGreaterThanOrEqual(result.x - 1e-9);
            (0, vitest_1.expect)(dc.y).toBeGreaterThanOrEqual(result.y - 1e-9);
            (0, vitest_1.expect)(dc.x).toBeLessThanOrEqual(result.x + result.width + 1e-9);
            (0, vitest_1.expect)(dc.y).toBeLessThanOrEqual(result.y + result.height + 1e-9);
        }
    });
    (0, vitest_1.it)('preserves zone metadata (id, type, enabled, label)', () => {
        const zone = { ...baseZone, enabled: true, label: 'Desk' };
        const p = { x: 0, y: 0, rotationDeg: 90 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(zone, p);
        (0, vitest_1.expect)(result.id).toBe('z1');
        (0, vitest_1.expect)(result.type).toBe('regular');
        (0, vitest_1.expect)(result.enabled).toBe(true);
        (0, vitest_1.expect)(result.label).toBe('Desk');
    });
    (0, vitest_1.it)('180° rotation at origin: position reflects through origin', () => {
        const p = { x: 0, y: 0, rotationDeg: 180 };
        const result = (0, coordinateTransform_1.transformZoneRectToDevice)(baseZone, p);
        // Corners (0,0),(100,0),(100,50),(0,50)
        // roomToDevice 180° (angleRad=−PI, cos=−1, sin=0):
        //   (0,0)→(0,0) (100,0)→(−100,0) (100,50)→(−100,−50) (0,50)→(0,−50)
        // AABB: x=−100, y=−50, w=100, h=50
        (0, vitest_1.expect)(result.x).toBeCloseTo(-100);
        (0, vitest_1.expect)(result.y).toBeCloseTo(-50);
        (0, vitest_1.expect)(result.width).toBeCloseTo(100);
        (0, vitest_1.expect)(result.height).toBeCloseTo(50);
    });
});
// ── transformZonePolygonToDevice ─────────────────────────────────
(0, vitest_1.describe)('transformZonePolygonToDevice', () => {
    const triangle = {
        id: 'p1',
        type: 'exclusion',
        vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 80 },
        ],
    };
    (0, vitest_1.it)('0° at origin: vertices unchanged', () => {
        const p = { x: 0, y: 0, rotationDeg: 0 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p);
        (0, vitest_1.expect)(result.vertices).toHaveLength(3);
        expectPointClose(result.vertices[0], { x: 0, y: 0 });
        expectPointClose(result.vertices[1], { x: 100, y: 0 });
        expectPointClose(result.vertices[2], { x: 50, y: 80 });
    });
    (0, vitest_1.it)('0° with offset: each vertex shifts by −offset', () => {
        const p = { x: 10, y: 20, rotationDeg: 0 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p);
        expectPointClose(result.vertices[0], { x: -10, y: -20 });
        expectPointClose(result.vertices[1], { x: 90, y: -20 });
        expectPointClose(result.vertices[2], { x: 40, y: 60 });
    });
    (0, vitest_1.it)('90° rotation transforms each vertex correctly', () => {
        const p = { x: 0, y: 0, rotationDeg: 90 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p);
        // roomToDevice with -90°: cos=0, sin=-1
        //   (0,0)→(0,0)  (100,0)→(0,-100)  (50,80)→(80,-50)
        expectPointClose(result.vertices[0], { x: 0, y: 0 });
        expectPointClose(result.vertices[1], { x: 0, y: -100 });
        expectPointClose(result.vertices[2], { x: 80, y: -50 });
    });
    (0, vitest_1.it)('vertex count preserved at arbitrary angle', () => {
        const p = { x: 5, y: 5, rotationDeg: 37 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p);
        (0, vitest_1.expect)(result.vertices).toHaveLength(triangle.vertices.length);
    });
    (0, vitest_1.it)('each vertex equals roomToDevice of the original vertex', () => {
        const p = { x: 15, y: -8, rotationDeg: 123, installationAngle: 17 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p);
        for (let i = 0; i < triangle.vertices.length; i++) {
            const expected = (0, coordinateTransform_1.roomToDevice)(triangle.vertices[i].x, triangle.vertices[i].y, p);
            expectPointClose(result.vertices[i], expected);
        }
    });
    (0, vitest_1.it)('preserves zone metadata (id, type, enabled, label)', () => {
        const poly = { ...triangle, enabled: false, label: 'Entry' };
        const p = { x: 0, y: 0, rotationDeg: 45 };
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(poly, p);
        (0, vitest_1.expect)(result.id).toBe('p1');
        (0, vitest_1.expect)(result.type).toBe('exclusion');
        (0, vitest_1.expect)(result.enabled).toBe(false);
        (0, vitest_1.expect)(result.label).toBe('Entry');
    });
    (0, vitest_1.it)('explicit installationAngle parameter used in vertex transform', () => {
        const p = { x: 0, y: 0, rotationDeg: 0, installationAngle: 999 };
        const explicitAngle = 90;
        const result = (0, coordinateTransform_1.transformZonePolygonToDevice)(triangle, p, explicitAngle);
        // effective = 0 + 90 = 90°, same as 90° test
        expectPointClose(result.vertices[0], { x: 0, y: 0 });
        expectPointClose(result.vertices[1], { x: 0, y: -100 });
        expectPointClose(result.vertices[2], { x: 80, y: -50 });
    });
});
