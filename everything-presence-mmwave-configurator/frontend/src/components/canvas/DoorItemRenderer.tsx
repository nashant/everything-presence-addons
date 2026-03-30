/**
 * Door item renderer — handles rendering for doors on the room canvas.
 * Door drag is managed by parent components (RoomBuilderPage/WizardPage),
 * so this module only handles rendering and dispatching mousedown events.
 */

import React from 'react';
import type { Door } from '../../api/types';
import type { Point } from './geometry';

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface DoorRenderParams {
  doors: Door[];
  selectedDoorId: string | null;
  wallPoints: Point[];
  toCanvasCoord: (p: Point) => { x: number; y: number };
  /** Convert a world-space length to canvas-space length */
  toCanvasLength: (v: number) => number;
  onItemSelect?: (type: 'door', id: string) => void;
  onDoorDragStart?: (doorId: string, x: number, y: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}

export function renderDoors(params: DoorRenderParams): React.ReactNode {
  const {
    doors, selectedDoorId, wallPoints,
    toCanvasCoord, toCanvasLength,
    onItemSelect, onDoorDragStart, onDragStateChange, suppressClickRef,
  } = params;

  return doors.map((door) => {
    // Get the wall segment this door is on
    if (door.segmentIndex < 0 || door.segmentIndex >= wallPoints.length) return null;

    const segmentStart = wallPoints[door.segmentIndex];
    const segmentEnd = wallPoints[(door.segmentIndex + 1) % wallPoints.length];
    if (!segmentStart || !segmentEnd) return null;

    // Calculate door position along the segment
    const doorX = segmentStart.x + (segmentEnd.x - segmentStart.x) * door.positionOnSegment;
    const doorY = segmentStart.y + (segmentEnd.y - segmentStart.y) * door.positionOnSegment;

    // Calculate segment angle
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const segmentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Convert to canvas coordinates
    const canvasDoorPos = toCanvasCoord({ x: doorX, y: doorY });
    const canvasDoorWidth = toCanvasLength(door.widthMm);
    const swingRadius = canvasDoorWidth;

    const isSelected = selectedDoorId === door.id;

    // Calculate hinge position and swing direction
    const hingeOffset = door.swingSide === 'right' ? canvasDoorWidth / 2 : -canvasDoorWidth / 2;

    // Determine which side of the wall segment the room interior is.
    const centroidX = wallPoints.reduce((s, p) => s + p.x, 0) / wallPoints.length;
    const centroidY = wallPoints.reduce((s, p) => s + p.y, 0) / wallPoints.length;
    const toCentroidX = centroidX - doorX;
    const toCentroidY = centroidY - doorY;
    const cross = dx * toCentroidY - dy * toCentroidX;
    const inwardSign = cross >= 0 ? 1 : -1;
    const arcDirection = door.swingDirection === 'in' ? inwardSign : -inwardSign;

    // Arc start: free end of door when closed (opposite from hinge, along x-axis)
    const arcStartX = door.swingSide === 'left' ? canvasDoorWidth / 2 : -canvasDoorWidth / 2;
    const arcStartY = 0;

    // Arc end: free end of door when fully open (perpendicular to wall)
    const arcEndX = hingeOffset;
    const arcEndY = arcDirection * canvasDoorWidth;

    const largeArcFlag = 0;
    const sweepFlag = (door.swingSide === 'left') === (arcDirection > 0) ? 1 : 0;

    return (
      <g key={door.id}>
        <g transform={`translate(${canvasDoorPos.x}, ${canvasDoorPos.y}) rotate(${segmentAngle})`}>
          {/* Selection highlight */}
          {isSelected && (
            <rect
              x={-canvasDoorWidth / 2 - 10}
              y={Math.min(-15, arcEndY - 15)}
              width={canvasDoorWidth + 20}
              height={Math.abs(arcEndY) + 30}
              fill="rgba(6, 182, 212, 0.1)"
              stroke="#06b6d4"
              strokeWidth={2}
              strokeDasharray="4 4"
              rx={4}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Invisible clickable area */}
          <rect
            x={-canvasDoorWidth / 2 - 10}
            y={Math.min(-15, arcEndY - 15)}
            width={canvasDoorWidth + 20}
            height={Math.abs(arcEndY) + 30}
            fill="transparent"
            style={{ cursor: onDoorDragStart ? (isSelected ? 'grab' : 'pointer') : 'pointer' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              suppressClickRef.current = false;

              onItemSelect?.('door', door.id);

              if (isSelected && onDoorDragStart) {
                onDoorDragStart(door.id, doorX, doorY);
                onDragStateChange?.(true);
              }
            }}
          />

          {/* Door frame line */}
          <line
            x1={-canvasDoorWidth / 2}
            y1={0}
            x2={canvasDoorWidth / 2}
            y2={0}
            stroke={isSelected ? '#06b6d4' : '#ffffff'}
            strokeWidth={isSelected ? 4 : 3}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'pointer', pointerEvents: 'none' }}
          />

          {/* Door swing arc */}
          {door.swingDirection && (
            <path
              d={`M ${arcStartX} ${arcStartY} A ${swingRadius} ${swingRadius} 0 ${largeArcFlag} ${sweepFlag} ${arcEndX} ${arcEndY}`}
              stroke={isSelected ? '#06b6d4' : '#000000'}
              strokeWidth={2}
              fill="none"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Door panel */}
          <line
            x1={hingeOffset}
            y1={0}
            x2={hingeOffset}
            y2={arcEndY}
            stroke={isSelected ? '#06b6d4' : '#8b5a3c'}
            strokeWidth={4}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'none' }}
          />

          {/* Hinge indicator */}
          <circle
            cx={hingeOffset}
            cy={0}
            r={4}
            fill={isSelected ? '#06b6d4' : '#71717a'}
            stroke={isSelected ? '#0891b2' : '#52525b'}
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
        </g>
      </g>
    );
  });
}
