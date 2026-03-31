---
estimated_steps: 16
estimated_files: 3
skills_used: []
---

# T01: Per-sensor coverage utility + unit tests

Extract per-sensor zone coverage computation as a pure utility function with comprehensive unit tests. This is the data foundation — every other task depends on it.

The existing `isPointInSensorRange` in RoomCanvas.tsx checks if a point is in range of ANY sensor (collapses to boolean). The existing `getZoneCoverage` returns aggregate 'full'|'partial'|'none'. We need a new pure function that returns per-sensor coverage results.

Create `frontend/src/utils/zoneCoverageUtils.ts` with:
1. `isPointInSensorCone(pt, sensorPlacement, fovDeg, maxRangeMeters)` — checks a single sensor's cone (extracted from the inline logic in RoomCanvas)
2. `getPerSensorCoverage(zone, sensors)` — returns `Map<string, 'full'|'partial'|'none'>` keyed by sensor ID
3. `getAggregateCoverage(perSensor)` — derives aggregate from per-sensor (full if any sensor has full, partial if any has partial, none if all none)

The point-in-cone math must use the +90° rotation offset convention already established in `isPointInSensorRange` and `selectedZoneCoverage`. For ZoneRect, use center-based vertex expansion (x ± width/2, y ± height/2). For ZonePolygon, use vertices directly.

Sensor input type should be `{ id: string; placement: { x: number; y: number; rotationDeg?: number }; fovDeg: number; maxRangeMeters: number }` — compatible with SensorRenderInfo but not importing it (keeps the utility pure).

Also add `overlapThreshold` to `ZoneRect` and `ZonePolygon` in `frontend/src/api/types.ts` (number, 0-1, optional, defaults to 0.1 when absent).

Write tests in `frontend/src/utils/__tests__/zoneCoverageUtils.test.ts` covering:
- Single sensor full/partial/none coverage for rect and polygon zones
- Multi-sensor with different coverage levels per sensor
- Aggregate derivation from per-sensor map
- Zone entirely outside all sensors → all 'none'
- Sensor with no placement → skipped
- Edge case: zero-area zone (width=0 or polygon with collinear points)

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — existing isPointInSensorRange logic to extract (lines 296-330)`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` — SensorRenderInfo interface for reference (line 100)`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — ZoneRect/ZonePolygon types to add overlapThreshold field`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/utils/zoneCoverageUtils.ts` — pure utility with isPointInSensorCone, getPerSensorCoverage, getAggregateCoverage`
- ``everything-presence-mmwave-configurator/frontend/src/utils/__tests__/zoneCoverageUtils.test.ts` — 12+ unit tests`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — overlapThreshold added to ZoneRect and ZonePolygon`

## Verification

cd everything-presence-mmwave-configurator/frontend && npx vitest run src/utils/__tests__/zoneCoverageUtils.test.ts && npx tsc --noEmit
