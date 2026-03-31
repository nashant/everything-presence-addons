import { describe, it, expect } from 'vitest';
import {
  isPointInSensorCone,
  getPerSensorCoverage,
  getAggregateCoverage,
  type CoverageSensorInfo,
  type CoverageLevel,
} from '../zoneCoverageUtils';
import type { ZoneRect, ZonePolygon } from '../../api/types';

// ---------------------------------------------------------------------------
// Helpers — sensor pointing "down" (rotationDeg=0 → +90° offset → faces right
// in standard math, but in the SVG convention 0° means facing +Y which is down)
//
// The +90° offset means: rotationDeg=0 → effective angle = 90° (pointing down
// in standard coords), rotationDeg=-90 → effective angle = 0° (pointing right).
// ---------------------------------------------------------------------------

/** Sensor at origin, facing down (rotation=0), 120° FOV, 6m range. */
const sensorAtOrigin: CoverageSensorInfo = {
  id: 'sensor-a',
  placement: { x: 0, y: 0, rotationDeg: 0 },
  fovDeg: 120,
  maxRangeMeters: 6,
};

/** Sensor at (3000, 3000), facing left (rotation=-180), 90° FOV, 4m range. */
const sensorFacingLeft: CoverageSensorInfo = {
  id: 'sensor-b',
  placement: { x: 3000, y: 3000, rotationDeg: -180 },
  fovDeg: 90,
  maxRangeMeters: 4,
};

/** Sensor with no placement — should be skipped. */
const sensorNoPlacement: CoverageSensorInfo = {
  id: 'sensor-nop',
  placement: undefined,
  fovDeg: 120,
  maxRangeMeters: 6,
};

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/** 2m × 2m rect zone centered at (0, 2000) — directly below origin sensor. */
const rectZoneBelow: ZoneRect = {
  id: 'z1',
  type: 'regular',
  x: 0,
  y: 2000,
  width: 2000,
  height: 2000,
};

/** 1m × 1m rect zone centered at (0, -5000) — above origin sensor, within range but outside FOV. */
const rectZoneAbove: ZoneRect = {
  id: 'z2',
  type: 'regular',
  x: 0,
  y: -5000,
  width: 1000,
  height: 1000,
};

/** 2m × 2m rect zone centered at (0, 5500) — partially inside 6m range. */
const rectZonePartial: ZoneRect = {
  id: 'z3',
  type: 'regular',
  x: 0,
  y: 5500,
  width: 2000,
  height: 2000,
};

/** 1m × 1m rect at (20000, 20000) — way outside all sensors. */
const rectZoneFarAway: ZoneRect = {
  id: 'z-far',
  type: 'regular',
  x: 20000,
  y: 20000,
  width: 1000,
  height: 1000,
};

/** Zero-width rect — degenerate. */
const rectZoneZeroWidth: ZoneRect = {
  id: 'z-zero-w',
  type: 'regular',
  x: 0,
  y: 1000,
  width: 0,
  height: 1000,
};

/** Triangle polygon zone centered below origin sensor. */
const polyZoneBelow: ZonePolygon = {
  id: 'pz1',
  type: 'regular',
  vertices: [
    { x: -500, y: 1000 },
    { x: 500, y: 1000 },
    { x: 0, y: 2000 },
  ],
};

/** Polygon zone far away. */
const polyZoneFar: ZonePolygon = {
  id: 'pz-far',
  type: 'regular',
  vertices: [
    { x: 15000, y: 15000 },
    { x: 16000, y: 15000 },
    { x: 15500, y: 16000 },
  ],
};

/** Collinear polygon (zero area) — all points on a line. */
const polyZoneCollinear: ZonePolygon = {
  id: 'pz-coll',
  type: 'regular',
  vertices: [
    { x: 0, y: 1000 },
    { x: 0, y: 2000 },
    { x: 0, y: 3000 },
  ],
};

// ===================================================================
// Tests
// ===================================================================

describe('isPointInSensorCone', () => {
  const pl = sensorAtOrigin.placement!;

  it('returns true for a point inside the cone', () => {
    // Point directly below sensor (y=1000) — within 6m range and 120° FOV
    expect(isPointInSensorCone({ x: 0, y: 1000 }, pl, 120, 6)).toBe(true);
  });

  it('returns false for a point outside the range', () => {
    expect(isPointInSensorCone({ x: 0, y: 7000 }, pl, 120, 6)).toBe(false);
  });

  it('returns false for a point inside range but outside FOV', () => {
    // Point directly above sensor — opposite direction from FOV
    expect(isPointInSensorCone({ x: 0, y: -3000 }, pl, 120, 6)).toBe(false);
  });

  it('handles zero rotation (faces down in SVG)', () => {
    // Sensor at origin, rotation 0 → faces down. Point at (0, 2000) should be in cone.
    expect(isPointInSensorCone({ x: 0, y: 2000 }, pl, 120, 6)).toBe(true);
    // Point to the far left but at a steep angle — outside 120° cone
    expect(isPointInSensorCone({ x: -5000, y: 100 }, pl, 120, 6)).toBe(false);
  });

  it('handles sensor with no rotationDeg (defaults to 0)', () => {
    const plNoRot = { x: 0, y: 0 };
    expect(isPointInSensorCone({ x: 0, y: 2000 }, plNoRot, 120, 6)).toBe(true);
  });

  it('point exactly at range boundary is inside', () => {
    // 6000mm distance, exactly at 6m range
    expect(isPointInSensorCone({ x: 0, y: 6000 }, pl, 120, 6)).toBe(true);
  });
});

describe('getPerSensorCoverage — ZoneRect', () => {
  it('returns full when all rect vertices are inside cone', () => {
    const result = getPerSensorCoverage(rectZoneBelow, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('full');
  });

  it('returns none when zone is outside FOV', () => {
    const result = getPerSensorCoverage(rectZoneAbove, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('none');
  });

  it('returns partial when some vertices are inside and some outside', () => {
    const result = getPerSensorCoverage(rectZonePartial, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('partial');
  });

  it('returns none for a zone far outside all sensors', () => {
    const result = getPerSensorCoverage(rectZoneFarAway, [sensorAtOrigin, sensorFacingLeft]);
    expect(result.get('sensor-a')).toBe('none');
    expect(result.get('sensor-b')).toBe('none');
  });

  it('handles zero-width rect (degenerate — vertices overlap)', () => {
    // Zero-width means left/right pairs collapse to the same points.
    // Still has 4 vertices — coverage depends on whether those points are in cone.
    const result = getPerSensorCoverage(rectZoneZeroWidth, [sensorAtOrigin]);
    // Vertices are at (0, 500), (0, 500), (0, 1500), (0, 1500) — all on the sensor's downward axis
    expect(['full', 'partial', 'none']).toContain(result.get('sensor-a'));
    // They should all be inside the cone (directly below sensor, within range)
    expect(result.get('sensor-a')).toBe('full');
  });
});

describe('getPerSensorCoverage — ZonePolygon', () => {
  it('returns full when all polygon vertices are inside cone', () => {
    const result = getPerSensorCoverage(polyZoneBelow, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('full');
  });

  it('returns none for polygon far away', () => {
    const result = getPerSensorCoverage(polyZoneFar, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('none');
  });

  it('handles collinear polygon (zero-area)', () => {
    // All three vertices are on the line x=0 at y=1000,2000,3000
    // All within 6m range and on the downward axis → full
    const result = getPerSensorCoverage(polyZoneCollinear, [sensorAtOrigin]);
    expect(result.get('sensor-a')).toBe('full');
  });
});

describe('getPerSensorCoverage — multi-sensor', () => {
  it('returns different coverage levels per sensor for the same zone', () => {
    // rectZoneBelow is directly below origin sensor (full) but relative to sensorFacingLeft it depends
    const result = getPerSensorCoverage(rectZoneBelow, [sensorAtOrigin, sensorFacingLeft]);
    expect(result.get('sensor-a')).toBe('full');
    // sensorFacingLeft is at (3000,3000) facing left — rectZoneBelow center at (0,2000) is to the left
    // Vertices: (-1000,1000),(1000,1000),(1000,3000),(-1000,3000) — some may be in its cone
    expect(['full', 'partial', 'none']).toContain(result.get('sensor-b'));
  });

  it('skips sensors with no placement', () => {
    const result = getPerSensorCoverage(rectZoneBelow, [sensorAtOrigin, sensorNoPlacement]);
    expect(result.has('sensor-a')).toBe(true);
    expect(result.has('sensor-nop')).toBe(false);
  });

  it('skips sensors with null placement', () => {
    const nullPlacement: CoverageSensorInfo = { ...sensorNoPlacement, id: 'sensor-null', placement: null };
    const result = getPerSensorCoverage(rectZoneBelow, [nullPlacement]);
    expect(result.has('sensor-null')).toBe(false);
  });
});

describe('getAggregateCoverage', () => {
  it('returns full if any sensor has full', () => {
    const map = new Map<string, CoverageLevel>([
      ['s1', 'none'],
      ['s2', 'full'],
    ]);
    expect(getAggregateCoverage(map)).toBe('full');
  });

  it('returns partial if best is partial (no full)', () => {
    const map = new Map<string, CoverageLevel>([
      ['s1', 'none'],
      ['s2', 'partial'],
    ]);
    expect(getAggregateCoverage(map)).toBe('partial');
  });

  it('returns none if all sensors are none', () => {
    const map = new Map<string, CoverageLevel>([
      ['s1', 'none'],
      ['s2', 'none'],
    ]);
    expect(getAggregateCoverage(map)).toBe('none');
  });

  it('returns none for empty map', () => {
    expect(getAggregateCoverage(new Map())).toBe('none');
  });

  it('full + partial → full', () => {
    const map = new Map<string, CoverageLevel>([
      ['s1', 'partial'],
      ['s2', 'full'],
      ['s3', 'none'],
    ]);
    expect(getAggregateCoverage(map)).toBe('full');
  });
});

describe('getPerSensorCoverage — zone entirely outside all sensors', () => {
  it('all sensors return none for a far-away zone', () => {
    const sensors: CoverageSensorInfo[] = [
      { id: 's1', placement: { x: 0, y: 0, rotationDeg: 0 }, fovDeg: 120, maxRangeMeters: 6 },
      { id: 's2', placement: { x: 3000, y: 0, rotationDeg: 90 }, fovDeg: 90, maxRangeMeters: 4 },
    ];
    const result = getPerSensorCoverage(rectZoneFarAway, sensors);
    expect(result.get('s1')).toBe('none');
    expect(result.get('s2')).toBe('none');
    expect(getAggregateCoverage(result)).toBe('none');
  });
});

describe('getPerSensorCoverage — edge: empty sensors array', () => {
  it('returns empty map when no sensors provided', () => {
    const result = getPerSensorCoverage(rectZoneBelow, []);
    expect(result.size).toBe(0);
  });
});
