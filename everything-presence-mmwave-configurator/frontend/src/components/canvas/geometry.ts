/**
 * Shared geometry helpers for the room canvas.
 * Extracted from RoomCanvas.tsx — pure functions, no React dependencies.
 */

export interface Point {
  x: number;
  y: number;
}

/** Ray-casting point-in-polygon test. */
export const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  if (polygon.length < 3) return true;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** Closest point on a line segment to a given point. */
export const closestPointOnSegment = (point: Point, segStart: Point, segEnd: Point): Point => {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return segStart;

  const t = Math.max(0, Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq));
  return { x: segStart.x + t * dx, y: segStart.y + t * dy };
};

/** Closest point on the polygon boundary. */
export const findClosestPointOnPolygon = (point: Point, polygon: Point[]): Point => {
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

/** Get the four corners of a rotated rectangle. */
export const getRotatedRectCorners = (
  center: Point,
  width: number,
  depth: number,
  rotationDeg: number,
): Point[] => {
  const halfW = width / 2;
  const halfD = depth / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localCorners = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];

  return localCorners.map((corner) => ({
    x: center.x + corner.x * cos - corner.y * sin,
    y: center.y + corner.x * sin + corner.y * cos,
  }));
};

/**
 * Constrain a rotated rectangle (furniture) to stay entirely inside a polygon.
 * Iteratively pushes the center until all corners are inside.
 */
export const constrainFurnitureToPolygon = (
  center: Point,
  width: number,
  depth: number,
  rotationDeg: number,
  polygon: Point[],
): Point => {
  if (polygon.length < 3) return center;

  let constrainedCenter = { ...center };
  const maxIterations = 10;
  const margin = 5;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const corners = getRotatedRectCorners(constrainedCenter, width, depth, rotationDeg);

    let maxPushX = 0;
    let maxPushY = 0;
    let anyOutside = false;

    for (const corner of corners) {
      if (!isPointInPolygon(corner, polygon)) {
        anyOutside = true;
        const closestOnBoundary = findClosestPointOnPolygon(corner, polygon);

        const polygonCenterX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
        const polygonCenterY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;

        let pushX = closestOnBoundary.x - corner.x;
        let pushY = closestOnBoundary.y - corner.y;

        const toCenterX = polygonCenterX - closestOnBoundary.x;
        const toCenterY = polygonCenterY - closestOnBoundary.y;
        const toCenterLen = Math.sqrt(toCenterX ** 2 + toCenterY ** 2);

        if (toCenterLen > 0) {
          pushX += (toCenterX / toCenterLen) * margin;
          pushY += (toCenterY / toCenterLen) * margin;
        }

        if (Math.abs(pushX) > Math.abs(maxPushX)) maxPushX = pushX;
        if (Math.abs(pushY) > Math.abs(maxPushY)) maxPushY = pushY;
      }
    }

    if (!anyOutside) break;

    constrainedCenter = {
      x: constrainedCenter.x + maxPushX,
      y: constrainedCenter.y + maxPushY,
    };
  }

  return constrainedCenter;
};

/** Constrain a point to stay inside a polygon (with small inward margin). */
export const constrainPointToPolygon = (point: Point, polygon: Point[]): Point => {
  if (polygon.length < 3) return point;
  if (isPointInPolygon(point, polygon)) return point;

  const closest = findClosestPointOnPolygon(point, polygon);

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

/** Line segment intersection (returns null if no intersection within both segments). */
export const lineIntersection = (
  p1: Point, p2: Point, p3: Point, p4: Point,
): Point | null => {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Radar / device geometry
// ---------------------------------------------------------------------------

export interface RadarPathParams {
  /** Device position in world coords (mm) */
  placement: { x: number; y: number; rotationDeg?: number };
  /** Field-of-view in degrees */
  fovDeg: number;
  /** Maximum detection range in meters */
  maxRangeMeters: number;
  /** Room wall polygon in world coords */
  wallPoints: Point[];
  /** Whether to clip the radar cone at wall boundaries */
  clipToWalls: boolean;
}

/**
 * Build an SVG path-data string for a radar/sensor coverage cone.
 * Handles wall clipping when enabled (ray-march each arc step against wall segments).
 */
export const buildRadarPath = (params: RadarPathParams): Point[] => {
  const { placement, fovDeg, maxRangeMeters, wallPoints, clipToWalls } = params;
  // Add 90° so 0° points down (Y+) instead of right (X+)
  const rotationRad = (((placement.rotationDeg ?? 0) + 90) * Math.PI) / 180;
  const halfFov = (fovDeg * Math.PI) / 360;
  const range = maxRangeMeters * 1000; // meters → mm
  const deviceWorld: Point = { x: placement.x, y: placement.y };
  const a1 = rotationRad - halfFov;
  const a2 = rotationRad + halfFov;

  const radarPoints: Point[] = [deviceWorld];

  if (clipToWalls && wallPoints.length >= 3) {
    const minClipDistance = 10; // mm — avoid clipping at device position
    const arcSteps = 32;
    const angleStep = (fovDeg * Math.PI / 180) / arcSteps;

    for (let i = 0; i <= arcSteps; i++) {
      const angle = a1 + i * angleStep;
      const rayEnd: Point = {
        x: deviceWorld.x + Math.cos(angle) * range,
        y: deviceWorld.y + Math.sin(angle) * range,
      };

      let clippedPoint = rayEnd;
      let minDist = Infinity;

      for (let j = 0; j < wallPoints.length; j++) {
        const wallStart = wallPoints[j];
        const wallEnd = wallPoints[(j + 1) % wallPoints.length];
        const intersection = lineIntersection(deviceWorld, rayEnd, wallStart, wallEnd);

        if (intersection) {
          const dist = Math.hypot(
            intersection.x - deviceWorld.x,
            intersection.y - deviceWorld.y,
          );
          if (dist > minClipDistance && dist < minDist) {
            minDist = dist;
            clippedPoint = intersection;
          }
        }
      }

      radarPoints.push(clippedPoint);
    }
  } else {
    // No wall clipping — draw proper arc
    const arcSteps = 32;
    for (let i = 0; i <= arcSteps; i++) {
      const angle = a1 + (i / arcSteps) * (a2 - a1);
      radarPoints.push({
        x: deviceWorld.x + Math.cos(angle) * range,
        y: deviceWorld.y + Math.sin(angle) * range,
      });
    }
  }

  return radarPoints;
};

/**
 * Convert radar world-points to an SVG path string using a coordinate transform.
 */
export const radarPointsToPathData = (
  radarPoints: Point[],
  toCanvasCoord: (p: Point) => { x: number; y: number },
): string => {
  const canvasPoints = radarPoints.map(toCanvasCoord);
  return canvasPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
};
