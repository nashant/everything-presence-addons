/**
 * Furniture item renderer — handles rendering, drag, resize, and rotate
 * for furniture items on the room canvas.
 */

import React from 'react';
import type { FurnitureInstance } from '../../api/types';
import { getFurnitureIcon } from '../../furniture/icons';
import { getFurnitureColors } from '../../furniture/colors';
import { constrainFurnitureToPolygon, type Point } from './geometry';
import type {
  CanvasContext,
  FurnitureDrag,
  FurnitureMoveState,
  FurnitureResizeState,
  FurnitureRotateState,
  ItemDragHandlers,
  ItemRenderer,
} from './types';

/** Convert a world-space length to canvas-space length */
const toCanvasLength = (v: number, rangeMm: number, canvasSize: number) =>
  (v / rangeMm) * canvasSize;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderFurniture(
  items: FurnitureInstance[],
  selectedId: string | null,
  activeDrag: FurnitureDrag | null,
  ctx: CanvasContext,
  handlers: ItemDragHandlers<FurnitureDrag>,
  canvasSize: number,
  rangeMm: number,
  canChange: boolean,
  toWorldFromEvent: (e: React.MouseEvent) => Point | null,
): React.ReactNode {
  return items.map((item) => {
    const isDragging = activeDrag?.mode === 'furniture-move' && activeDrag.id === item.id;
    const isResizing = activeDrag?.mode === 'furniture-resize' && activeDrag.id === item.id;
    const isRotating = activeDrag?.mode === 'furniture-rotate' && activeDrag.id === item.id;

    // Determine display position, size, and rotation
    let displayPos = { x: item.x, y: item.y };
    let displayWidth = item.width;
    let displayDepth = item.depth;
    let displayRotation = item.rotationDeg;

    if (isDragging && activeDrag?.mode === 'furniture-move') {
      displayPos = activeDrag.currentPos || activeDrag.basePos;
    } else if (isResizing && activeDrag?.mode === 'furniture-resize') {
      displayPos = activeDrag.currentPos || activeDrag.basePos;
      const size = activeDrag.currentSize || activeDrag.baseSize;
      displayWidth = size.width;
      displayDepth = size.depth;
    } else if (isRotating && activeDrag?.mode === 'furniture-rotate') {
      displayRotation =
        activeDrag.currentRotation !== undefined
          ? activeDrag.currentRotation
          : activeDrag.baseRotation;
    }

    const canvasPos = ctx.toCanvasCoord({ x: displayPos.x, y: displayPos.y });
    const canvasWidth = toCanvasLength(displayWidth, rangeMm, canvasSize);
    const canvasHeight = toCanvasLength(displayDepth, rangeMm, canvasSize);
    const isSelected = selectedId === item.id;
    const Icon = getFurnitureIcon(item.typeId);
    const colors = getFurnitureColors(item.typeId, isSelected);

    return (
      <g key={item.id}>
        {/* Main furniture group with transform */}
        <g transform={`translate(${canvasPos.x}, ${canvasPos.y}) rotate(${displayRotation})`}>
          {/* Furniture icon */}
          {Icon && (
            <svg
              x={-canvasWidth / 2}
              y={-canvasHeight / 2}
              width={canvasWidth}
              height={canvasHeight}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ overflow: 'visible', pointerEvents: 'none' }}
            >
              <Icon />
            </svg>
          )}
          {/* Clickable interaction rectangle */}
          <rect
            x={-canvasWidth / 2}
            y={-canvasHeight / 2}
            width={canvasWidth}
            height={canvasHeight}
            fill="transparent"
            stroke={isSelected ? '#0ea5e9' : 'transparent'}
            strokeWidth={isSelected ? 2 : 0}
            strokeDasharray={isSelected ? '4 2' : undefined}
            rx={3}
            style={{ cursor: canChange ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              ctx.onItemSelect?.('furniture', item.id);
              if (!canChange) return;
              const worldPos = toWorldFromEvent(e);
              if (!worldPos) return;
              ctx.suppressClickRef.current = false;
              handlers.startDrag({
                mode: 'furniture-move',
                id: item.id,
                start: worldPos,
                basePos: { x: item.x, y: item.y },
              });
              ctx.onDragStateChange?.(true);
            }}
          />
        </g>

        {/* Resize + rotation handles (only when selected and idle) */}
        {isSelected && !isDragging && !isResizing && !isRotating && (() => {
          const handleSize = 8;
          const handles: Array<{
            corner: 'nw' | 'ne' | 'sw' | 'se';
            x: number;
            y: number;
            cursor: string;
          }> = [
            { corner: 'nw', x: -canvasWidth / 2, y: -canvasHeight / 2, cursor: 'nwse-resize' },
            { corner: 'ne', x: canvasWidth / 2, y: -canvasHeight / 2, cursor: 'nesw-resize' },
            { corner: 'sw', x: -canvasWidth / 2, y: canvasHeight / 2, cursor: 'nesw-resize' },
            { corner: 'se', x: canvasWidth / 2, y: canvasHeight / 2, cursor: 'nwse-resize' },
          ];

          return (
            <>
              {handles.map((handle) => (
                <rect
                  key={handle.corner}
                  x={handle.x - handleSize / 2}
                  y={handle.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="#0ea5e9"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  rx={1}
                  transform={`translate(${canvasPos.x}, ${canvasPos.y}) rotate(${displayRotation})`}
                  style={{ transformOrigin: '0 0', cursor: handle.cursor }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const worldPos = toWorldFromEvent(e);
                    if (!worldPos) return;
                    ctx.suppressClickRef.current = false;
                    handlers.startDrag({
                      mode: 'furniture-resize',
                      id: item.id,
                      corner: handle.corner,
                      start: worldPos,
                      baseSize: { width: item.width, depth: item.depth },
                      basePos: { x: item.x, y: item.y },
                    });
                    ctx.onDragStateChange?.(true);
                  }}
                />
              ))}
              {/* Rotation handle (at top center) */}
              <g transform={`translate(${canvasPos.x}, ${canvasPos.y}) rotate(${displayRotation})`}>
                <line
                  x1={0}
                  y1={-canvasHeight / 2}
                  x2={0}
                  y2={-canvasHeight / 2 - 20}
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={0}
                  cy={-canvasHeight / 2 - 20}
                  r={6}
                  fill="#a855f7"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const worldPos = toWorldFromEvent(e);
                    if (!worldPos) return;
                    ctx.suppressClickRef.current = false;
                    handlers.startDrag({
                      mode: 'furniture-rotate',
                      id: item.id,
                      start: worldPos,
                      centerPos: { x: item.x, y: item.y },
                      baseRotation: item.rotationDeg,
                    });
                    ctx.onDragStateChange?.(true);
                  }}
                />
              </g>
            </>
          );
        })()}
      </g>
    );
  });
}

// ---------------------------------------------------------------------------
// Drag handlers
// ---------------------------------------------------------------------------

function onDragMove(
  pt: Point,
  drag: FurnitureDrag,
  items: FurnitureInstance[],
  ctx: CanvasContext,
): FurnitureDrag {
  ctx.suppressClickRef.current = true;

  if (drag.mode === 'furniture-move') {
    const item = items.find((f) => f.id === drag.id);
    if (!item) return drag;

    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    const snapped = ctx.snapPoint({ x: drag.basePos.x + dx, y: drag.basePos.y + dy });
    const constrained = constrainFurnitureToPolygon(
      snapped,
      item.width,
      item.depth,
      item.rotationDeg,
      ctx.safePoints,
    );
    return { ...drag, currentPos: constrained };
  }

  if (drag.mode === 'furniture-resize') {
    const item = items.find((f) => f.id === drag.id);
    if (!item) return drag;

    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;

    let newWidth = drag.baseSize.width;
    let newDepth = drag.baseSize.depth;
    let newX = drag.basePos.x;
    let newY = drag.basePos.y;

    switch (drag.corner) {
      case 'se':
        newWidth = Math.max(100, drag.baseSize.width + dx);
        newDepth = Math.max(100, drag.baseSize.depth + dy);
        break;
      case 'sw':
        newWidth = Math.max(100, drag.baseSize.width - dx);
        newDepth = Math.max(100, drag.baseSize.depth + dy);
        newX = drag.basePos.x + dx / 2;
        break;
      case 'ne':
        newWidth = Math.max(100, drag.baseSize.width + dx);
        newDepth = Math.max(100, drag.baseSize.depth - dy);
        newY = drag.basePos.y + dy / 2;
        break;
      case 'nw':
        newWidth = Math.max(100, drag.baseSize.width - dx);
        newDepth = Math.max(100, drag.baseSize.depth - dy);
        newX = drag.basePos.x + dx / 2;
        newY = drag.basePos.y + dy / 2;
        break;
    }

    // Aspect ratio lock
    if (item.aspectRatioLocked && drag.baseSize.depth > 0) {
      const aspectRatio = drag.baseSize.width / drag.baseSize.depth;
      newDepth = newWidth / aspectRatio;
      if (drag.corner === 'sw' || drag.corner === 'nw') {
        const widthChange = newWidth - drag.baseSize.width;
        newX = drag.basePos.x - widthChange / 2;
      }
      if (drag.corner === 'ne' || drag.corner === 'nw') {
        const depthChange = newDepth - drag.baseSize.depth;
        newY = drag.basePos.y - depthChange / 2;
      }
    }

    const constrainedPos = constrainFurnitureToPolygon(
      { x: newX, y: newY },
      newWidth,
      newDepth,
      item.rotationDeg,
      ctx.safePoints,
    );

    return {
      ...drag,
      currentSize: { width: newWidth, depth: newDepth },
      currentPos: constrainedPos,
    };
  }

  if (drag.mode === 'furniture-rotate') {
    const dx = pt.x - drag.centerPos.x;
    const dy = pt.y - drag.centerPos.y;
    const angleRad = Math.atan2(dx, -dy);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    angleDeg = Math.round(angleDeg / 15) * 15;
    return { ...drag, currentRotation: angleDeg };
  }

  return drag;
}

function onDragEnd(
  drag: FurnitureDrag,
  items: FurnitureInstance[],
  onChange: (item: FurnitureInstance) => void,
  ctx: CanvasContext,
): void {
  const item = items.find((f) => f.id === drag.id);
  if (!item) return;

  if (drag.mode === 'furniture-move') {
    const finalPos = drag.currentPos || drag.basePos;
    onChange({ ...item, x: finalPos.x, y: finalPos.y });
  } else if (drag.mode === 'furniture-resize') {
    const finalSize = drag.currentSize || drag.baseSize;
    const finalPos = drag.currentPos || drag.basePos;
    onChange({
      ...item,
      width: finalSize.width,
      depth: finalSize.depth,
      x: finalPos.x,
      y: finalPos.y,
    });
  } else if (drag.mode === 'furniture-rotate') {
    const finalRotation =
      drag.currentRotation !== undefined ? drag.currentRotation : drag.baseRotation;
    const constrainedPos = constrainFurnitureToPolygon(
      { x: item.x, y: item.y },
      item.width,
      item.depth,
      finalRotation,
      ctx.safePoints,
    );
    onChange({
      ...item,
      rotationDeg: finalRotation,
      x: constrainedPos.x,
      y: constrainedPos.y,
    });
  }
}

// ---------------------------------------------------------------------------
// Exported renderer object
// ---------------------------------------------------------------------------

export const furnitureRenderer = {
  render: renderFurniture,
  onDragMove,
  onDragEnd,
};
