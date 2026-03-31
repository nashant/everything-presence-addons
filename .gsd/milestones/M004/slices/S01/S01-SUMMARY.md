---
id: S01
parent: M004
milestone: M004
provides:
  - coordinateTransform.ts: transformZoneToDeviceSpace(), transformZoneToRoomSpace(), transformZonesToDeviceSpace() — consumed by S03 (zone writes) and S05 (coverage visualization)
  - zoneCoverage.ts: computeAllCoverage() → number[][] matrix — consumed by S03 (zone assignment input) and S05 (coverage indicators)
  - zoneAssignment.ts: assignZonesToDevices() → AssignmentResult with assignments[], unassigned[], warnings[] — consumed by S03 (per-device zone writes) and S04 (template sensor creation)
  - Type exports: DeviceZoneRect, DeviceZonePolygon, DeviceZone, SlotId, ZoneAssignment, AssignmentResult, SensorProfile
requires:
  []
affects:
  - S03
  - S04
  - S05
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts
  - everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts
  - everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneCoverage.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts
key_decisions:
  - D011: ZoneRect center convention — compute corners from center x,y + half-extents matching frontend, not polygonUtils top-left convention
  - D012: EP One exclusion by all-zero caps (profile-driven) rather than hardcoded device name
  - D013: Backend isPointInPolygon duplicated from frontend rather than shared module — different runtimes make sharing not worth the complexity
patterns_established:
  - Pure-function domain modules in backend/src/domain/ — no side effects, no I/O, fully unit-testable
  - Output types use begin/end format (DeviceZoneRect) matching firmware expectations while input types use center-based format matching frontend
  - Coverage matrix pattern: computeAllCoverage returns number[][] indexed by [zoneIndex][sensorIndex], consumed by assignZonesToDevices
  - Zone-type pool routing: regular→zone1-4, exclusion→exclusion1-2, entry→entry1-2 with profile-driven caps
observability_surfaces:
  - none
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-31T10:20:27.669Z
blocker_discovered: false
---

# S01: Coordinate transform + zone coverage engine

**Three pure-function domain modules — coordinateTransform, zoneCoverage, zoneAssignment — with 89 unit tests proving correctness for all rotation quadrants, zone types, coverage analysis, and slot assignment including EP One exclusion.**

## What Happened

Built the complete zone math engine as three independent domain modules in `backend/src/domain/`, each with comprehensive unit tests.

**T01 — coordinateTransform.ts (34 tests):** Room-space ↔ device-space transforms using the +90° rotation offset convention from the frontend's `buildRadarPath`. Core functions: `transformPoint`/`inverseTransformPoint` for point-level operations, `transformZoneToDeviceSpace` handling both ZoneRect (center→begin/end bounding box) and ZonePolygon (vertex-wise transform), `transformZoneToRoomSpace` as inverse for S05 downstream use, and `transformZonesToDeviceSpace` as batch wrapper. ZoneRect uses center-based convention matching the frontend (NOT the top-left convention in polygonUtils.ts). Rotated rects produce axis-aligned bounding boxes suitable for firmware. Inverse round-trips proven within 0.01mm tolerance across all quadrants and arbitrary angles.

**T02 — zoneCoverage.ts (31 tests):** Grid-point sampling FOV cone analysis. `isPointInCone` checks distance + angle with proper wrap-around normalization and zero-distance guard. `getZoneSamplePoints` generates uniform grids within ZoneRect (center-based) and ZonePolygon (bounding-box filtered by ray-casting). `computeZoneCoverage` returns 0.0–1.0 fraction per sensor. `computeAllCoverage` produces zones×sensors matrix. Grid size configurable (default 10). Backend `isPointInPolygon` duplicated from frontend (15-line ray-casting — sharing across ESM/CJS runtimes not worth the build complexity).

**T03 — zoneAssignment.ts (24 tests):** Coverage-threshold-gated slot allocation across three zone-type pools. `assignZonesToDevices` finds eligible sensors above configurable threshold (default 10%), sorts by coverage descending, allocates slots from correct pool (regular zone1-4, exclusion exclusion1-2, entry entry1-2). EP One devices detected by all-zero caps (profile-driven, not hardcoded name check) and excluded entirely per R012. Zones assigned to multiple qualifying sensors independently. Unassigned zones get structured reasons distinguishing no-eligible-sensors, below-threshold, and pool-full scenarios.

## Verification

Ran full slice verification: `npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts` — 89/89 tests pass (34 + 31 + 24) in 320ms. All three modules verified independently during task execution and again together at slice close.

## Requirements Advanced

- R001 — Validated — 34 unit tests prove room↔device-space transform for all rotations, ZoneRect and ZonePolygon, inverse round-trips within 0.01mm
- R002 — Validated — 31 unit tests prove grid-point sampling coverage analysis with configurable threshold, batch matrix, polygon zones
- R003 — Validated — 24 unit tests prove zone-to-slot assignment across 3 pool types with overflow handling and multi-sensor overlap
- R012 — Validated — EP One devices with all-zero caps excluded entirely from assignment, 3 dedicated test cases

## Requirements Validated

- R001 — 34 unit tests in coordinateTransform.test.ts — all 4 rotation quadrants, polygons, inverse round-trips, offset sensors, edge cases
- R002 — 31 unit tests in zoneCoverage.test.ts — FOV cone analysis, grid sampling, batch matrix, boundary conditions
- R003 — 24 unit tests in zoneAssignment.test.ts — slot routing, threshold filtering, overflow, multi-sensor overlap
- R012 — 3 test cases proving all-zero cap sensors are completely excluded from assignment

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

R003 (zone-to-device slot assignment) was listed with primary owner M004/S02 in REQUIREMENTS.md but the zone assignment engine was built in S01/T03 as planned in the S01 slice plan. The requirement is fully delivered.

## Known Limitations

None. All planned functionality delivered and tested.

## Follow-ups

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts` — New file — room↔device-space coordinate transforms with +90° offset convention
- `everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts` — New file — grid-point sampling FOV cone coverage analysis
- `everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts` — New file — zone-to-device slot assignment with coverage threshold gating
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts` — New file — 34 tests for coordinate transforms
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneCoverage.test.ts` — New file — 31 tests for zone coverage
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts` — New file — 24 tests for zone assignment
