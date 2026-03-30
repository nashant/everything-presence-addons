import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  closestPointOnSegment,
  findClosestPointOnPolygon,
  getRotatedRectCorners,
  constrainFurnitureToPolygon,
  constrainPointToPolygon,
  lineIntersection,
  type Point,
} from '../geometry';

// ---------------------------------------------------------------------------
// Test fixture: a simple 2000×2000 square room centered at origin
// ---------------------------------------------------------------------------
const SQUARE_ROOM: Point[] = [
  { x: -1000, y: -1000 },
  { x: 1000, y: -1000 },
  { x: 1000, y: 1000 },
  { x: -1000, y: 1000 },
];

// L-shaped room
const L_SHAPED: Point[] = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 1000, y: 1000 },
  { x: 1000, y: 2000 },
  { x: 0, y: 2000 },
];

describe('isPointInPolygon', () => {
  it('returns true for a point at the center of a square', () => {
    expect(isPointInPolygon({ x: 0, y: 0 }, SQUARE_ROOM)).toBe(true);
  });

  it('returns true for a point near a corner', () => {
    expect(isPointInPolygon({ x: 999, y: 999 }, SQUARE_ROOM)).toBe(true);
  });

  it('returns false for a point outside the square', () => {
    expect(isPointInPolygon({ x: 1500, y: 0 }, SQUARE_ROOM)).toBe(false);
  });

  it('returns false for a point far outside', () => {
    expect(isPointInPolygon({ x: 5000, y: 5000 }, SQUARE_ROOM)).toBe(false);
  });

  it('returns true for any point when polygon has < 3 vertices', () => {
    expect(isPointInPolygon({ x: 9999, y: 9999 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(true);
  });

  it('handles L-shaped room — inside the L', () => {
    expect(isPointInPolygon({ x: 500, y: 500 }, L_SHAPED)).toBe(true);
    expect(isPointInPolygon({ x: 500, y: 1500 }, L_SHAPED)).toBe(true);
    expect(isPointInPolygon({ x: 1500, y: 500 }, L_SHAPED)).toBe(true);
  });

  it('handles L-shaped room — outside the cutout', () => {
    expect(isPointInPolygon({ x: 1500, y: 1500 }, L_SHAPED)).toBe(false);
  });
});

describe('closestPointOnSegment', () => {
  it('returns the projected point on a horizontal segment', () => {
    const result = closestPointOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
  });

  it('clamps to segment start when projection is before start', () => {
    const result = closestPointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('clamps to segment end when projection is past end', () => {
    const result = closestPointOnSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(0);
  });

  it('returns segStart for zero-length segment', () => {
    const result = closestPointOnSegment({ x: 5, y: 5 }, { x: 3, y: 3 }, { x: 3, y: 3 });
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
  });
});

describe('findClosestPointOnPolygon', () => {
  it('finds the closest point on the boundary for an outside point', () => {
    const result = findClosestPointOnPolygon({ x: 1500, y: 0 }, SQUARE_ROOM);
    expect(result.x).toBeCloseTo(1000);
    expect(result.y).toBeCloseTo(0);
  });

  it('finds boundary point for an inside point', () => {
    // Should still find closest wall
    const result = findClosestPointOnPolygon({ x: 0, y: 990 }, SQUARE_ROOM);
    expect(result.y).toBeCloseTo(1000);
  });
});

describe('getRotatedRectCorners', () => {
  it('returns correct corners for an unrotated rectangle', () => {
    const corners = getRotatedRectCorners({ x: 0, y: 0 }, 200, 100, 0);

    // Should be: TL(-100,-50), TR(100,-50), BR(100,50), BL(-100,50)
    expect(corners[0].x).toBeCloseTo(-100);
    expect(corners[0].y).toBeCloseTo(-50);
    expect(corners[1].x).toBeCloseTo(100);
    expect(corners[1].y).toBeCloseTo(-50);
    expect(corners[2].x).toBeCloseTo(100);
    expect(corners[2].y).toBeCloseTo(50);
    expect(corners[3].x).toBeCloseTo(-100);
    expect(corners[3].y).toBeCloseTo(50);
  });

  it('rotates corners by 90 degrees', () => {
    const corners = getRotatedRectCorners({ x: 0, y: 0 }, 200, 100, 90);

    // 90° rotation swaps axes: old TL(-100,-50) → (50, -100) ish
    // cos(90)=0, sin(90)=1 → x' = x*0 - y*1 = y, y' = x*1 + y*0 = x
    expect(corners[0].x).toBeCloseTo(50);   // -(-50) = 50
    expect(corners[0].y).toBeCloseTo(-100); // -100
    expect(corners[2].x).toBeCloseTo(-50);
    expect(corners[2].y).toBeCloseTo(100);
  });

  it('preserves center offset', () => {
    const corners = getRotatedRectCorners({ x: 500, y: 300 }, 200, 100, 0);
    const avgX = corners.reduce((s, c) => s + c.x, 0) / 4;
    const avgY = corners.reduce((s, c) => s + c.y, 0) / 4;
    expect(avgX).toBeCloseTo(500);
    expect(avgY).toBeCloseTo(300);
  });
});

describe('constrainFurnitureToPolygon', () => {
  it('does not move furniture already inside the room', () => {
    const result = constrainFurnitureToPolygon({ x: 0, y: 0 }, 200, 100, 0, SQUARE_ROOM);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('pushes furniture that extends outside back in', () => {
    // Place center at x=950 with width=200 → right edge at 1050, outside
    const result = constrainFurnitureToPolygon({ x: 950, y: 0 }, 200, 100, 0, SQUARE_ROOM);
    // Center should be pushed left so right edge ≤ 1000
    expect(result.x).toBeLessThan(950);
  });

  it('pushes furniture that is fully outside back toward the room', () => {
    const result = constrainFurnitureToPolygon({ x: 2000, y: 0 }, 200, 100, 0, SQUARE_ROOM);
    // Should be pulled significantly inward
    expect(result.x).toBeLessThan(1000);
  });

  it('returns center unchanged when polygon has < 3 points', () => {
    const result = constrainFurnitureToPolygon({ x: 5000, y: 5000 }, 200, 100, 0, []);
    expect(result.x).toBe(5000);
    expect(result.y).toBe(5000);
  });
});

describe('constrainPointToPolygon', () => {
  it('returns the same point if already inside', () => {
    const result = constrainPointToPolygon({ x: 0, y: 0 }, SQUARE_ROOM);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('constrains an outside point to near the boundary', () => {
    const result = constrainPointToPolygon({ x: 1500, y: 0 }, SQUARE_ROOM);
    // Should be on or just inside the boundary (with 10-unit margin)
    expect(result.x).toBeLessThanOrEqual(1000);
    expect(result.x).toBeGreaterThan(950);
  });

  it('result is inside the polygon', () => {
    const result = constrainPointToPolygon({ x: 2000, y: 2000 }, SQUARE_ROOM);
    expect(isPointInPolygon(result, SQUARE_ROOM)).toBe(true);
  });

  it('returns unchanged for degenerate polygon', () => {
    const result = constrainPointToPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }]);
    expect(result.x).toBe(5);
    expect(result.y).toBe(5);
  });
});

describe('lineIntersection', () => {
  it('finds intersection of crossing segments', () => {
    const result = lineIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 10, y: 0 }, { x: 0, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5);
    expect(result!.y).toBeCloseTo(5);
  });

  it('returns null for parallel segments', () => {
    const result = lineIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 },
    );
    expect(result).toBeNull();
  });

  it('returns null when segments do not reach each other', () => {
    const result = lineIntersection(
      { x: 0, y: 0 }, { x: 1, y: 1 },
      { x: 5, y: 0 }, { x: 5, y: 1 },
    );
    expect(result).toBeNull();
  });

  it('finds intersection at endpoint', () => {
    const result = lineIntersection(
      { x: 0, y: 0 }, { x: 5, y: 5 },
      { x: 5, y: 5 }, { x: 10, y: 0 },
    );
    // t=1, u=0 — both within [0,1]
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5);
    expect(result!.y).toBeCloseTo(5);
  });
});
