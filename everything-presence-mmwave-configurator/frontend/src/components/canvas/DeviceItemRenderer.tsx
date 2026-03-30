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
  const { placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls, showRadar, iconUrl, zoom, toCanvasCoord } = params;
  const { x: px, y: py } = toCanvasCoord(placement);
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const { iconSize, radius, dirLen, dirWidth, strokeW } = getIconSizes(zoom);

  const radarPoints = buildRadarPath({ placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls });
  const pathData = radarPointsToPathData(radarPoints, toCanvasCoord);

  return (
    <g style={{ pointerEvents: 'none' }}>
      {showRadar && (
        <path
          d={pathData}
          fill="#22c55e22"
          stroke="#22c55e"
          strokeWidth={1.5}
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
            fill="#3b82f6"
            stroke="#1d4ed8"
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
}

export function renderDeviceInteractive(params: DeviceInteractiveParams): React.ReactNode {
  const {
    placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls,
    showRadar, iconUrl, zoom, toCanvasCoord,
    canDrag, onDragStart, onSelect,
  } = params;
  const { x: px, y: py } = toCanvasCoord(placement);
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const { iconSize, radius, dirLen, dirWidth, strokeW } = getIconSizes(zoom);

  const radarPoints = buildRadarPath({ placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls });
  const pathData = radarPointsToPathData(radarPoints, toCanvasCoord);

  const handleMouseDown = () => {
    onSelect();
    if (!canDrag) return;
    onDragStart();
  };

  return (
    <g>
      {showRadar && (
        <path
          d={pathData}
          fill="#22c55e22"
          stroke="#22c55e"
          strokeWidth={1.5}
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
          style={{ cursor: canDrag ? 'grab' : 'pointer', pointerEvents: 'all' }}
          onMouseDown={handleMouseDown}
        />
      ) : (
        <>
          <circle
            cx={px}
            cy={py}
            r={radius}
            fill="#3b82f6"
            stroke="#1d4ed8"
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
