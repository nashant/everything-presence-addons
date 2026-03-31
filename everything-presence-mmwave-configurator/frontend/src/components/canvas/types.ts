/**
 * Shared types for the generic canvas item system.
 */

import type React from 'react';
import type { Point } from './geometry';
import type { FurnitureInstance, Zone, DevicePlacement } from '../../api/types';
import type { CanvasItemType } from '../RoomCanvas';

// ---------------------------------------------------------------------------
// Canvas context — shared utilities passed to renderers
// ---------------------------------------------------------------------------

export interface CanvasContext {
  /** Convert world coords → SVG canvas coords */
  toCanvasCoord: (p: Point) => { x: number; y: number };
  /** Convert SVG canvas coords → world coords */
  fromCanvasCoord: (x: number, y: number) => Point;
  /** Snap a world point to the active grid */
  snapPoint: (p: Point) => Point;
  /** Room polygon in world coords */
  safePoints: Point[];
  /** Current scale factor (px per mm, accounting for zoom) */
  scale: number;
  /** Notify parent that a drag started or ended */
  onDragStateChange?: (isDragging: boolean) => void;
  /** Unified item selection callback */
  onItemSelect?: (type: CanvasItemType, id: string) => void;
  /** Suppress click events after drag (prevent spurious clicks) */
  suppressClickRef: React.MutableRefObject<boolean>;
}

// ---------------------------------------------------------------------------
// Unified drag state — one discriminated union replaces all item drag states
// ---------------------------------------------------------------------------

export type ActiveDrag =
  | FurnitureMoveState
  | FurnitureResizeState
  | FurnitureRotateState
  | ZoneMoveState
  | ZoneVertexState
  | ZoneResizeState
  | DeviceDragState
  | null;

export interface FurnitureMoveState {
  mode: 'furniture-move';
  id: string;
  start: Point;
  basePos: Point;
  currentPos?: Point;
}

export interface FurnitureResizeState {
  mode: 'furniture-resize';
  id: string;
  corner: 'nw' | 'ne' | 'sw' | 'se';
  start: Point;
  baseSize: { width: number; depth: number };
  basePos: Point;
  currentSize?: { width: number; depth: number };
  currentPos?: Point;
}

export interface FurnitureRotateState {
  mode: 'furniture-rotate';
  id: string;
  start: Point;
  centerPos: Point;
  baseRotation: number;
  currentRotation?: number;
}

export interface ZoneMoveState {
  mode: 'zone-move';
  id: string;
  start: Point;
  basePos: Point;
  baseVertices?: Point[];
}

export interface ZoneVertexState {
  mode: 'zone-vertex';
  id: string;
  start: Point;
  basePos: Point;
  vertexIndex: number;
}

export interface DeviceDragState {
  mode: 'device-drag';
  sensorId?: string;
}

// ---------------------------------------------------------------------------
// Multi-sensor rendering types
// ---------------------------------------------------------------------------

export interface SensorRenderInfo {
  id: string;
  placement: DevicePlacement;
  fovDeg: number;
  maxRangeMeters: number;
  iconUrl?: string;
  color: string;
}

/** Rotating palette for distinguishing sensors on the canvas */
export const SENSOR_COLORS = [
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
] as const;

export interface ZoneResizeState {
  mode: 'zone-resize';
  id: string;
  corner: 'nw' | 'ne' | 'sw' | 'se';
  start: Point;
  basePos: Point;
  baseSize: { w: number; h: number };
}

// ---------------------------------------------------------------------------
// Item renderer interface
// ---------------------------------------------------------------------------

/**
 * Each canvas item type implements this interface.
 * RoomCanvas orchestrates rendering and drag dispatch via these methods.
 */
export interface ItemRenderer<TItem, TDrag extends { mode: string }> {
  /**
   * Render the items as SVG elements.
   * Called from the main SVG body — must return <g> or fragment.
   */
  render(
    items: TItem[],
    selectedId: string | null,
    activeDrag: TDrag | null,
    ctx: CanvasContext,
    handlers: ItemDragHandlers<TDrag>,
  ): React.ReactNode;

  /**
   * Handle drag movement. Returns the updated drag state.
   * Called from handleMouseMove when activeDrag matches this renderer's modes.
   */
  onDragMove(
    point: Point,
    drag: TDrag,
    items: TItem[],
    ctx: CanvasContext,
  ): TDrag;

  /**
   * Finalize the drag. Called from handleMouseUp.
   * Should call onChange with the final item state.
   */
  onDragEnd(
    drag: TDrag,
    items: TItem[],
    onChange: (item: TItem) => void,
    ctx: CanvasContext,
  ): void;
}

/** Handlers passed to renderers so they can initiate drags */
export interface ItemDragHandlers<TDrag> {
  startDrag: (drag: TDrag) => void;
}

// Concrete renderer type aliases for convenience
export type FurnitureDrag = FurnitureMoveState | FurnitureResizeState | FurnitureRotateState;
export type ZoneDrag = ZoneMoveState | ZoneVertexState | ZoneResizeState;

export type FurnitureRenderer = ItemRenderer<FurnitureInstance, FurnitureDrag>;
export type ZoneRenderer = ItemRenderer<Zone, ZoneDrag>;
