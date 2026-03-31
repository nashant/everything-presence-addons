# S03: Zone assignment + per-device translated zone writes

**Goal:** Room save triggers zone-to-sensor assignment, translates coordinates per sensor, and writes device-relative zones via zoneWriter. Correct coordinates verified through unit tests with mocked HA writes.
**Demo:** After this: Room save triggers zone-to-sensor assignment, translates coordinates per sensor, and writes device-relative zones via zoneWriter. Correct coordinates verified in HA entity states.

## Tasks
- [x] **T01: ZoneWriter.applyTranslatedZones and RoomZoneOrchestrator fully verified with 22 passing unit tests, fixed write-failure test timeout, added slot overflow negative test** — Add `applyTranslatedZones()` method to ZoneWriter that accepts DeviceZoneRect/DeviceZonePolygon with explicit slot indices (bypassing ID-based matching). Build RoomZoneOrchestrator service that chains: profile resolution → computeAllCoverage → assignZonesToDevices → transformZoneToDeviceSpace → per-device writes via new adapter. Include comprehensive unit tests proving the full pipeline with mocked writeClient and deviceEntityService.

## Steps

1. Add `applyTranslatedZones(deviceId, assignments)` to ZoneWriter:
   - Accepts array of `{zone: DeviceZone, slotIndex: number, slotType: 'regular'|'exclusion'|'entry'}` plus a `maxSlots` config for clearing unused slots
   - For DeviceZoneRect: writes beginX/endX/beginY/endY directly to entity set (no x+width conversion)
   - For DeviceZonePolygon: writes vertices via polygonToText() to polygon entity
   - Clears unused slots (coordinates to 0, polygon text to '') based on profile maxSlots
   - Uses deviceEntityService.getZoneEntitySet() and getPolygonZoneEntity() for entity resolution
   - Returns ZoneWriteResult with ok/failures
   - Existing applyZones() and applyPolygonZones() remain UNCHANGED

2. Create `backend/src/domain/roomZoneOrchestrator.ts`:
   - Constructor takes writeClient, deviceEntityService, deviceMappingStorage, profileLoader dependencies (injected for testability)
   - Main method `applyRoomZones(room: RoomConfig)` orchestrates:
     a. Extract sensors[] and zones[] from room
     b. For each sensor: resolve SensorProfile from deviceMappingStorage.getMapping() + profileLoader.getProfileById()
     c. Sensors with no mapping get warning and are skipped
     d. computeAllCoverage(zones, sensorProfiles) → coverageMatrix
     e. assignZonesToDevices(zones, sensorProfiles, coverageMatrix) → AssignmentResult
     f. Group assignments by sensorDeviceId
     g. For each sensor's assignments: transformZoneToDeviceSpace per zone, then call applyTranslatedZones()
     h. Collect per-device ZoneWriteResult + unassigned warnings
   - Return structured result: { results: DeviceWriteResult[], unassigned: UnassignedZone[], warnings: string[] }

3. Write unit tests in `backend/src/__tests__/unit/roomZoneOrchestrator.test.ts`:
   - Test applyTranslatedZones: rect zone writes correct beginX/endX/beginY/endY to entity set
   - Test applyTranslatedZones: polygon zone writes polygonToText output to polygon entity
   - Test applyTranslatedZones: unused slots cleared to 0
   - Test orchestrator: 2 sensors covering 3 zones → correct slot assignments per device
   - Test orchestrator: sensor without mapping → warning, other sensors proceed
   - Test orchestrator: EP One sensor (all-zero caps) excluded from assignment
   - Test orchestrator: zone below coverage threshold → appears in unassigned
   - Test orchestrator: room with no sensors → empty result
   - Test orchestrator: room with no zones → empty result
   - Test orchestrator: polygon zone transforms + writes
   - Test orchestrator: mixed rect + polygon zones
   - Test verify coordinates are device-space (transformed) not room-space

## Must-Haves

- [ ] `applyTranslatedZones` writes DeviceZoneRect beginX/endX/beginY/endY directly (no x+width conversion)
- [ ] `applyTranslatedZones` writes DeviceZonePolygon via polygonToText()
- [ ] Unused slots cleared based on profile limits
- [ ] Orchestrator chains coverage → assignment → transform → write pipeline
- [ ] Missing entity mappings produce warnings, not thrown errors
- [ ] EP One excluded from assignment
- [ ] ≥15 unit tests pass
- [ ] Existing ZoneWriter methods unchanged

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|---|---|---|---|
| deviceEntityService.getZoneEntitySet() | Returns null → skip slot with warning | N/A (sync) | N/A |
| writeClient.setNumberEntity() | Caught by ZoneWriter retry logic → failure in ZoneWriteResult | Retry with exponential backoff (existing pattern) | N/A |
| deviceMappingStorage.getMapping() | Returns null → sensor skipped with warning | N/A (sync file read) | N/A |

## Negative Tests

- Sensor with no device mapping → warning, not crash
- Zone with no coverage on any sensor → appears in unassigned with reason
- Device at full slot capacity → overflow warning per existing zoneAssignment behavior
- Empty zones array → empty result, no writes
- Empty sensors array → empty result, unassigned zones

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomZoneOrchestrator.test.ts` — all tests pass
- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts` — S01 tests still pass (89/89)

## Observability Impact

- Signals added: Structured log entries in orchestrator for per-device write status, skipped sensors, unassigned zones
- How a future agent inspects: Check orchestrator return value for warnings[] and unassigned[] arrays
- Failure state exposed: Per-device ZoneWriteResult.failures[] with entityId and error message
  - Estimate: 2h
  - Files: everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts, everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomZoneOrchestrator.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomZoneOrchestrator.test.ts && npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts
- [ ] **T02: Wire route endpoint and frontend apply-zones integration** — Add `POST /api/rooms/:roomId/apply-zones` route that calls RoomZoneOrchestrator. Add frontend `applyRoomZones()` API function and call it from `handleSaveRoom` in RoomBuilderPage after the room PUT succeeds. Run full verification: tsc, all tests, no regressions.

## Steps

1. Add route in `backend/src/routes/rooms.ts`:
   - `POST /:roomId/apply-zones` handler
   - Load room from storage, 404 if missing
   - Bail early with success if room has no sensors or no zones (no-op)
   - Instantiate RoomZoneOrchestrator with app-level dependencies (writeClient from haClients, deviceEntityService singleton, deviceMappingStorage singleton, profileLoader singleton)
   - Call `orchestrator.applyRoomZones(room)`
   - Return JSON: `{ ok, results, unassigned, warnings }` with 200 status
   - Catch errors → 500 with message

2. Resolve dependency injection for route:
   - The rooms router factory `createRoomsRouter()` currently takes no args. Add optional `deps` parameter with writeClient for zone writes.
   - In server.ts (or wherever the router is mounted), pass the writeClient dependency. If no writeClient is available (e.g., HA not connected), the route returns 503.
   - Check how the existing device zone routes in `routes/devices.ts` access writeClient for the pattern to follow.

3. Add frontend API function in `frontend/src/api/zones.ts`:
   - `applyRoomZones(roomId: string): Promise<ApplyZonesResult>` where `ApplyZonesResult` has `ok`, `results`, `unassigned`, `warnings`
   - POST to `api/rooms/${roomId}/apply-zones` with empty body
   - Use existing `handle()` and `ingressAware()` patterns

4. Update `handleSaveRoom` in `frontend/src/pages/RoomBuilderPage.tsx`:
   - After successful PUT (room saved), check if room has sensors and zones
   - If both present, call `applyRoomZones(room.id)`
   - On success: show saved modal as before. If applyZones returned unassigned zones or warnings, they can be logged to console for now (S05 will add UI for this).
   - On failure: set error message but still show that room was saved (the room data is persisted, just zone writes failed)

5. Run full verification:
   - `npx tsc --noEmit` in both backend and frontend
   - All unit tests pass
   - No S01 regressions

## Must-Haves

- [ ] `POST /api/rooms/:roomId/apply-zones` returns structured result
- [ ] Route returns 404 for missing room, 200 with empty result for room with no sensors/zones
- [ ] Frontend `applyRoomZones()` function exists in `api/zones.ts`
- [ ] `handleSaveRoom` calls apply-zones after successful PUT when room has sensors and zones
- [ ] tsc passes for both backend and frontend
- [ ] All existing tests pass (S01 89 tests + S02 tests + new orchestrator tests)

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit` — backend compiles
- `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit` — frontend compiles
- `cd everything-presence-mmwave-configurator && npx vitest run` — all tests pass

## Inputs

- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts` — orchestrator from T01
- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts` — adapter from T01
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — existing room routes
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts` — existing zone API
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — room save handler

## Expected Output

- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — new apply-zones route added
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts` — applyRoomZones() function added
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — handleSaveRoom updated
  - Estimate: 1.5h
  - Files: everything-presence-mmwave-configurator/backend/src/routes/rooms.ts, everything-presence-mmwave-configurator/frontend/src/api/zones.ts, everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit && cd frontend && npx tsc --noEmit && cd .. && npx vitest run
