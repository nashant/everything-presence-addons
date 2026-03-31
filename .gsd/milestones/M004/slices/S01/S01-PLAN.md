# S01: Coordinate transform + zone coverage engine

**Goal:** Three pure-function domain modules — coordinate transform, zone coverage, zone assignment — with comprehensive unit tests proving correctness for all rotation quadrants, zone types, coverage scenarios, and slot assignment edge cases including EP One exclusion.
**Demo:** After this: Unit tests prove room-space → device-space transform is correct for all orientations. Coverage analysis returns per-sensor overlap percentages for each zone. Zone assignment maps zones to device slots respecting profile limits.

## Tasks
- [x] **T01: Built coordinateTransform.ts with room↔device-space pure transforms — all 34 unit tests pass covering 4 rotation quadrants, polygons, inverse round-trips, and edge cases** — Build `coordinateTransform.ts` in `backend/src/domain/` with pure functions that translate zone coordinates from room-space to device-space.

## Context

The frontend uses center-based ZoneRect (x,y = center, width/height = extents) and ZonePolygon (vertices array). Sensors have a DevicePlacement with x, y, rotationDeg. The transform must:
1. Translate zone coordinates relative to the sensor position (subtract sensor x,y)
2. Rotate by negative sensor angle to undo the sensor's orientation
3. Use the +90° rotation offset convention: `effectiveAngleRad = (rotationDeg + 90) * π / 180` — this matches `buildRadarPath` in `frontend/src/components/canvas/geometry.ts` where 0° means sensor forward is +Y
4. Output device-space coordinates in begin/end format (beginX, endX, beginY, endY) for ZoneRect, suitable for the downstream zoneWriter

## Key type info from `backend/src/domain/types.ts`
- `ZoneRect`: `{ id, type, x, y, width, height, enabled?, label? }` — x,y is CENTER
- `ZonePolygon`: `{ id, type, vertices: Point[], enabled?, label? }` — vertices in room-space
- `Point`: `{ x: number, y: number }`
- `DevicePlacement`: `{ x, y, rotationDeg? }`
- `isZoneRect(zone)` / `isZonePolygon(zone)` — type guards
- All coordinates are in mm

## Important: rectToPolygon convention mismatch
`polygonUtils.ts:rectToPolygon()` treats ZoneRect x,y as top-left corner. The frontend treats x,y as center. The transform must use the CENTER convention (matching frontend) — do NOT use rectToPolygon for ZoneRect corner computation.

## Steps
1. Create `backend/src/domain/coordinateTransform.ts`
2. Define output types: `DeviceZoneRect { beginX, endX, beginY, endY, type, id, enabled?, label? }` and `DeviceZonePolygon { vertices: Point[], type, id, enabled?, label? }`
3. Implement `transformPoint(point: Point, sensorPlacement: DevicePlacement): Point` — translate then rotate
4. Implement `transformZoneToDeviceSpace(zone: Zone, sensorPlacement: DevicePlacement): DeviceZoneRect | DeviceZonePolygon`
5. Implement `transformZoneToRoomSpace(deviceZone, sensorPlacement)` — inverse transform for S05 use
6. Implement batch helper: `transformZonesToDeviceSpace(zones: Zone[], sensorPlacement: DevicePlacement)`
7. Create `backend/src/__tests__/unit/coordinateTransform.test.ts` with tests:
   - Identity transform: sensor at origin with 0° rotation → output matches input (with center→begin/end conversion for rect)
   - 90° rotation: verify coordinates rotate correctly
   - 180° rotation: verify sign flip
   - 270° rotation: verify
   - Arbitrary angle (e.g., 45°): verify trigonometry
   - Sensor at offset position (not origin): verify translation
   - ZonePolygon transform: all vertices transform correctly
   - Inverse transform round-trips: transform → inverse → original (within floating point tolerance)
   - Edge case: rotationDeg undefined defaults to 0°

## Must-Haves
- [ ] `transformPoint` correctly applies translate-then-rotate with +90° offset
- [ ] Rotation direction is NEGATIVE sensor angle (room→device undoes sensor rotation)
- [ ] ZoneRect center-based input → begin/end output conversion is correct
- [ ] Inverse transform round-trips to within 0.01mm tolerance
- [ ] All unit tests pass
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts
  - Verify: cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/coordinateTransform.test.ts
- [x] **T02: Built zoneCoverage.ts with grid-point sampling FOV cone analysis — 31 tests pass covering all rotations, zone types, boundary conditions, and batch matrix computation** — Build `zoneCoverage.ts` in `backend/src/domain/` with pure functions that compute what percentage of each zone falls within each sensor's FOV cone.

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
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneCoverage.test.ts
  - Verify: cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneCoverage.test.ts
- [x] **T03: Built zoneAssignment.ts with coverage-threshold-gated slot allocation across three zone-type pools — 24 unit tests pass covering slot routing, EP One exclusion, overflow, multi-sensor overlap, and edge cases** — Build `zoneAssignment.ts` in `backend/src/domain/` with pure functions that map room-level zones to specific device zone slots, respecting profile limits and coverage thresholds.

## Context

Each EP device has fixed slot pools:
- **EP Lite**: 4 regular (zone1-zone4), 2 exclusion (exclusion1-exclusion2), 2 entry (entry1-entry2)
- **EP Pro**: 4 regular, 2 exclusion, 0 entry
- **EP One**: 0 regular, 0 exclusion, 0 entry (EXCLUDED entirely — R012)

Profile data from `config/device-profiles/*.json` — limits are in `profile.limits`: `{ maxZones, maxExclusionZones?, maxEntryZones?, ... }`

The assignment engine takes room zones, sensors with their profiles, and a coverage matrix (from `zoneCoverage.ts`), then assigns each zone to device slots on sensors that cover it above a threshold.

## Zone type → slot pool mapping
- `zone.type === 'regular'` → regular zone slots (zone1, zone2, zone3, zone4) — capped by `maxZones`
- `zone.type === 'exclusion'` → exclusion slots (exclusion1, exclusion2) — capped by `maxExclusionZones` (default 0)
- `zone.type === 'entry'` → entry slots (entry1, entry2) — capped by `maxEntryZones` (default 0)

## Steps
1. Create `backend/src/domain/zoneAssignment.ts`
2. Define types:
   - `SlotId`: `'zone1' | 'zone2' | 'zone3' | 'zone4' | 'exclusion1' | 'exclusion2' | 'entry1' | 'entry2'`
   - `ZoneAssignment`: `{ zoneId: string, sensorDeviceId: string, slotId: SlotId, coverage: number }`
   - `AssignmentResult`: `{ assignments: ZoneAssignment[], unassigned: Array<{ zoneId: string, reason: string }>, warnings: string[] }`
   - `SensorProfile`: `{ deviceId: string, placement: DevicePlacement, maxZones: number, maxExclusionZones: number, maxEntryZones: number, fovDeg: number, maxRangeMm: number }`
3. Implement `assignZonesToDevices(zones: Zone[], sensors: SensorProfile[], coverageMatrix: number[][], overlapThreshold?: number): AssignmentResult`
   - Default overlapThreshold = 0.1 (10% coverage minimum)
   - For each zone: find sensors where coverage >= threshold
   - For each qualifying sensor: allocate the next available slot in the correct pool
   - If no sensor covers a zone above threshold: add to `unassigned` with reason
   - If a sensor's slot pool is full: add warning and skip that sensor for that zone
   - Skip sensors with maxZones=0 entirely (EP One — R012)
4. Implement `getAvailableSlots(zoneType: Zone['type'], profile: SensorProfile, usedSlots: Set<SlotId>): SlotId[]`
5. Create `backend/src/__tests__/unit/zoneAssignment.test.ts` with tests:
   - Single sensor covers all zones → sequential slot allocation (zone1, zone2, zone3, zone4)
   - Multi-sensor overlap: same zone assigned to multiple sensors' slots
   - Zone below coverage threshold → unassigned with reason
   - EP One sensor (maxZones=0) → completely skipped, no error
   - Slot overflow: 5 regular zones with 4 slots → 5th goes to unassigned
   - Exclusion zone → uses exclusion1/exclusion2 slots, not regular slots
   - Entry zone → uses entry1/entry2 slots, not regular slots
   - EP Pro with 0 entry zones → entry zones go to unassigned
   - Mixed zone types: regular + exclusion + entry allocated from separate pools
   - Empty inputs: no zones → empty result; no sensors → all unassigned
   - Custom threshold: 0.5 threshold filters out low-coverage sensors

## Must-Haves
- [ ] Zone types route to correct slot pools (regular/exclusion/entry)
- [ ] EP One devices (maxZones=0) are completely excluded from assignment
- [ ] Slot overflow produces unassigned entries with clear reason, not an error
- [ ] Coverage threshold is configurable with sensible default
- [ ] All unit tests pass
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts
  - Verify: cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneAssignment.test.ts
