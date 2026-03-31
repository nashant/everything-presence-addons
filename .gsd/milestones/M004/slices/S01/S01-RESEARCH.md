# S01: Coordinate Transform + Zone Coverage Engine — Research

**Date:** 2026-03-30
**Depth:** Deep research — novel coordinate math, multi-sensor generalization, critical correctness requirements

## Summary

S01 owns R001 (coordinate transform), R002 (zone coverage analysis), and R012 (EP One exclusion). It supports R004 (per-device zone writes) and R003 (slot assignment) downstream. The core work is three pure-function modules: (1) a room-space → device-space coordinate transform, (2) a per-sensor zone coverage analyzer that computes overlap percentages, and (3) a zone-to-sensor assignment engine that maps room zones to device zone slots respecting profile limits.

The codebase has all the building blocks: ZoneRect/ZonePolygon types, DevicePlacement with rotationDeg, sensor FOV/range from device profiles, and a single-sensor coverage heuristic in RoomBuilderPage. The existing coverage check (vertex-in-cone) is directionally correct but only works for one sensor and returns a coarse full/partial/none classification — S01 needs to generalize this to N sensors with numeric overlap percentages.

The coordinate transform is pure math (translate + rotate) but has a critical subtlety: the frontend uses a +90° offset on rotationDeg so that 0° means "forward along +Y axis." The transform must use this same convention. Additionally, ZoneRect coordinates are center-based in the frontend (x,y = center, width/height = size) but the zoneWriter writes begin/end corners to HA entities. The transform engine must output device-space coordinates in the begin/end format expected by zoneWriter.

## Recommendation

Build three pure-function modules in `backend/src/domain/`:
1. `coordinateTransform.ts` — room-space → device-space transform for both ZoneRect and ZonePolygon
2. `zoneCoverage.ts` — per-sensor overlap percentage computation using vertex-in-cone + area sampling
3. `zoneAssignment.ts` — maps zones to device slots with profile limit enforcement

All three are stateless, no IO, no HA dependency. Unit test them extensively with vitest in the backend test directory. This is the riskiest slice in M004 because every downstream slice depends on these functions being correct.

The coverage computation needs more precision than the existing vertex-in-cone approach. A zone with all 4 corners inside the cone could still have edges partially outside. The pragmatic approach: sample the zone area with a grid of points and compute what percentage falls within the sensor's detection cone. This gives a numeric overlap percentage suitable for threshold comparison.

## Implementation Landscape

### Key Files

- `backend/src/domain/types.ts` — ZoneRect, ZonePolygon, Zone, DevicePlacement, SensorAttachment, Point, isZoneRect/isZonePolygon type guards. All types already defined — no changes needed.
- `backend/src/domain/polygonUtils.ts` — polygonToText, rectToPolygon, polygonArea, polygonCentroid. Reusable for area calculations. `rectToPolygon` uses corner-origin convention (x,y = top-left) — different from RoomBuilderPage's center-origin convention.
- `backend/src/ha/zoneWriter.ts` — ZoneWriter.applyZones() and applyPolygonZones(). Currently writes zone coordinates as-is. S03 will call the transform before passing to zoneWriter. S01 doesn't modify this file — just needs to output compatible formats.
- `frontend/src/pages/RoomBuilderPage.tsx:511-542` — Existing single-sensor coverage computation (`selectedZoneCoverage`). Uses vertex-in-cone with +90° rotation offset. Reference implementation for the cone geometry.
- `frontend/src/components/canvas/geometry.ts` — buildRadarPath, isPointInPolygon, lineIntersection. The `buildRadarPath` function documents the +90° rotation convention: `(rotationDeg + 90) * Math.PI / 180`.
- `everything-presence-mmwave-configurator/config/device-profiles/*.json` — EP Lite: 4 zones, 120° FOV, 6m range. EP Pro: 4 zones, 120° FOV, 6m, 0 entry. EP One: 0 zones (excluded). Profile `limits.maxZones` is the gate for zone assignment.
- `backend/vitest.config.ts` — Backend vitest config exists, includes tests from `src/__tests__/**/*.test.ts`. Pure unit tests work without Docker.

### New Files (to be created)

- `backend/src/domain/coordinateTransform.ts` — Pure functions: `transformZoneToDeviceSpace(zone, sensorPlacement)` → device-space zone. Handles ZoneRect (center-based → begin/end conversion) and ZonePolygon (vertex transform).
- `backend/src/domain/zoneCoverage.ts` — Pure functions: `computeZoneCoverage(zone, sensor, profile)` → overlap percentage (0-1). `computeAllCoverage(zones, sensors, profiles)` → coverage matrix.
- `backend/src/domain/zoneAssignment.ts` — Pure functions: `assignZonesToDevices(zones, sensors, profiles, coverageMatrix, overlapThreshold)` → assignment map with slot allocation.
- `backend/src/__tests__/unit/coordinateTransform.test.ts` — Comprehensive transform tests: identity, 90°/180°/270° rotations, arbitrary angles, both zone types.
- `backend/src/__tests__/unit/zoneCoverage.test.ts` — Coverage tests: fully-inside, fully-outside, partial overlap, edge cases.
- `backend/src/__tests__/unit/zoneAssignment.test.ts` — Assignment tests: simple 1:1, multi-sensor overlap, slot overflow, EP One exclusion.

### Build Order

1. **coordinateTransform.ts + tests** — Prove the math works for all rotation quadrants first. This is the foundation everything else sits on. Test cases: sensor at origin with 0°/90°/180°/270° rotation, sensor at arbitrary offset with arbitrary rotation, ZoneRect center→corner conversion, ZonePolygon vertex transform.

2. **zoneCoverage.ts + tests** — Once transforms are proven correct, build the coverage analyzer. It depends on the same cone-geometry math but doesn't need the transform — it operates in room-space. Test cases: zone fully inside 120° cone, zone fully outside, zone straddling cone edge, zone beyond max range.

3. **zoneAssignment.ts + tests** — Final module, consumes coverage results. Maps zones to device slots. Test cases: single sensor covers all zones, multi-sensor with overlap, more zones than slots (overflow), EP One device (0 zones, excluded), configurable overlap threshold.

### Verification Approach

```bash
cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/coordinateTransform.test.ts
cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/zoneCoverage.test.ts
cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/zoneAssignment.test.ts
```

Note: Backend vitest runs from `everything-presence-mmwave-configurator/` root with config at `backend/vitest.config.ts`. The include pattern is `src/__tests__/**/*.test.ts` under the backend directory — new unit test files must match this glob. Verify by running the specific test file path.

**Update**: Backend vitest config root is `.` (the backend directory itself), and includes `src/__tests__/**/*.test.ts`. So the test commands should be:
```bash
cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/coordinateTransform.test.ts
cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneCoverage.test.ts
cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneAssignment.test.ts
```

All tests are pure unit tests — no Docker, no HA, no network.

## Constraints

- **ZoneRect center-vs-corner convention**: RoomBuilderPage uses center-based ZoneRect (x,y = center, ±width/2 and ±height/2 for corners). The zoneWriter writes begin/end coordinates (x = beginX, x+width = endX). The transform must accept center-based input and can output either format — but the downstream consumer (zoneWriter in S03) needs begin/end. Decision: transform outputs a `DeviceZoneRect` with `beginX/endX/beginY/endY` fields.
- **+90° rotation offset**: rotationDeg=0 means sensor forward is +Y (downward in screen space). Both `buildRadarPath` and `selectedZoneCoverage` add 90° before converting to radians. The transform must use the same convention: `effectiveAngleRad = (rotationDeg + 90) * π / 180`.
- **Device profiles are the authority** for maxZones, maxExclusionZones, maxEntryZones. EP One has maxZones=0. Assignment must check `profile.limits.maxZones` and skip devices with 0.
- **Zone types map to separate slot pools**: regular zones use zone1-zone4 slots, exclusion zones use exclusion1-exclusion2, entry zones use entry1-entry2. Assignment must handle each pool independently.
- **Coordinates are in mm throughout** — room-space and device-space are both in mm. No unit conversion needed.

## Common Pitfalls

- **Sign error in rotation** — The transform must rotate by *negative* sensor angle to go from room-space to device-space. Room→device means "undo the sensor's rotation." If you rotate by positive angle, all coordinates flip.
- **Center vs corner ZoneRect** — `rectToPolygon()` in polygonUtils.ts treats x,y as top-left corner. RoomBuilderPage treats x,y as center. The transform must use center-based interpretation (matching the frontend) and convert to begin/end for device output.
- **Cone angle wrapping** — When checking if an angle is within the FOV half-angle, the difference must be normalized to [-π, π]. The existing code does this with a while-loop. Use the same pattern.
- **EP One devices in sensors[]** — A room can have an EP One sensor in its sensors array. The coverage/assignment engine must gracefully skip it (maxZones=0) rather than error.

## Open Risks

- **Coverage precision vs. performance** — Grid sampling for overlap percentage is O(gridSize²) per zone per sensor. With 4 zones × 3 sensors × 100-point grid = 1200 point-in-cone checks. Should be negligible for this scale, but the grid resolution affects accuracy. Default 10×10 grid should be sufficient; make it configurable.
- **Polygon zone coverage** — For ZonePolygon, computing overlap percentage is harder because the zone boundary is arbitrary. Grid sampling still works but the grid must only count points that are inside the polygon AND inside the cone. Need `isPointInPolygon` from geometry.ts or equivalent in the backend.
- **ZoneRect coordinate convention on read-back** — When zones are read back from HA entities (via zoneReader), they come as begin/end coordinates. If the system needs to display them in room-space (reverse transform), the inverse must also be correct. S01 should export an inverse transform even if it's not used until S05.

## Sources

- Rotation convention documented in `frontend/src/components/canvas/geometry.ts:buildRadarPath()` — `(rotationDeg + 90) * Math.PI / 180`
- Coverage heuristic in `frontend/src/pages/RoomBuilderPage.tsx:511-542` — vertex-in-cone with angle normalization
- Device profile limits from `config/device-profiles/*.json` — maxZones, fieldOfViewDegrees, maxRangeMeters
