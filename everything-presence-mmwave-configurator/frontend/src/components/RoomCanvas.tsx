import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FurnitureInstance, Door, Zone, ZoneRect, isZonePolygon } from '../api/types';
import { FloorMaterialDefs, getFloorFill } from './FloorMaterials';
import { useThemeContext } from '../contexts/ThemeContext';
import { furnitureRenderer } from './canvas/FurnitureItemRenderer';
import { zoneRenderer } from './canvas/ZoneItemRenderer';
import { renderDeviceNonInteractive, renderDeviceInteractive } from './canvas/DeviceItemRenderer';
import { renderDoors } from './canvas/DoorItemRenderer';
import type { ActiveDrag, CanvasContext, FurnitureDrag, ZoneDrag, SensorRenderInfo } from './canvas/types';


export interface Point {
  x: number;
  y: number;
}

export interface DevicePlacement {
  x: number;
  y: number;
  rotationDeg?: number;
}

export type CanvasItemType = 'device' | 'zone' | 'door' | 'furniture';

interface RoomCanvasProps {
  points: Point[];
  onChange: (points: Point[]) => void;
  onAddPoint?: (point: Point) => void;
  onCanvasClick?: (point: Point) => void;
  onCanvasMove?: (point: Point) => void;
  onCanvasRelease?: () => void;
  rangeMm?: number;
  gridSpacingMm?: number;
  height?: number | string;
  snapGridMm?: number;
  displayUnits?: 'metric' | 'imperial';
  zoom?: number;
  devicePlacement?: DevicePlacement;
  onDeviceChange?: (placement: DevicePlacement) => void;
  onItemSelect?: (type: CanvasItemType, id: string) => void;
  fieldOfViewDeg?: number;
  maxRangeMeters?: number;
  deviceIconUrl?: string;
  clipRadarToWalls?: boolean;
  showRadar?: boolean;
  panOffsetMm?: { x: number; y: number };
  onPanChange?: (offset: { x: number; y: number }) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  previewFrom?: Point | null;
  previewTo?: Point | null;
  onSegmentHover?: (index: number | null) => void;
  onSegmentSelect?: (index: number | null) => void;
  hoveredSegment?: number | null;
  selectedSegment?: number | null;
  onSegmentDragStart?: (index: number, start: Point) => void;
  onEndpointDragStart?: (segment: number, endpoint: 'start' | 'end', start: Point) => void;
  onSegmentInsert?: (segmentIndex: number, point: Point) => void;
  renderOverlay?: (ctx: {
    toCanvas: (p: Point) => { x: number; y: number };
    fromCanvas: (x: number, y: number) => Point;
    toWorldFromEvent: (e: React.MouseEvent<SVGSVGElement | SVGElement, MouseEvent>) => Point | null;
    svgRef: React.RefObject<SVGSVGElement>;
    rangeMm: number;
    roomShellPoints: Point[];
    devicePlacement: DevicePlacement | undefined;
    fieldOfViewDeg: number;
    /** Device element to render (when deviceInteractive is false) - render at desired z-order */
    deviceElement?: React.ReactNode;
  }) => React.ReactNode;
  lockShell?: boolean;
  furniture?: FurnitureInstance[];
  selectedFurnitureId?: string | null;
  onFurnitureChange?: (furniture: FurnitureInstance) => void;
  doors?: Door[];
  selectedDoorId?: string | null;
  onDoorChange?: (door: Door) => void;
  isDoorPlacementMode?: boolean;
  onWallSegmentClick?: (segmentIndex: number, positionOnSegment: number) => void;
  onDoorDragStart?: (doorId: string, x: number, y: number) => void;
  onDoorDragMove?: (x: number, y: number) => void;
  onDoorDragEnd?: () => void;
  zones?: Zone[];
  selectedZoneId?: string | null;
  onZoneChange?: (zone: Zone) => void;
  onZoneVertexDrag?: (zoneId: string, vertexIndex: number, pos: { x: number; y: number }) => void;
  showZones?: boolean;
  roomShellFillMode?: 'overlay' | 'material';
  floorMaterial?: string;
  // Multi-sensor support
  sensorPlacements?: SensorRenderInfo[];
  selectedSensorId?: string;
  onSensorChange?: (sensorId: string, placement: DevicePlacement) => void;
  onSensorSelect?: (sensorId: string) => void;
  // Visibility toggles
  showWalls?: boolean;
  showFurniture?: boolean;
  showDoors?: boolean;
  showDevice?: boolean;
  // When false, device icon won't capture mouse events (allows interacting with zones behind it)
  deviceInteractive?: boolean;
}

const CANVAS_SIZE = 700;
const HALF = CANVAS_SIZE / 2;
const toCanvas = (v: number, range: number) => (v / range) * CANVAS_SIZE;
const fromCanvas = (v: number, range: number) => (v / CANVAS_SIZE) * range;

const getSvgPoint = (
  e: React.MouseEvent<SVGSVGElement, MouseEvent>,
  svgEl: SVGSVGElement | null,
): { x: number; y: number } | null => {
  if (!svgEl) return null;
  const pt = svgEl.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
};

// Point-in-polygon test using ray casting algorithm
const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  if (polygon.length < 3) return true; // No polygon yet, allow placement anywhere

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Find the closest point on a line segment to a given point
const closestPointOnSegment = (point: Point, segStart: Point, segEnd: Point): Point => {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return segStart; // Segment is a point

  // Project point onto the line, clamping to segment bounds
  const t = Math.max(0, Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq));

  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };
};

// Get the four corners of a rotated rectangle (furniture)
// Find the closest point on the polygon boundary
const findClosestPointOnPolygon = (point: Point, polygon: Point[]): Point => {
  let closestPoint = polygon[0];
  let minDistSq = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const segStart = polygon[i];
    const segEnd = polygon[(i + 1) % polygon.length];
    const closest = closestPointOnSegment(point, segStart, segEnd);

    const distSq = (closest.x - point.x) ** 2 + (closest.y - point.y) ** 2;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestPoint = closest;
    }
  }

  return closestPoint;
};

// Simple point constraint (for backwards compatibility and cases without furniture dimensions)
const constrainPointToPolygon = (point: Point, polygon: Point[]): Point => {
  if (polygon.length < 3) return point;

  if (isPointInPolygon(point, polygon)) {
    return point;
  }

  const closest = findClosestPointOnPolygon(point, polygon);

  // Move slightly inside
  const centerX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const centerY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
  const toCenter = { x: centerX - closest.x, y: centerY - closest.y };
  const len = Math.sqrt(toCenter.x ** 2 + toCenter.y ** 2);

  if (len > 0) {
    return {
      x: closest.x + (toCenter.x / len) * 10,
      y: closest.y + (toCenter.y / len) * 10,
    };
  }

  return closest;
};



export const RoomCanvas: React.FC<RoomCanvasProps> = ({
  points,
  onChange,
  onAddPoint,
  onCanvasClick,
  onCanvasMove,
  onCanvasRelease,
  rangeMm = 6000,
  gridSpacingMm = 1000,
  height = 520,
  snapGridMm = 0,
  displayUnits = 'metric',
  zoom = 1,
  devicePlacement,
  onDeviceChange,
  onItemSelect,
  fieldOfViewDeg = 120,
  maxRangeMeters = 6,
  deviceIconUrl,
  clipRadarToWalls = false,
  showRadar = true,
  panOffsetMm = { x: 0, y: 0 },
  onPanChange,
  onDragStateChange,
  previewFrom = null,
  previewTo = null,
  onSegmentHover,
  onSegmentSelect,
  hoveredSegment,
  selectedSegment,
  onSegmentDragStart,
  onEndpointDragStart,
  onSegmentInsert,
  renderOverlay,
  lockShell = false,
  furniture = [],
  selectedFurnitureId,
  onFurnitureChange,
  doors = [],
  selectedDoorId,
  // onDoorChange — not used by RoomCanvas; door mutations managed by parent
  isDoorPlacementMode,
  onWallSegmentClick,
  onDoorDragStart,
  // onDoorDragMove/onDoorDragEnd — not used by RoomCanvas; parent handles via onCanvasMove/onCanvasRelease
  zones = [],
  selectedZoneId,
  onZoneChange,
  showZones = true,
  roomShellFillMode = 'overlay',
  floorMaterial = 'none',
  sensorPlacements,
  selectedSensorId,  // Active sensor highlight
  onSensorChange,
  onSensorSelect,
  showWalls = true,
  showFurniture = true,
  showDoors = true,
  showDevice = true,
  deviceInteractive = true,
}) => {
  const safePoints = Array.isArray(points) ? points : [];
  const safePlacement: DevicePlacement = {
    x: Number.isFinite(devicePlacement?.x) ? (devicePlacement as DevicePlacement).x : 0,
    y: Number.isFinite(devicePlacement?.y) ? (devicePlacement as DevicePlacement).y : 0,
    rotationDeg: Number.isFinite(devicePlacement?.rotationDeg) ? devicePlacement?.rotationDeg : 0,
  };

  // Theme-aware colors for canvas
  const { isDark } = useThemeContext();
  const canvasColors = useMemo(() => ({
    background: isDark ? '#0f172a' : '#f8fafc',
    gridAxis: isDark ? '#334155' : '#94a3b8',
    gridLine: isDark ? '#1e293b' : '#cbd5e1',
    outsideRoom: isDark ? '#0f172acc' : '#e2e8f0cc',
  }), [isDark]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [panDrag, setPanDrag] = useState<{ start: Point; base: { x: number; y: number } } | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const suppressClickRef = useRef<boolean>(false);

  const effectiveRangeMm = Number.isFinite(rangeMm) && rangeMm > 0 ? rangeMm : 6000;
  const effectiveGrid = Number.isFinite(gridSpacingMm) && gridSpacingMm > 0 ? gridSpacingMm : 1000;
  const effectiveFov = Number.isFinite(fieldOfViewDeg) ? fieldOfViewDeg : 120;
  const effectiveMaxRange = Number.isFinite(maxRangeMeters) ? maxRangeMeters : 6;
  const effectiveSnap = Number.isFinite(snapGridMm) && snapGridMm > 0 ? snapGridMm : 0;

  // Helper: check if a world-coordinate point is within the sensor's detection cone
  const isPointInSensorRange = useCallback((pt: Point): boolean => {
    // Multi-sensor mode: check if point is in range of ANY sensor
    if (sensorPlacements && sensorPlacements.length > 0) {
      return sensorPlacements.some((sensor) => {
        if (!sensor.placement) return false;
        const dx = pt.x - sensor.placement.x;
        const dy = pt.y - sensor.placement.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rangeLimit = sensor.maxRangeMeters * 1000;
        if (dist > rangeLimit) return false;
        const rotationRad = (((sensor.placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
        const halfFov = (sensor.fovDeg * Math.PI) / 360;
        const ptAngle = Math.atan2(dy, dx);
        let diff = ptAngle - rotationRad;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return Math.abs(diff) <= halfFov;
      });
    }
    // Single-device fallback
    if (!devicePlacement) return true; // no sensor placed → assume in range
    const dx = pt.x - safePlacement.x;
    const dy = pt.y - safePlacement.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rangeLimit = effectiveMaxRange * 1000; // meters → mm
    if (dist > rangeLimit) return false;
    // Check field of view angle
    const rotationRad = (((safePlacement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
    const halfFov = (effectiveFov * Math.PI) / 360;
    const ptAngle = Math.atan2(dy, dx);
    // Normalize angle difference to [-PI, PI]
    let diff = ptAngle - rotationRad;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= halfFov;
  }, [devicePlacement, safePlacement.x, safePlacement.y, safePlacement.rotationDeg, effectiveMaxRange, effectiveFov, sensorPlacements]);

  // Helper: compute zone coverage status ('full' | 'partial' | 'none')
  const getZoneCoverage = useCallback((zone: Zone): 'full' | 'partial' | 'none' => {
    if (!devicePlacement) return 'full';
    let verts: Point[];
    if (isZonePolygon(zone)) {
      verts = zone.vertices;
    } else {
      const r = zone as ZoneRect;
      const hw = r.width / 2, hh = r.height / 2;
      verts = [
        { x: r.x - hw, y: r.y - hh },
        { x: r.x + hw, y: r.y - hh },
        { x: r.x + hw, y: r.y + hh },
        { x: r.x - hw, y: r.y + hh },
      ];
    }
    const inRange = verts.filter(isPointInSensorRange);
    if (inRange.length === verts.length) return 'full';
    if (inRange.length === 0) return 'none';
    return 'partial';
  }, [devicePlacement, isPointInSensorRange]);

  const effectiveZoom = Math.min(5, Math.max(0.1, Number.isFinite(zoom) ? zoom : 1));
  const viewSize = CANVAS_SIZE / effectiveZoom;
  const viewMin = (CANVAS_SIZE - viewSize) / 2;

  const toCanvasCoord = (p: Point) => ({
    x: HALF + toCanvas(p.x - panOffsetMm.x, effectiveRangeMm),
    y: HALF + toCanvas(p.y - panOffsetMm.y, effectiveRangeMm),
  });
  const fromCanvasCoord = (cx: number, cy: number) => ({
    x: fromCanvas(cx, effectiveRangeMm) + panOffsetMm.x,
    y: fromCanvas(cy, effectiveRangeMm) + panOffsetMm.y,
  });
  const fromCanvasWithOffset = (cx: number, cy: number, offset: { x: number; y: number }) => ({
    x: fromCanvas(cx, effectiveRangeMm) + offset.x,
    y: fromCanvas(cy, effectiveRangeMm) + offset.y,
  });

  const toWorldFromEvent = (e: React.MouseEvent<SVGSVGElement | SVGElement, MouseEvent>) => {
    const svgPoint = getSvgPoint(e as any, svgRef.current);
    if (!svgPoint) return null;
    const cx = svgPoint.x - HALF;
    const cy = svgPoint.y - HALF;
    return fromCanvasCoord(cx, cy);
  };

  const snapPoint = (pt: Point) => {
    if (!effectiveSnap) return pt;
    const step = effectiveSnap;
    return {
      x: Math.round(pt.x / step) * step,
      y: Math.round(pt.y / step) * step,
    };
  };

  const formatLength = (mm: number) => {
    if (displayUnits === 'imperial') {
      const ft = mm / 304.8;
      return `${ft.toFixed(2)} ft`;
    }
    return `${(mm / 1000).toFixed(2)} m`;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (e.button !== 0) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const svgPoint = getSvgPoint(e, svgRef.current);
    if (!svgPoint) return;
    const cx = svgPoint.x - HALF;
    const cy = svgPoint.y - HALF;
    const point = fromCanvasCoord(cx, cy);
    onAddPoint?.(point);
    onCanvasClick?.(point);
  };

  const handleDragStart = (idx: number) => (e: React.MouseEvent<SVGCircleElement, MouseEvent>) => {
    if (activeDrag?.mode === 'device-drag') return; // Don't start wall drag while device is being dragged
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    suppressClickRef.current = true;
    setDragIdx(idx);
    onDragStateChange?.(true);
  };
  const canvasContext: CanvasContext = useMemo(() => ({
    toCanvasCoord,
    fromCanvasCoord,
    snapPoint,
    safePoints,
    scale: CANVAS_SIZE / effectiveRangeMm,
    onDragStateChange,
    onItemSelect,
    suppressClickRef,
  }), [toCanvasCoord, fromCanvasCoord, snapPoint, safePoints, effectiveRangeMm, onDragStateChange, onItemSelect]);

  const handleMouseUp = () => {
    // Finalize furniture/zone drag via renderers
    if (activeDrag) {
      const mode = activeDrag.mode;
      if (mode.startsWith('furniture-') && onFurnitureChange) {
        furnitureRenderer.onDragEnd(activeDrag as FurnitureDrag, furniture, onFurnitureChange, canvasContext);
      }
      // Zone drags apply changes during move, nothing to finalize
      // Device drag has no finalization — position is applied live during move
      setActiveDrag(null);
    }

    setDragIdx(null);
    setPanDrag(null);
    onDragStateChange?.(false);
    onCanvasRelease?.();
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const svgPoint = getSvgPoint(e, svgRef.current);
        if (!svgPoint) return;
        const cx = svgPoint.x - HALF;
        const cy = svgPoint.y - HALF;
        const pt = fromCanvasCoord(cx, cy);
        onCanvasMove?.(pt);

    if (panDrag && onPanChange) {
      // use the base offset captured at drag start to avoid feedback/judder
      const world = fromCanvasWithOffset(cx, cy, panDrag.base);
      const dx = world.x - panDrag.start.x;
      const dy = world.y - panDrag.start.y;
      onPanChange({ x: panDrag.base.x - dx, y: panDrag.base.y - dy });
      return;
    }

    // Handle furniture/zone/device dragging via renderers
    if (activeDrag) {
      const mode = activeDrag.mode;
      if (mode.startsWith('furniture-')) {
        const updated = furnitureRenderer.onDragMove(pt, activeDrag as FurnitureDrag, furniture, canvasContext);
        setActiveDrag(updated);
        return;
      }
      if (mode.startsWith('zone-')) {
        zoneRenderer.onDragMove(pt, activeDrag as ZoneDrag, zones, canvasContext, onZoneChange);
        return;
      }
      if (mode === 'device-drag') {
        const snapped = snapPoint(pt);
        const clamped = safePoints.length >= 3
          ? constrainPointToPolygon(snapped, safePoints)
          : snapped;
        // Multi-sensor drag: find and update the specific sensor
        if (activeDrag.sensorId && sensorPlacements && onSensorChange) {
          const sensor = sensorPlacements.find((s) => s.id === activeDrag.sensorId);
          if (sensor) {
            onSensorChange(activeDrag.sensorId, {
              ...sensor.placement,
              ...clamped,
            });
          }
          return;
        }
        // Single-device fallback
        if (onDeviceChange) {
          onDeviceChange({
            ...safePlacement,
            ...clamped,
          });
        }
        return;
      }
    }

    if (dragIdx === null) return;
    if (dragIdx !== null) {
      const next = [...safePoints];
      next[dragIdx] = snapPoint(pt);
      onChange(next);
    }
  };

  return (
    <div className="w-full h-full">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`${viewMin} ${viewMin} ${viewSize} ${viewSize}`}
        height={height}
        className="bg-slate-900"
        onClick={handleSvgClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseOver={(e) => {
        if (!safePoints.length || lockShell) return;
        const svgPoint = getSvgPoint(e as any, svgRef.current);
        if (!svgPoint) return;
          const cx = svgPoint.x - HALF;
          const cy = svgPoint.y - HALF;
          const world = { x: fromCanvas(cx, effectiveRangeMm), y: fromCanvas(cy, effectiveRangeMm) };
          let best: number | null = null;
          let bestDist = 250; // mm
          safePoints.forEach((p, idx) => {
            const next = safePoints[(idx + 1) % safePoints.length];
            const dx = next.x - p.x;
            const dy = next.y - p.y;
            const len2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((world.x - p.x) * dx + (world.y - p.y) * dy) / len2));
            const projX = p.x + t * dx;
            const projY = p.y + t * dy;
            const dist = Math.hypot(world.x - projX, world.y - projY);
            if (dist < bestDist) {
              bestDist = dist;
              best = idx;
            }
          });
          onSegmentHover?.(best);
        }}
        onMouseOut={() => onSegmentHover?.(null)}
        onMouseDown={(e) => {
          if ((e as any).button === 2 || (e as any).button === 1) {
            // right-drag or middle-drag to pan
            const svgPoint = getSvgPoint(e as any, svgRef.current);
            if (!svgPoint || !onPanChange) return;
            e.preventDefault();
            const world = fromCanvasWithOffset(svgPoint.x - HALF, svgPoint.y - HALF, panOffsetMm);
            setPanDrag({ start: world, base: panOffsetMm });
            onDragStateChange?.(true);
            suppressClickRef.current = true;
            return;
          }
          if ((e as any).button !== 0 || !safePoints.length) return;
          if (lockShell) return;
          const svgPoint = getSvgPoint(e as any, svgRef.current);
          if (!svgPoint) return;
          const cx = svgPoint.x - HALF;
          const cy = svgPoint.y - HALF;
          const world = fromCanvasCoord(cx, cy);
          let best: number | null = null;
          let bestDist = 250;
          let bestProj: Point | null = null;
          safePoints.forEach((p, idx) => {
            const next = safePoints[(idx + 1) % safePoints.length];
            const dx = next.x - p.x;
            const dy = next.y - p.y;
            const len2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((world.x - p.x) * dx + (world.y - p.y) * dy) / len2));
            const projX = p.x + t * dx;
            const projY = p.y + t * dy;
            const dist = Math.hypot(world.x - projX, world.y - projY);
            if (dist < bestDist) {
              bestDist = dist;
              best = idx;
              bestProj = { x: projX, y: projY };
            }
          });
          if (!isDoorPlacementMode && (e as any).shiftKey && onSegmentInsert && best !== null && bestProj) {
            e.preventDefault();
            e.stopPropagation();
            onSegmentInsert(best, bestProj);
            suppressClickRef.current = true;
            return;
          }
          onSegmentSelect?.(best);
          if (best !== null && onSegmentDragStart) {
            onSegmentDragStart(best, world);
            suppressClickRef.current = true;
            onDragStateChange?.(true);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <FloorMaterialDefs />
        </defs>
        <rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE} fill={canvasColors.background} />
        {(() => {
          const lines = [];
          // Adjust grid span based on zoom level to ensure grid lines are visible when zooming out
          // When zooming out (effectiveZoom < 1), we need MORE grid coverage, not less
          // Multiply by 4 to ensure adequate coverage even at very low zoom levels
          const span = (effectiveRangeMm * 4) / Math.min(effectiveZoom, 1);
          for (let mm = -span; mm <= span; mm += effectiveGrid) {
            const posX = HALF + toCanvas(mm - panOffsetMm.x, effectiveRangeMm);
            const posY = HALF + toCanvas(mm - panOffsetMm.y, effectiveRangeMm);
            const isAxis = mm === 0;
            // Extend grid lines beyond canvas to fill viewport when zoomed out
            // Scale extension based on zoom level - more extension when zoomed out
            const lineExtend = CANVAS_SIZE * 10 / Math.min(effectiveZoom, 1);
            lines.push(
              <line
                key={`v-${mm}`}
                x1={posX}
                y1={-lineExtend}
                x2={posX}
                y2={CANVAS_SIZE + lineExtend}
                stroke={isAxis ? canvasColors.gridAxis : canvasColors.gridLine}
                strokeWidth={isAxis ? 2 : 1}
                opacity={isAxis ? 0.8 : 0.4}
                vectorEffect="non-scaling-stroke"
              />,
            );
            lines.push(
              <line
                key={`h-${mm}`}
                x1={-lineExtend}
                y1={posY}
                x2={CANVAS_SIZE + lineExtend}
                y2={posY}
                stroke={isAxis ? canvasColors.gridAxis : canvasColors.gridLine}
                strokeWidth={isAxis ? 2 : 1}
                opacity={isAxis ? 0.8 : 0.4}
                vectorEffect="non-scaling-stroke"
              />,
            );
          }
          return lines;
        })()}
        {safePoints.length > 0 && (
          <>
            {showWalls && (() => {
              const path = safePoints
                .map(
                  (p, idx) =>
                    `${idx === 0 ? 'M' : 'L'} ${toCanvasCoord(p).x} ${toCanvasCoord(p).y}`,
                )
                .join(' ');
              const closedPath = `${path} Z`;
              const { fill, opacity } = getFloorFill(roomShellFillMode, floorMaterial);
              return <path d={closedPath} fill={fill} fillOpacity={opacity} stroke="#22d3ee" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
            })()}
            {!lockShell &&
              safePoints.map((p, idx) => {
                const { x: cx, y: cy } = toCanvasCoord(p);
                return (
                  <g key={`pt-${idx}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill="#0ea5e9"
                      stroke="#e0f2fe"
                      strokeWidth={2}
                      onMouseDown={handleDragStart(idx)}
                    />
                  </g>
                );
              })}
            {!lockShell &&
              safePoints.map((p, idx) => {
                const next = safePoints[(idx + 1) % safePoints.length];
                const { x: x1, y: y1 } = toCanvasCoord(p);
                const { x: x2, y: y2 } = toCanvasCoord(next);
                const isHovered = hoveredSegment === idx;
                const isSelected = selectedSegment === idx;
                if (!isHovered && !isSelected) return null;
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const lenLabel = formatLength(Math.hypot(next.x - p.x, next.y - p.y));
                return (
                  <g key={`seg-${idx}`}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSelected ? '#f97316' : '#a855f7'}
                      strokeWidth={isSelected ? 4 : 3}
                      strokeOpacity={0.7}
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect
                      x={midX - 24}
                      y={midY - 16}
                      width={48}
                      height={16}
                      rx={4}
                      fill={canvasColors.outsideRoom}
                      stroke={isDark ? '#94a3b877' : '#64748b77'}
                    />
                    <text x={midX} y={midY - 4} fill={isDark ? '#e2e8f0' : '#1e293b'} fontSize="11" textAnchor="middle">
                      {lenLabel}
                    </text>
                  </g>
                );
              })}
            {/* Clickable wall segments for door placement */}
            {isDoorPlacementMode &&
              safePoints.map((p, idx) => {
                const next = safePoints[(idx + 1) % safePoints.length];
                const { x: x1, y: y1 } = toCanvasCoord(p);
                const { x: x2, y: y2 } = toCanvasCoord(next);
                return (
                  <line
                    key={`door-placement-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: 'crosshair', pointerEvents: 'stroke' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const svgPoint = getSvgPoint(e as any, svgRef.current);
                      if (!svgPoint) return;
                      const cx = svgPoint.x - HALF;
                      const cy = svgPoint.y - HALF;
                      const clickWorld = fromCanvasCoord(cx, cy);

                      // Calculate position along segment (0-1)
                      const dx = next.x - p.x;
                      const dy = next.y - p.y;
                      const segmentLength = Math.hypot(dx, dy);
                      if (segmentLength < 1) return;

                      const toClickX = clickWorld.x - p.x;
                      const toClickY = clickWorld.y - p.y;
                      const projection = (toClickX * dx + toClickY * dy) / (segmentLength * segmentLength);
                      const positionOnSegment = Math.max(0, Math.min(1, projection));

                      onWallSegmentClick?.(idx, positionOnSegment);
                    }}
                  />
                );
              })}
            {!lockShell &&
              selectedSegment !== null &&
              (() => {
                const p = safePoints[selectedSegment];
                const next = safePoints[(selectedSegment + 1) % safePoints.length];
                if (!p || !next) return null;
                const { x: x1, y: y1 } = toCanvasCoord(p);
                const { x: x2, y: y2 } = toCanvasCoord(next);
                return (
                  <>
                    <rect
                      x={x1 - 6}
                      y={y1 - 6}
                      width={12}
                      height={12}
                      fill="#0ea5e9"
                      stroke="#e0f2fe"
                      strokeWidth={2}
                      rx={2}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.cancelable) e.preventDefault();
                        if (onEndpointDragStart) {
                          const world = toWorldFromEvent(e as any) ?? { x: p.x, y: p.y };
                          onEndpointDragStart(selectedSegment, 'start', world);
                          suppressClickRef.current = true;
                          onDragStateChange?.(true);
                        }
                      }}
                    />
                    <rect
                      x={x2 - 6}
                      y={y2 - 6}
                      width={12}
                      height={12}
                      fill="#0ea5e9"
                      stroke="#e0f2fe"
                      strokeWidth={2}
                      rx={2}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.cancelable) e.preventDefault();
                        if (onEndpointDragStart) {
                          const world = toWorldFromEvent(e as any) ?? { x: next.x, y: next.y };
                          onEndpointDragStart(selectedSegment, 'end', world);
                          suppressClickRef.current = true;
                          onDragStateChange?.(true);
                        }
                      }}
                    />
                  </>
                );
              })()}
          </>
        )}
        {previewFrom && (
          (() => {
            const { x: fx, y: fy } = toCanvasCoord(previewFrom);
            if (!previewTo) {
              return <circle cx={fx} cy={fy} r={5} fill="#a855f7" stroke="#c084fc" strokeWidth={2} />;
            }
            const { x: tx, y: ty } = toCanvasCoord(previewTo);
            const midX = (fx + tx) / 2;
            const midY = (fy + ty) / 2;
            const lenMm = Math.hypot(previewTo.x - previewFrom.x, previewTo.y - previewFrom.y);
            const lenLabel = formatLength(lenMm);
            return (
              <g>
                <line
                  x1={fx}
                  y1={fy}
                  x2={tx}
                  y2={ty}
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={fx} cy={fy} r={4} fill="#a855f7" />
                <circle cx={tx} cy={ty} r={4} fill="#a855f7" />
                <text x={midX + 6} y={midY - 6} fill="#c084fc" fontSize="11" pointerEvents="none">
                  {lenLabel}
                </text>
              </g>
            );
          })()
        )}

        {/* Render doors (via renderer) */}
        {showDoors && renderDoors({
          doors,
          selectedDoorId: selectedDoorId ?? null,
          wallPoints: safePoints,
          toCanvasCoord,
          toCanvasLength: (v: number) => toCanvas(v, effectiveRangeMm),
          onItemSelect,
          onDoorDragStart,
          onDragStateChange,
          suppressClickRef,
        })}

        {/* Render furniture (via renderer) */}
        {showFurniture && furnitureRenderer.render(
          furniture,
          selectedFurnitureId ?? null,
          activeDrag?.mode.startsWith('furniture-') ? (activeDrag as FurnitureDrag) : null,
          canvasContext,
          { startDrag: (drag) => { setActiveDrag(drag); } },
          CANVAS_SIZE,
          effectiveRangeMm,
          !!onFurnitureChange,
          toWorldFromEvent,
        )}


        {/* Render zones (via renderer) */}
        {showZones && zoneRenderer.render(
          zones,
          selectedZoneId ?? null,
          activeDrag?.mode.startsWith('zone-') ? (activeDrag as ZoneDrag) : null,
          canvasContext,
          { startDrag: (drag) => { setActiveDrag(drag); } },
          CANVAS_SIZE,
          effectiveRangeMm,
          !!onZoneChange,
          toWorldFromEvent,
          getZoneCoverage,
          onZoneChange,
        )}

        {/* Build device element for non-interactive mode (Zone Editor) - passed to renderOverlay for z-order control */}
        {renderOverlay?.({
          toCanvas: toCanvasCoord,
          fromCanvas: fromCanvasCoord,
          toWorldFromEvent,
          svgRef,
          rangeMm: effectiveRangeMm,
          roomShellPoints: safePoints,
          devicePlacement: safePlacement,
          fieldOfViewDeg: effectiveFov,
          deviceElement: (!deviceInteractive && showDevice)
            ? (sensorPlacements && sensorPlacements.length > 0
              ? <>
                  {sensorPlacements.map((sensor) => (
                    <React.Fragment key={sensor.id}>
                      {renderDeviceNonInteractive({
                        placement: sensor.placement,
                        fovDeg: sensor.fovDeg,
                        maxRangeMeters: sensor.maxRangeMeters,
                        wallPoints: safePoints,
                        clipToWalls: !!clipRadarToWalls,
                        showRadar: !!showRadar,
                        iconUrl: sensor.iconUrl,
                        color: sensor.color,
                        zoom: effectiveZoom,
                        toCanvasCoord,
                      })}
                    </React.Fragment>
                  ))}
                </>
              : (devicePlacement && safePlacement
                ? renderDeviceNonInteractive({
                    placement: safePlacement,
                    fovDeg: effectiveFov,
                    maxRangeMeters: effectiveMaxRange,
                    wallPoints: safePoints,
                    clipToWalls: !!clipRadarToWalls,
                    showRadar: !!showRadar,
                    iconUrl: deviceIconUrl,
                    zoom: effectiveZoom,
                    toCanvasCoord,
                  })
                : undefined
              )
            )
            : undefined,
        })}

        {/* Device rendering - when interactive (Room Builder), render AFTER overlay so device can be dragged */}
        {deviceInteractive && showDevice && sensorPlacements && sensorPlacements.length > 0 &&
          sensorPlacements.map((sensor) => (
            <React.Fragment key={sensor.id}>
              {renderDeviceInteractive({
                placement: sensor.placement,
                fovDeg: sensor.fovDeg,
                maxRangeMeters: sensor.maxRangeMeters,
                wallPoints: safePoints,
                clipToWalls: !!clipRadarToWalls,
                showRadar: !!showRadar,
                iconUrl: sensor.iconUrl,
                color: sensor.color,
                zoom: effectiveZoom,
                toCanvasCoord,
                canDrag: !!onSensorChange,
                sensorId: sensor.id,
                selected: sensor.id === selectedSensorId,
                onDragStart: () => {
                  setActiveDrag({ mode: 'device-drag', sensorId: sensor.id });
                  onDragStateChange?.(true);
                },
                onSelect: () => onSensorSelect?.(sensor.id),
              })}
            </React.Fragment>
          ))
        }
        {/* Single-device fallback - when no sensorPlacements, use original devicePlacement path */}
        {deviceInteractive && showDevice && !sensorPlacements && devicePlacement && safePlacement &&
          renderDeviceInteractive({
            placement: safePlacement,
            fovDeg: effectiveFov,
            maxRangeMeters: effectiveMaxRange,
            wallPoints: safePoints,
            clipToWalls: !!clipRadarToWalls,
            showRadar: !!showRadar,
            iconUrl: deviceIconUrl,
            zoom: effectiveZoom,
            toCanvasCoord,
            canDrag: !!onDeviceChange,
            onDragStart: () => {
              setActiveDrag({ mode: 'device-drag' });
              onDragStateChange?.(true);
            },
            onSelect: () => onItemSelect?.('device', 'device'),
          })
        }
      </svg>
    </div>
  );
};
