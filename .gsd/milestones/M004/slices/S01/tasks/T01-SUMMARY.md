---
id: T01
parent: S01
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts", "everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts"]
key_decisions: ["ZoneRect corners computed from center convention (matching frontend), not top-left (matching polygonUtils.ts)", "Bounding-box approach for non-axis-aligned rotated rects — produces correct firmware-compatible axis-aligned zones", "Conditional spread for enabled/label avoids undefined keys in output"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran `npx vitest run src/__tests__/unit/coordinateTransform.test.ts` — all 34 tests passed in 7ms. Tests cover: transformPoint at 0°/90°/180°/270°/45° rotations plus offset and undefined defaults; inverseTransformPoint round-trips at all angles; ZoneRect→DeviceZoneRect begin/end conversion at multiple rotations; ZonePolygon vertex transforms; batch transform of mixed arrays; full inverse round-trip at 0°/90°/180°/270° for rects and 137° for polygon; edge cases for negative rotation, >360° wrap, zero-dimension, and large coordinates."
completed_at: 2026-03-31T09:29:05.157Z
blocker_discovered: false
---

# T01: Built coordinateTransform.ts with room↔device-space pure transforms — all 34 unit tests pass covering 4 rotation quadrants, polygons, inverse round-trips, and edge cases

> Built coordinateTransform.ts with room↔device-space pure transforms — all 34 unit tests pass covering 4 rotation quadrants, polygons, inverse round-trips, and edge cases

## What Happened
---
id: T01
parent: S01
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts
key_decisions:
  - ZoneRect corners computed from center convention (matching frontend), not top-left (matching polygonUtils.ts)
  - Bounding-box approach for non-axis-aligned rotated rects — produces correct firmware-compatible axis-aligned zones
  - Conditional spread for enabled/label avoids undefined keys in output
duration: ""
verification_result: passed
completed_at: 2026-03-31T09:29:05.158Z
blocker_discovered: false
---

# T01: Built coordinateTransform.ts with room↔device-space pure transforms — all 34 unit tests pass covering 4 rotation quadrants, polygons, inverse round-trips, and edge cases

**Built coordinateTransform.ts with room↔device-space pure transforms — all 34 unit tests pass covering 4 rotation quadrants, polygons, inverse round-trips, and edge cases**

## What Happened

Created coordinateTransform.ts in backend/src/domain/ with four exported functions: transformPoint/inverseTransformPoint for core point-level transforms using the +90° offset convention from buildRadarPath, transformZoneToDeviceSpace for both ZoneRect (center→begin/end bounding box) and ZonePolygon (vertex-wise), transformZoneToRoomSpace as inverse for S05 downstream use, and transformZonesToDeviceSpace as batch wrapper. Defined DeviceZoneRect, DeviceZonePolygon, DeviceZone output types with isDeviceZoneRect type guard. Wrote 34 tests across 7 describe blocks covering all four rotation quadrants, arbitrary angles, offset sensors, polygon transforms, inverse round-trips within 0.01mm tolerance, metadata preservation, and edge cases including negative rotation, >360° wrap, zero-dimension rects, and large coordinates.

## Verification

Ran `npx vitest run src/__tests__/unit/coordinateTransform.test.ts` — all 34 tests passed in 7ms. Tests cover: transformPoint at 0°/90°/180°/270°/45° rotations plus offset and undefined defaults; inverseTransformPoint round-trips at all angles; ZoneRect→DeviceZoneRect begin/end conversion at multiple rotations; ZonePolygon vertex transforms; batch transform of mixed arrays; full inverse round-trip at 0°/90°/180°/270° for rects and 137° for polygon; edge cases for negative rotation, >360° wrap, zero-dimension, and large coordinates.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run src/__tests__/unit/coordinateTransform.test.ts` | 0 | ✅ pass | 3800ms |


## Deviations

Fixed one test expectation for 45° rotation — hand-calculated expected Y had wrong sign (sin(−135°) is negative). Implementation was correct.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts`


## Deviations
Fixed one test expectation for 45° rotation — hand-calculated expected Y had wrong sign (sin(−135°) is negative). Implementation was correct.

## Known Issues
None.
