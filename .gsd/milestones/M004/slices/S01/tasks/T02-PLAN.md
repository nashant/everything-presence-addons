---
estimated_steps: 37
estimated_files: 2
skills_used: []
---

# T02: Implement per-sensor zone coverage analyzer with grid-point sampling and unit tests

Build `zoneCoverage.ts` in `backend/src/domain/` with pure functions that compute what percentage of each zone falls within each sensor's FOV cone.

## Context

The existing frontend coverage check (`RoomBuilderPage.tsx:511-542`) uses vertex-in-cone to classify zones as full/partial/none for a single sensor. S01 needs to generalize this to:
- N sensors per room
- Numeric overlap percentage (0.0–1.0) instead of coarse classification
- Grid-point sampling for better precision than vertex-only checks

The algorithm: scatter a grid of sample points across the zone area, check each against the sensor's FOV cone (range + angle), count what fraction falls inside.

## Key math (from frontend reference)
- Sensor FOV cone is defined by: position (x,y), rotation (+90° offset), half-angle (fovDeg/2), max range (maxRangeMeters * 1000 → mm)
- Point-in-cone test: `distance <= maxRange AND |angleDiff| <= halfFov` where angleDiff is normalized to [-π, π]
- The +90° offset means rotationDeg=0 → sensor points along +Y axis

## Profile data structure
Device profiles store FOV and range in `limits`: `{ maxZones, maxRangeMeters, fieldOfViewDegrees, ... }`. Profiles are loaded from `config/device-profiles/*.json`.

## Steps
1. Create `backend/src/domain/zoneCoverage.ts`
2. Implement `isPointInCone(point: Point, sensorPos: Point, rotationDeg: number, fovDeg: number, maxRangeMm: number): boolean` — the core geometric test
3. Implement `getZoneSamplePoints(zone: Zone, gridSize: number): Point[]` — generates grid points within the zone boundary. For ZoneRect (center-based): grid within (x±width/2, y±height/2). For ZonePolygon: grid within bounding box, filtered to points inside the polygon using ray-casting point-in-polygon test.
4. Implement `computeZoneCoverage(zone: Zone, sensorPlacement: DevicePlacement, fovDeg: number, maxRangeMm: number, gridSize?: number): number` — returns overlap fraction 0.0–1.0
5. Implement batch helper: `computeAllCoverage(zones: Zone[], sensors: Array<{ placement: DevicePlacement, fovDeg: number, maxRangeMm: number }>): number[][]` — returns coverage matrix [zoneIndex][sensorIndex]
6. Need a backend `isPointInPolygon` — either import from a shared location or implement locally (ray-casting algorithm, same as `frontend/src/components/canvas/geometry.ts:isPointInPolygon`)
7. Create `backend/src/__tests__/unit/zoneCoverage.test.ts` with tests:
   - Zone fully inside cone → coverage ≈ 1.0 (within grid precision)
   - Zone fully outside cone (behind sensor) → coverage ≈ 0.0
   - Zone beyond max range → coverage ≈ 0.0
   - Zone straddling cone edge → coverage between 0.0 and 1.0
   - Zone at exact max range boundary → partial coverage
   - ZonePolygon coverage (triangle inside cone)
   - Batch coverage: 2 zones × 2 sensors → correct 2×2 matrix
   - Grid size affects precision: larger grid → more accurate result
   - Sensor with rotationDeg undefined → defaults to 0°

## Must-Haves
- [ ] `isPointInCone` uses +90° rotation offset matching frontend convention
- [ ] Angle difference normalization handles wrap-around correctly
- [ ] ZoneRect sample points use CENTER-based convention (x,y = center)
- [ ] ZonePolygon sample points filtered by ray-casting point-in-polygon
- [ ] Grid size is configurable with sensible default (10)
- [ ] All unit tests pass

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — Zone, ZoneRect, ZonePolygon, Point, DevicePlacement, isZoneRect, isZonePolygon`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/geometry.ts` — reference isPointInPolygon implementation (ray-casting) and +90° rotation convention`
- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — lines 511-542, reference single-sensor coverage computation with vertex-in-cone`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts` — pure functions: isPointInCone, getZoneSamplePoints, computeZoneCoverage, computeAllCoverage`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneCoverage.test.ts` — unit tests covering full/none/partial coverage, polygon zones, batch matrix, grid precision`

## Verification

cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneCoverage.test.ts
