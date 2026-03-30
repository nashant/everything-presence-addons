import { describe, it, expect, vi } from 'vitest';
import { zoneRenderer } from '../ZoneItemRenderer';
import type { Zone, ZoneRect, ZonePolygon } from '../../../api/types';
import type {
  CanvasContext,
  ZoneMoveState,
  ZoneVertexState,
  ZoneResizeState,
} from '../types';
import type { Point } from '../geometry';
import type React from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SQUARE_ROOM: Point[] = [
  { x: -2000, y: -2000 },
  { x: 2000, y: -2000 },
  { x: 2000, y: 2000 },
  { x: -2000, y: 2000 },
];

function makeCtx(overrides?: Partial<CanvasContext>): CanvasContext {
  return {
    toCanvasCoord: (p) => ({ x: p.x + 350, y: p.y + 350 }),
    fromCanvasCoord: (x, y) => ({ x: x - 350, y: y - 350 }),
    snapPoint: (p) => p,
    safePoints: SQUARE_ROOM,
    scale: 0.1,
    suppressClickRef: { current: false } as React.MutableRefObject<boolean>,
    ...overrides,
  };
}

function makeRectZone(overrides?: Partial<ZoneRect>): ZoneRect {
  return {
    id: 'z1',
    type: 'regular',
    x: 0,
    y: 0,
    width: 500,
    height: 300,
    enabled: true,
    label: 'Test Zone',
    ...overrides,
  };
}

function makePolyZone(overrides?: Partial<ZonePolygon>): ZonePolygon {
  return {
    id: 'z2',
    type: 'regular',
    vertices: [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 300 },
      { x: 0, y: 300 },
    ],
    enabled: true,
    label: 'Poly Zone',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// onDragMove — zone-move (rect)
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragMove (rect move)', () => {
  it('applies delta to zone position via onZoneChange', () => {
    const onZoneChange = vi.fn();
    const zone = makeRectZone({ x: 100, y: 200 });
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'z1',
      start: { x: 0, y: 0 },
      basePos: { x: 100, y: 200 },
    };

    zoneRenderer.onDragMove({ x: 50, y: 30 }, drag, [zone], makeCtx(), onZoneChange);

    expect(onZoneChange).toHaveBeenCalledOnce();
    const updated = onZoneChange.mock.calls[0][0] as ZoneRect;
    expect(updated.x).toBeCloseTo(150);
    expect(updated.y).toBeCloseTo(230);
  });

  it('applies snap to new position', () => {
    const snap = vi.fn((p: Point) => ({
      x: Math.round(p.x / 100) * 100,
      y: Math.round(p.y / 100) * 100,
    }));
    const onZoneChange = vi.fn();
    const zone = makeRectZone();
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'z1',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    zoneRenderer.onDragMove({ x: 55, y: 33 }, drag, [zone], makeCtx({ snapPoint: snap }), onZoneChange);

    expect(snap).toHaveBeenCalled();
    const updated = onZoneChange.mock.calls[0][0] as ZoneRect;
    expect(updated.x).toBe(100); // snapped from 55
    expect(updated.y).toBe(0);   // snapped from 33
  });

  it('sets suppressClickRef during drag', () => {
    const ctx = makeCtx();
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'z1',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    zoneRenderer.onDragMove({ x: 10, y: 10 }, drag, [makeRectZone()], ctx, vi.fn());
    expect(ctx.suppressClickRef.current).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onDragMove — zone-move (polygon body)
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragMove (polygon body move)', () => {
  it('translates all vertices by delta', () => {
    const onZoneChange = vi.fn();
    const zone = makePolyZone();
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'z2',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
      baseVertices: zone.vertices.map((v) => ({ ...v })),
    };

    zoneRenderer.onDragMove({ x: 100, y: 50 }, drag, [zone], makeCtx(), onZoneChange);

    expect(onZoneChange).toHaveBeenCalledOnce();
    const updated = onZoneChange.mock.calls[0][0] as ZonePolygon;
    expect(updated.vertices[0]).toEqual({ x: 100, y: 50 });
    expect(updated.vertices[1]).toEqual({ x: 600, y: 50 });
    expect(updated.vertices[2]).toEqual({ x: 600, y: 350 });
    expect(updated.vertices[3]).toEqual({ x: 100, y: 350 });
  });
});

// ---------------------------------------------------------------------------
// onDragMove — zone-vertex
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragMove (vertex)', () => {
  it('moves a single vertex', () => {
    const onZoneChange = vi.fn();
    const zone = makePolyZone();
    const drag: ZoneVertexState = {
      mode: 'zone-vertex',
      id: 'z2',
      start: { x: 0, y: 0 },
      basePos: { x: 500, y: 0 }, // vertex 1
      vertexIndex: 1,
    };

    zoneRenderer.onDragMove({ x: 100, y: 50 }, drag, [zone], makeCtx(), onZoneChange);

    expect(onZoneChange).toHaveBeenCalledOnce();
    const updated = onZoneChange.mock.calls[0][0] as ZonePolygon;
    // Vertex 1 should move to basePos + delta = 500+100, 0+50
    expect(updated.vertices[1]).toEqual({ x: 600, y: 50 });
    // Other vertices should stay the same
    expect(updated.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(updated.vertices[2]).toEqual({ x: 500, y: 300 });
  });
});

// ---------------------------------------------------------------------------
// onDragMove — zone-resize
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragMove (resize)', () => {
  it('resizes from SE corner', () => {
    const onZoneChange = vi.fn();
    const zone = makeRectZone({ x: 0, y: 0, width: 500, height: 300 });
    const drag: ZoneResizeState = {
      mode: 'zone-resize',
      id: 'z1',
      corner: 'se',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
      baseSize: { w: 500, h: 300 },
    };

    zoneRenderer.onDragMove({ x: 200, y: 100 }, drag, [zone], makeCtx(), onZoneChange);

    expect(onZoneChange).toHaveBeenCalledOnce();
    const updated = onZoneChange.mock.calls[0][0] as ZoneRect;
    expect(updated.width).toBe(700);   // 500 + 200
    expect(updated.height).toBe(400);  // 300 + 100
  });

  it('resizes from NW corner — negative delta grows', () => {
    const onZoneChange = vi.fn();
    const zone = makeRectZone({ x: 0, y: 0, width: 500, height: 300 });
    const drag: ZoneResizeState = {
      mode: 'zone-resize',
      id: 'z1',
      corner: 'nw',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
      baseSize: { w: 500, h: 300 },
    };

    zoneRenderer.onDragMove({ x: -200, y: -100 }, drag, [zone], makeCtx(), onZoneChange);

    const updated = onZoneChange.mock.calls[0][0] as ZoneRect;
    expect(updated.width).toBe(700);   // 500 - (-200)
    expect(updated.height).toBe(400);  // 300 - (-100)
  });

  it('enforces minimum size of 100', () => {
    const onZoneChange = vi.fn();
    const zone = makeRectZone({ width: 200, height: 200 });
    const drag: ZoneResizeState = {
      mode: 'zone-resize',
      id: 'z1',
      corner: 'se',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
      baseSize: { w: 200, h: 200 },
    };

    zoneRenderer.onDragMove({ x: -500, y: -500 }, drag, [zone], makeCtx(), onZoneChange);

    const updated = onZoneChange.mock.calls[0][0] as ZoneRect;
    expect(updated.width).toBeGreaterThanOrEqual(100);
    expect(updated.height).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// onDragEnd
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragEnd', () => {
  it('is a no-op (zones apply changes during drag)', () => {
    const onChange = vi.fn();
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'z1',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    zoneRenderer.onDragEnd(drag, [makeRectZone()], onChange, makeCtx());

    // Should NOT call onChange — zones already committed during drag
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('zoneRenderer.onDragMove edge cases', () => {
  it('returns drag unchanged when zone is not found', () => {
    const onZoneChange = vi.fn();
    const drag: ZoneMoveState = {
      mode: 'zone-move',
      id: 'nonexistent',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    const result = zoneRenderer.onDragMove({ x: 100, y: 100 }, drag, [makeRectZone()], makeCtx(), onZoneChange);

    expect(onZoneChange).not.toHaveBeenCalled();
    expect(result).toBe(drag);
  });
});
