/**
 * Device item renderer — handles rendering for the device sensor(s) on the room canvas.
 * Supports both non-interactive (zone editor) and interactive (room builder) modes.
 * Radar coverage cone with optional wall clipping.
 */

import React from 'react';
import { buildRadarPath, radarPointsToPathData } from './geometry';
import type { Point } from './geometry';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DevicePlacement {
  x: number;
  y: number;
  rotationDeg?: number;
}

export interface DeviceRenderParams {
  placement: DevicePlacement;
  fovDeg: number;
  maxRangeMeters: number;
  wallPoints: Point[];
  clipToWalls: boolean;
  showRadar: boolean;
  iconUrl?: string;
  /** Primary color for radar cone and icon fallback (default: '#22c55e') */
  color?: string;
  /** When true, render the radar cone as a faint outline instead of filled — used
   *  for non-selected sensors in multi-sensor rooms so the active cone stands out. */
  dimmed?: boolean;
  /** Zoom level — used to keep icon constant screen size */
  zoom: number;
  /** Convert world coords to canvas coords */
  toCanvasCoord: (p: Point) => { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Shared icon sizing
// ---------------------------------------------------------------------------

function getIconSizes(zoom: number) {
  return {
    iconSize: 36 / zoom,
    radius: 12 / zoom,
    dirLen: 18 / zoom,
    dirWidth: 3 / zoom,
    strokeW: 2 / zoom,
  };
}

// ---------------------------------------------------------------------------
// Non-interactive rendering (Zone Editor — passed as renderOverlay.deviceElement)
// ---------------------------------------------------------------------------

export function renderDeviceNonInteractive(params: DeviceRenderParams): React.ReactNode {
  const { placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls, showRadar, iconUrl, color = '#22c55e', dimmed, zoom, toCanvasCoord } = params;
  const { x: px, y: py } = toCanvasCoord(placement);
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const { iconSize, radius, dirLen, dirWidth, strokeW } = getIconSizes(zoom);

  const radarPoints = buildRadarPath({ placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls });
  const pathData = radarPointsToPathData(radarPoints, toCanvasCoord);

  // Dimmed: outline-only with low opacity.  Normal: semi-transparent fill.
  const radarFill = dimmed ? 'none' : `${color}22`;
  const radarStroke = dimmed ? `${color}55` : color;
  const radarStrokeWidth = dimmed ? 1 : 1.5;

  return (
    <g style={{ pointerEvents: 'none', opacity: dimmed ? 0.5 : 1 }}>
      {showRadar && (
        <path
          d={pathData}
          fill={radarFill}
          stroke={radarStroke}
          strokeWidth={radarStrokeWidth}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {iconUrl ? (
        <image
          href={iconUrl}
          x={px - iconSize / 2}
          y={py - iconSize / 2}
          width={iconSize}
          height={iconSize}
          style={{ cursor: 'default', pointerEvents: 'none' }}
        />
      ) : (
        <>
          <circle
            cx={px}
            cy={py}
            r={radius}
            fill={color}
            stroke={color}
            strokeWidth={strokeW}
            style={{ cursor: 'default', pointerEvents: 'none' }}
          />
          <line
            x1={px}
            y1={py}
            x2={px + Math.cos(rotationRad) * dirLen}
            y2={py + Math.sin(rotationRad) * dirLen}
            stroke="#ffffff"
            strokeWidth={dirWidth}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Interactive rendering (Room Builder — draggable device icon)
// ---------------------------------------------------------------------------

export interface DeviceInteractiveParams extends DeviceRenderParams {
  /** Whether the device can be dragged (onDeviceChange is defined) */
  canDrag: boolean;
  /** Called when drag starts */
  onDragStart: () => void;
  /** Called to select the device */
  onSelect: () => void;
  /** Sensor identifier for multi-sensor drag isolation */
  sensorId?: string;
  /** Whether this sensor is currently selected — renders a highlight ring */
  selected?: boolean;
}

export function renderDeviceInteractive(params: DeviceInteractiveParams): React.ReactNode {
  const {
    placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls,
    showRadar, iconUrl, color = '#22c55e', dimmed, zoom, toCanvasCoord,
    canDrag, onDragStart, onSelect, selected,
  } = params;
  const { x: px, y: py } = toCanvasCoord(placement);
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const { iconSize, radius, dirLen, dirWidth, strokeW } = getIconSizes(zoom);

  const radarPoints = buildRadarPath({ placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls });
  const pathData = radarPointsToPathData(radarPoints, toCanvasCoord);

  // Dimmed: outline-only with low opacity.  Normal/selected: semi-transparent fill.
  const radarFill = dimmed ? 'none' : `${color}22`;
  const radarStroke = dimmed ? `${color}55` : color;
  const radarStrokeWidth = dimmed ? 1 : 1.5;

  const handleMouseDown = () => {
    onSelect();
    if (!canDrag) return;
    onDragStart();
  };

  return (
    <g style={dimmed ? { opacity: 0.5 } : undefined}>
      {showRadar && (
        <path
          d={pathData}
          fill={radarFill}
          stroke={radarStroke}
          strokeWidth={radarStrokeWidth}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Selection ring — dashed circle around selected sensor */}
      {selected && (
        <circle
          cx={px}
          cy={py}
          r={iconUrl ? iconSize / 2 + 4 / zoom : radius + 6 / zoom}
          fill="none"
          stroke={color}
          strokeWidth={2 / zoom}
          strokeDasharray={`${6 / zoom} ${3 / zoom}`}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {iconUrl ? (
        <image
          href={iconUrl}
          x={px - iconSize / 2}
          y={py - iconSize / 2}
          width={iconSize}
          height={iconSize}
          style={{ cursor: canDrag ? 'grab' : 'pointer', pointerEvents: 'all' }}
          onMouseDown={handleMouseDown}
        />
      ) : (
        <>
          <circle
            cx={px}
            cy={py}
            r={radius}
            fill={color}
            stroke={color}
            strokeWidth={strokeW}
            onMouseDown={handleMouseDown}
            style={{ cursor: canDrag ? 'grab' : 'pointer' }}
          />
          <line
            x1={px}
            y1={py}
            x2={px + Math.cos(rotationRad) * dirLen}
            y2={py + Math.sin(rotationRad) * dirLen}
            stroke="#ffffff"
            strokeWidth={dirWidth}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}
