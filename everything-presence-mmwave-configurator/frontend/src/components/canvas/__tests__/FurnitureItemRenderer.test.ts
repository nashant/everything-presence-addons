import { describe, it, expect, vi } from 'vitest';
import { furnitureRenderer } from '../FurnitureItemRenderer';
import type { FurnitureInstance } from '../../../api/types';
import type {
  CanvasContext,
  FurnitureMoveState,
  FurnitureResizeState,
  FurnitureRotateState,
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

function makeFurniture(overrides?: Partial<FurnitureInstance>): FurnitureInstance {
  return {
    id: 'f1',
    typeId: 'sofa',
    x: 0,
    y: 0,
    width: 400,
    depth: 200,
    height: 100,
    rotationDeg: 0,
    aspectRatioLocked: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// onDragMove — furniture-move
// ---------------------------------------------------------------------------
describe('furnitureRenderer.onDragMove (move)', () => {
  it('updates currentPos based on delta from start', () => {
    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'f1',
      start: { x: 0, y: 0 },
      basePos: { x: 100, y: 100 },
    };
    const items = [makeFurniture({ id: 'f1', x: 100, y: 100 })];

    const result = furnitureRenderer.onDragMove(
      { x: 50, y: 30 }, // mouse moved 50,30 from start
      drag,
      items,
      makeCtx(),
    );

    expect(result.mode).toBe('furniture-move');
    if (result.mode === 'furniture-move') {
      expect(result.currentPos).toBeDefined();
      expect(result.currentPos!.x).toBeCloseTo(150); // basePos.x + dx
      expect(result.currentPos!.y).toBeCloseTo(130); // basePos.y + dy
    }
  });

  it('constrains position to stay inside the room', () => {
    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'f1',
      start: { x: 0, y: 0 },
      basePos: { x: 1800, y: 0 }, // near right wall
    };
    const items = [makeFurniture({ id: 'f1', x: 1800, y: 0 })];

    const result = furnitureRenderer.onDragMove(
      { x: 500, y: 0 }, // try to push 500 further right → out of bounds
      drag,
      items,
      makeCtx(),
    );

    if (result.mode === 'furniture-move') {
      // Should be constrained so furniture stays in room
      expect(result.currentPos!.x).toBeLessThan(2000);
    }
  });

  it('applies snapPoint from context', () => {
    const snap = vi.fn((p: Point) => ({ x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }));
    const ctx = makeCtx({ snapPoint: snap });

    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'f1',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    furnitureRenderer.onDragMove({ x: 55, y: 33 }, drag, [makeFurniture()], ctx);
    expect(snap).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onDragMove — furniture-resize
// ---------------------------------------------------------------------------
describe('furnitureRenderer.onDragMove (resize)', () => {
  it('resizes from SE corner — grows with positive delta', () => {
    const drag: FurnitureResizeState = {
      mode: 'furniture-resize',
      id: 'f1',
      corner: 'se',
      start: { x: 0, y: 0 },
      baseSize: { width: 400, depth: 200 },
      basePos: { x: 0, y: 0 },
    };
    const items = [makeFurniture()];

    const result = furnitureRenderer.onDragMove({ x: 100, y: 50 }, drag, items, makeCtx());

    if (result.mode === 'furniture-resize') {
      expect(result.currentSize!.width).toBeCloseTo(500);
      expect(result.currentSize!.depth).toBeCloseTo(250);
    }
  });

  it('enforces minimum size of 100', () => {
    const drag: FurnitureResizeState = {
      mode: 'furniture-resize',
      id: 'f1',
      corner: 'se',
      start: { x: 0, y: 0 },
      baseSize: { width: 200, depth: 200 },
      basePos: { x: 0, y: 0 },
    };
    const items = [makeFurniture({ width: 200, depth: 200 })];

    const result = furnitureRenderer.onDragMove({ x: -500, y: -500 }, drag, items, makeCtx());

    if (result.mode === 'furniture-resize') {
      expect(result.currentSize!.width).toBeGreaterThanOrEqual(100);
      expect(result.currentSize!.depth).toBeGreaterThanOrEqual(100);
    }
  });

  it('maintains aspect ratio when locked', () => {
    const drag: FurnitureResizeState = {
      mode: 'furniture-resize',
      id: 'f1',
      corner: 'se',
      start: { x: 0, y: 0 },
      baseSize: { width: 400, depth: 200 },
      basePos: { x: 0, y: 0 },
    };
    const items = [makeFurniture({ width: 400, depth: 200, aspectRatioLocked: true })];

    const result = furnitureRenderer.onDragMove({ x: 100, y: 0 }, drag, items, makeCtx());

    if (result.mode === 'furniture-resize') {
      const ratio = result.currentSize!.width / result.currentSize!.depth;
      expect(ratio).toBeCloseTo(2); // original 400/200 = 2
    }
  });

  it('NW corner: grows inward with negative delta', () => {
    const drag: FurnitureResizeState = {
      mode: 'furniture-resize',
      id: 'f1',
      corner: 'nw',
      start: { x: 0, y: 0 },
      baseSize: { width: 400, depth: 200 },
      basePos: { x: 0, y: 0 },
    };
    const items = [makeFurniture()];

    const result = furnitureRenderer.onDragMove({ x: -100, y: -50 }, drag, items, makeCtx());

    if (result.mode === 'furniture-resize') {
      expect(result.currentSize!.width).toBeCloseTo(500); // width - (-100) = 500
      expect(result.currentSize!.depth).toBeCloseTo(250); // depth - (-50) = 250
    }
  });
});

// ---------------------------------------------------------------------------
// onDragMove — furniture-rotate
// ---------------------------------------------------------------------------
describe('furnitureRenderer.onDragMove (rotate)', () => {
  it('calculates angle from center to mouse position', () => {
    const drag: FurnitureRotateState = {
      mode: 'furniture-rotate',
      id: 'f1',
      start: { x: 0, y: 0 },
      centerPos: { x: 0, y: 0 },
      baseRotation: 0,
    };
    const items = [makeFurniture()];

    // Mouse directly above center → should be ~0° (or 360°)
    const result = furnitureRenderer.onDragMove({ x: 0, y: -100 }, drag, items, makeCtx());

    if (result.mode === 'furniture-rotate') {
      expect(result.currentRotation).toBeDefined();
      // atan2(0, 100) = 0, snapped to 0
      expect(result.currentRotation! % 360).toBe(0);
    }
  });

  it('snaps to 15-degree increments', () => {
    const drag: FurnitureRotateState = {
      mode: 'furniture-rotate',
      id: 'f1',
      start: { x: 0, y: 0 },
      centerPos: { x: 0, y: 0 },
      baseRotation: 0,
    };
    const items = [makeFurniture()];

    // Mouse to the right → ~90°
    const result = furnitureRenderer.onDragMove({ x: 100, y: 0 }, drag, items, makeCtx());

    if (result.mode === 'furniture-rotate') {
      expect(result.currentRotation! % 15).toBe(0); // snapped
      expect(result.currentRotation).toBe(90);
    }
  });
});

// ---------------------------------------------------------------------------
// onDragEnd
// ---------------------------------------------------------------------------
describe('furnitureRenderer.onDragEnd', () => {
  it('commits move position via onChange', () => {
    const onChange = vi.fn();
    const item = makeFurniture({ x: 0, y: 0 });
    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'f1',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
      currentPos: { x: 200, y: 300 },
    };

    furnitureRenderer.onDragEnd(drag, [item], onChange, makeCtx());

    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0];
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
    expect(result.id).toBe('f1');
  });

  it('uses basePos when no currentPos (click without drag)', () => {
    const onChange = vi.fn();
    const item = makeFurniture({ x: 100, y: 200 });
    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'f1',
      start: { x: 0, y: 0 },
      basePos: { x: 100, y: 200 },
      // no currentPos
    };

    furnitureRenderer.onDragEnd(drag, [item], onChange, makeCtx());

    const result = onChange.mock.calls[0][0];
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('commits resize dimensions via onChange', () => {
    const onChange = vi.fn();
    const item = makeFurniture();
    const drag: FurnitureResizeState = {
      mode: 'furniture-resize',
      id: 'f1',
      corner: 'se',
      start: { x: 0, y: 0 },
      baseSize: { width: 400, depth: 200 },
      basePos: { x: 0, y: 0 },
      currentSize: { width: 600, depth: 300 },
      currentPos: { x: 50, y: 25 },
    };

    furnitureRenderer.onDragEnd(drag, [item], onChange, makeCtx());

    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0];
    expect(result.width).toBe(600);
    expect(result.depth).toBe(300);
    expect(result.x).toBe(50);
    expect(result.y).toBe(25);
  });

  it('commits rotation via onChange and constrains to polygon', () => {
    const onChange = vi.fn();
    const item = makeFurniture();
    const drag: FurnitureRotateState = {
      mode: 'furniture-rotate',
      id: 'f1',
      start: { x: 0, y: 0 },
      centerPos: { x: 0, y: 0 },
      baseRotation: 0,
      currentRotation: 45,
    };

    furnitureRenderer.onDragEnd(drag, [item], onChange, makeCtx());

    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0];
    expect(result.rotationDeg).toBe(45);
  });

  it('does nothing when item is not found', () => {
    const onChange = vi.fn();
    const drag: FurnitureMoveState = {
      mode: 'furniture-move',
      id: 'nonexistent',
      start: { x: 0, y: 0 },
      basePos: { x: 0, y: 0 },
    };

    furnitureRenderer.onDragEnd(drag, [makeFurniture()], onChange, makeCtx());

    expect(onChange).not.toHaveBeenCalled();
  });
});
