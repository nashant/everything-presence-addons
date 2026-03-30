/**
 * Zone item renderer — handles rendering, drag, resize, and vertex-drag
 * for detection zones on the room canvas.
 */

import React from 'react';
import type { Zone, ZoneRect, ZonePolygon } from '../../api/types';
import { isZoneRect, isZonePolygon } from '../../api/types';
import type { Point } from './geometry';
import type {
  CanvasContext,
  ZoneDrag,
  ZoneMoveState,
  ZoneVertexState,
  ZoneResizeState,
  ItemDragHandlers,
} from './types';

/** Convert a world-space length to canvas-space length */
const toCanvasLength = (v: number, rangeMm: number, canvasSize: number) =>
  (v / rangeMm) * canvasSize;

type ZoneCoverage = 'full' | 'partial' | 'none';

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderZones(
  zones: Zone[],
  selectedId: string | null,
  activeDrag: ZoneDrag | null,
  ctx: CanvasContext,
  handlers: ItemDragHandlers<ZoneDrag>,
  canvasSize: number,
  rangeMm: number,
  canChange: boolean,
  toWorldFromEvent: (e: React.MouseEvent) => Point | null,
  getZoneCoverage: (zone: Zone) => ZoneCoverage,
  onZoneChange?: (zone: Zone) => void,
): React.ReactNode {
  return zones.map((zone) => {
    const coverage = getZoneCoverage(zone);
    const baseColor =
      zone.type === 'exclusion'
        ? { fill: 'rgba(239,68,68,0.15)', stroke: '#ef4444' }
        : zone.type === 'entry'
          ? { fill: 'rgba(234,179,8,0.15)', stroke: '#eab308' }
          : { fill: 'rgba(59,130,246,0.15)', stroke: '#3b82f6' };
    const zoneColor =
      coverage === 'none'
        ? { fill: 'rgba(239,68,68,0.12)', stroke: '#ef4444' }
        : coverage === 'partial'
          ? { fill: 'rgba(245,158,11,0.12)', stroke: '#f59e0b' }
          : baseColor;
    const isSelected = selectedId === zone.id;
    const isDisabled = zone.enabled === false;

    if (isZonePolygon(zone)) {
      return renderPolygonZone(
        zone, isSelected, isDisabled, zoneColor, coverage, ctx, handlers,
        canChange, toWorldFromEvent, onZoneChange,
      );
    }

    return renderRectZone(
      zone as ZoneRect, isSelected, isDisabled, zoneColor, coverage, ctx, handlers,
      canvasSize, rangeMm, canChange, toWorldFromEvent,
    );
  });
}

function renderPolygonZone(
  zone: ZonePolygon,
  isSelected: boolean,
  isDisabled: boolean,
  zoneColor: { fill: string; stroke: string },
  coverage: ZoneCoverage,
  ctx: CanvasContext,
  handlers: ItemDragHandlers<ZoneDrag>,
  canChange: boolean,
  toWorldFromEvent: (e: React.MouseEvent) => Point | null,
  onZoneChange?: (zone: Zone) => void,
): React.ReactNode {
  const canvasVerts = zone.vertices.map((v) => ctx.toCanvasCoord(v));
  const polyPoints = canvasVerts.map((v) => `${v.x},${v.y}`).join(' ');
  const cx = canvasVerts.reduce((s, v) => s + v.x, 0) / (canvasVerts.length || 1);
  const cy = canvasVerts.reduce((s, v) => s + v.y, 0) / (canvasVerts.length || 1);

  return (
    <g key={zone.id} style={{ opacity: isDisabled ? 0.35 : 1 }}>
      <polygon
        points={polyPoints}
        fill={zoneColor.fill}
        stroke={isSelected ? '#06b6d4' : zoneColor.stroke}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? '6 3' : '4 2'}
        style={{ cursor: canChange ? 'grab' : 'pointer' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          ctx.onItemSelect?.('zone', zone.id);
          if (!canChange) return;
          const worldPos = toWorldFromEvent(e);
          if (!worldPos) return;
          handlers.startDrag({
            mode: 'zone-move',
            id: zone.id,
            start: worldPos,
            basePos: worldPos,
            baseVertices: [...zone.vertices],
          });
          ctx.onDragStateChange?.(true);
        }}
      />
      {renderZoneLabels(cx, cy, zone.label, coverage, isSelected, zoneColor)}
      {/* Vertex handles */}
      {isSelected &&
        canvasVerts.map((v, i) => (
          <circle
            key={`v${i}`}
            cx={v.x}
            cy={v.y}
            r={5}
            fill="#06b6d4"
            stroke="#0e7490"
            strokeWidth={1}
            style={{ cursor: canChange ? 'move' : 'pointer' }}
            onMouseDown={(e) => {
              if (!canChange) return;
              e.stopPropagation();
              const worldPos = toWorldFromEvent(e);
              if (!worldPos) return;
              handlers.startDrag({
                mode: 'zone-vertex',
                id: zone.id,
                start: worldPos,
                basePos: zone.vertices[i],
                vertexIndex: i,
              });
              ctx.onDragStateChange?.(true);
            }}
          />
        ))}
      {/* Midpoint handles for adding vertices */}
      {isSelected &&
        canvasVerts.map((v, i) => {
          const next = canvasVerts[(i + 1) % canvasVerts.length];
          const mx = (v.x + next.x) / 2;
          const my = (v.y + next.y) / 2;
          return (
            <circle
              key={`m${i}`}
              cx={mx}
              cy={my}
              r={3}
              fill="#06b6d480"
              stroke="#0e7490"
              strokeWidth={1}
              style={{ cursor: 'crosshair' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const worldMid = {
                  x: (zone.vertices[i].x + zone.vertices[(i + 1) % zone.vertices.length].x) / 2,
                  y: (zone.vertices[i].y + zone.vertices[(i + 1) % zone.vertices.length].y) / 2,
                };
                const newVerts = [...zone.vertices];
                newVerts.splice(i + 1, 0, worldMid);
                onZoneChange?.({ ...zone, vertices: newVerts });
              }}
            />
          );
        })}
    </g>
  );
}

function renderRectZone(
  zone: ZoneRect,
  isSelected: boolean,
  isDisabled: boolean,
  zoneColor: { fill: string; stroke: string },
  coverage: ZoneCoverage,
  ctx: CanvasContext,
  handlers: ItemDragHandlers<ZoneDrag>,
  canvasSize: number,
  rangeMm: number,
  canChange: boolean,
  toWorldFromEvent: (e: React.MouseEvent) => Point | null,
): React.ReactNode {
  const cPos = ctx.toCanvasCoord({ x: zone.x, y: zone.y });
  const cw = toCanvasLength(zone.width, rangeMm, canvasSize);
  const ch = toCanvasLength(zone.height, rangeMm, canvasSize);

  return (
    <g key={zone.id} style={{ opacity: isDisabled ? 0.35 : 1 }}>
      <rect
        x={cPos.x - cw / 2}
        y={cPos.y - ch / 2}
        width={cw}
        height={ch}
        fill={zoneColor.fill}
        stroke={isSelected ? '#06b6d4' : zoneColor.stroke}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? '6 3' : '4 2'}
        rx={2}
        style={{ cursor: canChange ? 'grab' : 'pointer' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          ctx.onItemSelect?.('zone', zone.id);
          if (!canChange) return;
          const worldPos = toWorldFromEvent(e);
          if (!worldPos) return;
          handlers.startDrag({
            mode: 'zone-move',
            id: zone.id,
            start: worldPos,
            basePos: { x: zone.x, y: zone.y },
          });
          ctx.onDragStateChange?.(true);
        }}
      />
      {renderZoneLabels(cPos.x, cPos.y, zone.label, coverage, isSelected, zoneColor)}
      {/* Resize handles */}
      {isSelected &&
        (['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
          const hx = corner.includes('e') ? cPos.x + cw / 2 : cPos.x - cw / 2;
          const hy = corner.includes('s') ? cPos.y + ch / 2 : cPos.y - ch / 2;
          return (
            <rect
              key={corner}
              x={hx - 4}
              y={hy - 4}
              width={8}
              height={8}
              fill="#06b6d4"
              stroke="#0e7490"
              strokeWidth={1}
              rx={1}
              style={{
                cursor: `${corner === 'nw' || corner === 'se' ? 'nwse' : 'nesw'}-resize`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const worldPos = toWorldFromEvent(e);
                if (!worldPos) return;
                handlers.startDrag({
                  mode: 'zone-resize',
                  id: zone.id,
                  corner,
                  start: worldPos,
                  basePos: { x: zone.x, y: zone.y },
                  baseSize: { w: zone.width, h: zone.height },
                });
                ctx.onDragStateChange?.(true);
              }}
            />
          );
        })}
    </g>
  );
}

function renderZoneLabels(
  cx: number,
  cy: number,
  label: string | undefined,
  coverage: ZoneCoverage,
  isSelected: boolean,
  zoneColor: { fill: string; stroke: string },
): React.ReactNode {
  return (
    <>
      {label && (
        <text
          x={cx}
          y={cy - (coverage !== 'full' ? 6 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={isSelected ? '#06b6d4' : zoneColor.stroke}
          fontSize={10}
          fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {label}
        </text>
      )}
      {coverage !== 'full' && (
        <text
          x={cx}
          y={cy + (label ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={coverage === 'none' ? '#ef4444' : '#f59e0b'}
          fontSize={8}
          fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {coverage === 'none' ? '⚠ Out of range' : '⚠ Partial coverage'}
        </text>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drag handlers
// ---------------------------------------------------------------------------

/**
 * Zone drag is special: zone-move and zone-vertex apply changes
 * directly via onZoneChange during drag (not just on end).
 * The drag state tracks the delta origin, and `onDragMove` returns
 * the updated state. The caller is responsible for calling onZoneChange.
 */
function onDragMove(
  pt: Point,
  drag: ZoneDrag,
  zones: Zone[],
  ctx: CanvasContext,
  onZoneChange?: (zone: Zone) => void,
): ZoneDrag {
  ctx.suppressClickRef.current = true;

  const zone = zones.find((z) => z.id === drag.id);
  if (!zone) return drag;

  if (drag.mode === 'zone-move') {
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;

    if (drag.baseVertices && isZonePolygon(zone)) {
      // Polygon body drag
      const newVerts = drag.baseVertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
      onZoneChange?.({ ...zone, vertices: newVerts });
    } else if (isZoneRect(zone)) {
      const snapped = ctx.snapPoint({ x: drag.basePos.x + dx, y: drag.basePos.y + dy });
      onZoneChange?.({ ...zone, x: snapped.x, y: snapped.y });
    }
    return drag; // state doesn't change for zone moves
  }

  if (drag.mode === 'zone-vertex' && isZonePolygon(zone)) {
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    const snapped = ctx.snapPoint({ x: drag.basePos.x + dx, y: drag.basePos.y + dy });
    const newVerts = [...zone.vertices];
    newVerts[drag.vertexIndex] = snapped;
    onZoneChange?.({ ...zone, vertices: newVerts });
    return drag;
  }

  if (drag.mode === 'zone-resize') {
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    let newW = drag.baseSize.w;
    let newH = drag.baseSize.h;
    let newX = drag.basePos.x;
    let newY = drag.basePos.y;

    switch (drag.corner) {
      case 'se': newW += dx; newH += dy; newX += dx / 2; newY += dy / 2; break;
      case 'sw': newW -= dx; newH += dy; newX -= dx / 2; newY += dy / 2; break;
      case 'ne': newW += dx; newH -= dy; newX += dx / 2; newY -= dy / 2; break;
      case 'nw': newW -= dx; newH -= dy; newX -= dx / 2; newY -= dy / 2; break;
    }
    newW = Math.max(100, newW);
    newH = Math.max(100, newH);
    onZoneChange?.({ ...(zone as ZoneRect), x: newX, y: newY, width: newW, height: newH });
    return drag;
  }

  return drag;
}

function onDragEnd(
  _drag: ZoneDrag,
  _zones: Zone[],
  _onChange: (zone: Zone) => void,
  _ctx: CanvasContext,
): void {
  // Zone drags apply changes during drag, nothing to finalize
}

// ---------------------------------------------------------------------------
// Exported renderer object
// ---------------------------------------------------------------------------

export const zoneRenderer = {
  render: renderZones,
  onDragMove,
  onDragEnd,
};
