---
estimated_steps: 63
estimated_files: 3
skills_used: []
---

# T01: Build ZoneWriter adapter and RoomZoneOrchestrator with unit tests

Add `applyTranslatedZones()` method to ZoneWriter that accepts DeviceZoneRect/DeviceZonePolygon with explicit slot indices (bypassing ID-based matching). Build RoomZoneOrchestrator service that chains: profile resolution → computeAllCoverage → assignZonesToDevices → transformZoneToDeviceSpace → per-device writes via new adapter. Include comprehensive unit tests proving the full pipeline with mocked writeClient and deviceEntityService.

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

## Inputs

- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts`
- `everything-presence-mmwave-configurator/backend/src/ha/writeClient.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/deviceEntityService.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/deviceProfiles.ts`
- `everything-presence-mmwave-configurator/backend/src/config/deviceMappingStorage.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/types.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/polygonUtils.ts`

## Expected Output

- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts`
- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomZoneOrchestrator.test.ts`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomZoneOrchestrator.test.ts && npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts
