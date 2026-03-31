# S03 — Zone assignment + per-device translated zone writes — Research

**Date:** 2026-03-30

## Summary

S03 wires S01's pure-function domain modules (coordinateTransform, zoneCoverage, zoneAssignment) into the room-save flow so that zones drawn in room-space are automatically translated to device-space and written to each covering sensor's HA entities. The current architecture has zone writes isolated in per-device endpoints (`POST /api/devices/:deviceId/zones`) called directly from ZoneEditorPage/WizardPage — zones pass through as-is in device coordinates. S03 introduces a room-level orchestration layer that intercepts the room save, runs the S01 math pipeline, and fans out translated writes to each sensor.

The primary risk is format mismatch between S01's `DeviceZoneRect` (begin/end format) and zoneWriter's expected `ZoneRect` input (x/y/width/height format). The recommended approach is to add a new method to ZoneWriter that accepts pre-translated coordinates with explicit slot targeting, bypassing the ID-based slot matching logic. This keeps the existing per-device endpoints untouched while providing a clean multi-sensor write path.

## Recommendation

Build a `RoomZoneOrchestrator` service class that coordinates the full pipeline: profile resolution → coverage → assignment → transform → per-device writes. Expose it via a new `POST /api/rooms/:roomId/apply-zones` endpoint. The frontend's `handleSaveRoom` then calls this endpoint after the room PUT succeeds. Unit-test the orchestrator logic with mocked zoneWriter. Integration-test against the Docker dev stack.

Build order: orchestrator service (pure logic + zoneWriter adaptation) → new route → frontend trigger → verification. The riskiest part is the zoneWriter format bridge, so tackle that first.

## Implementation Landscape

### Key Files

- `backend/src/domain/coordinateTransform.ts` — S01 deliverable. `transformZoneToDeviceSpace(zone, sensor)` → `DeviceZoneRect` (beginX/endX/beginY/endY) or `DeviceZonePolygon` (transformed vertices). `transformZonesToDeviceSpace(zones, sensor)` for batch.
- `backend/src/domain/zoneCoverage.ts` — S01 deliverable. `computeAllCoverage(zones, sensors, gridSize?)` → `number[][]` matrix indexed [zoneIdx][sensorIdx].
- `backend/src/domain/zoneAssignment.ts` — S01 deliverable. `assignZonesToDevices(zones, coverageMatrix, profiles, threshold?)` → `AssignmentResult` with `assignments[]` (zoneId, sensorDeviceId, slotId, coverage) and `unassigned[]`.
- `backend/src/ha/zoneWriter.ts` — Existing. `applyZones(zoneMap, zones, prefix, mappings?, deviceId?)` expects `ZoneRect[]` with x/y/width/height and matches slots by extracting trailing number from `zone.id`. **Needs a new method or adapter** to accept `DeviceZoneRect` (begin/end) with explicit slot targeting.
- `backend/src/ha/writeClient.ts` — Existing. `setNumberEntity(entityId, value)` for rect coordinates. `setTextEntity(entityId, value)` for polygon text.
- `backend/src/domain/deviceEntityService.ts` — `getZoneEntitySet(deviceId, zoneType, zoneIndex)` → `ZoneEntitySet` with beginX/endX/beginY/endY entity IDs. This is the entity resolution path for the new write flow.
- `backend/src/domain/deviceProfiles.ts` — `DeviceProfileLoader.getProfileById(id)` → `DeviceProfile` with `limits.maxZones`, `limits.fieldOfViewDegrees`, `limits.maxRangeMeters` etc.
- `backend/src/config/deviceMappingStorage.ts` — `deviceMappingStorage.getMapping(deviceId)` → `DeviceMapping` with `profileId` and `mappings` record.
- `backend/src/routes/rooms.ts` — Room CRUD routes. `PUT /:id` is pure storage save (no zone writes). **New route** `POST /:roomId/apply-zones` needs to be added here (or as a separate route file).
- `backend/src/routes/devices.ts` — Existing per-device zone endpoints. **Not modified** — these remain for single-device ZoneEditorPage use.
- `backend/src/domain/types.ts` — `RoomConfig` with `zones: Zone[]` and `sensors: SensorAttachment[]`. `SensorAttachment` has `deviceId`, `profileId`, `placement: DevicePlacement`.
- `frontend/src/pages/RoomBuilderPage.tsx` — `handleSaveRoom()` currently does PUT to save room. Needs to also call the new apply-zones endpoint after save succeeds.
- `frontend/src/api/zones.ts` — Frontend API module. Needs new `applyRoomZones(roomId)` function.

### Key Type Mappings

The format bridge between S01 output and zoneWriter input is the critical detail:

| S01 Output | zoneWriter Input | Resolution |
|---|---|---|
| `DeviceZoneRect` {beginX, endX, beginY, endY} | `ZoneRect` {x, y, width, height} | New `applyTranslatedZones()` method on ZoneWriter that writes beginX/endX/beginY/endY directly to entity set, bypassing the x+width→endX computation |
| `ZoneAssignment.slotId` ("zone1") | `zone.id` matching trailing number | New method accepts explicit slot index, bypassing extractZoneIndex() |
| `DeviceZonePolygon` {vertices: Point[]} | `ZonePolygon` {vertices: Point[]} | Vertices format matches — polygon path uses same vertex array |

### Orchestrator Data Flow

```
Room save triggered
  → storage.getRoom(roomId) → RoomConfig with zones[] and sensors[]
  → For each sensor: resolve SensorProfile from deviceMappingStorage + profileLoader
  → computeAllCoverage(zones, sensorPlacements, gridSize) → coverageMatrix
  → assignZonesToDevices(zones, coverageMatrix, profiles, threshold) → AssignmentResult
  → Group assignments by sensorDeviceId
  → For each sensor's assignments:
      → For each assignment:
          → transformZoneToDeviceSpace(zone, sensor.placement) → DeviceZone
          → getZoneEntitySet(deviceId, slotType, slotIndex) → entity IDs
          → writeClient.setNumberEntity() for each coordinate (rect)
            OR writeClient.setTextEntity() for polygon text
      → Clear unused slots (slots in profile that got no assignment)
  → Return result with per-device write status + unassigned zone warnings
```

### Build Order

1. **ZoneWriter adaptation** — Add `applyTranslatedZones(deviceId, assignments)` method that accepts `DeviceZoneRect`/`DeviceZonePolygon` with explicit slot targeting. Uses `deviceEntityService.getZoneEntitySet()` directly. This is the riskiest piece — must produce the same HA entity writes as the existing flow but from different input format.

2. **RoomZoneOrchestrator service** — New file `backend/src/domain/roomZoneOrchestrator.ts`. Orchestrates the full pipeline: profile resolution → coverage → assignment → transform → per-device writes via the new ZoneWriter method. Pure orchestration — all math delegated to S01 modules.

3. **Room route endpoint** — `POST /api/rooms/:roomId/apply-zones` in rooms.ts (or new route file). Calls orchestrator, returns structured result with per-device status and unassigned zone warnings.

4. **Frontend integration** — Add `applyRoomZones(roomId)` to `frontend/src/api/zones.ts`. Call it from `handleSaveRoom()` in RoomBuilderPage after the PUT succeeds (only when room has sensors and zones).

5. **Verification** — Unit test the orchestrator with mocked zoneWriter (confirm correct transform + slot mapping). Integration test against Docker dev stack (confirm HA entity states update with correct device-relative coordinates).

### Verification Approach

- **Unit tests:** Test `RoomZoneOrchestrator` with mocked writeClient/deviceEntityService. Verify: correct zones assigned per device, coordinates match expected device-space values, unused slots cleared, EP One excluded, unassigned zones reported.
- **Integration test (Docker):** Start dev stack, create a room with 2 sensors and 3 zones, hit the apply-zones endpoint, read back HA entity states via REST API, confirm device-relative coordinates are correct.
- **Existing tests:** Run `npx vitest run` to confirm no S01 regressions from zoneWriter changes.

## Constraints

- ZoneWriter's existing `applyZones()` and `applyPolygonZones()` methods must remain unchanged — they're still used by the single-device ZoneEditorPage and WizardPage flows. The new method is additive.
- `extractZoneIndex()` matches zone slot by trailing number in zone ID (regex `/\d+$/`). The new method bypasses this entirely by using explicit slot indices from `ZoneAssignment.slotId`.
- Entity resolution depends on `deviceMappingStorage` having a mapping for each sensor's `deviceId`. If a sensor hasn't been through entity discovery, the orchestrator can't write to it — must handle this gracefully with warnings.
- ZoneRect coordinates from the frontend are room-space (center-based: x,y is center, width/height are dimensions). DeviceZoneRect from coordinateTransform is device-space (begin/end axis-aligned bounding box). The zoneWriter currently expects top-left x,y with width/height — a third format. The new method must use begin/end directly.
- Polygon zones: `applyPolygonZones()` uses index-based routing (`zones[idx]` → slot `idx+1`), while rect `applyZones()` uses ID-based routing. The new method unifies on explicit slot index from assignment.

## Common Pitfalls

- **Zone ID slot matching** — The existing zoneWriter matches `zone.id` trailing digits to slot index. If a room zone has id "living-room-zone-1" it maps to slot 1. But with multi-sensor assignment, the same room zone might be assigned to slot 2 on one device and slot 1 on another. The new method must use `ZoneAssignment.slotId` directly, not the zone's original ID.
- **Unused slot clearing** — When a device previously had zones in slots 1-4 but now only has assignments for slots 1-2, slots 3-4 must be cleared (coordinates set to 0). The orchestrator needs to know the device's profile limits to iterate all possible slots.
- **Missing entity mappings** — Sensors attached to rooms might not have completed entity discovery. `deviceEntityService.getZoneEntitySet()` returns null when no mapping exists. The orchestrator must collect these as warnings rather than failing the entire write.
- **Coverage matrix dimensions** — `computeAllCoverage` returns `[zoneIdx][sensorIdx]` but `assignZonesToDevices` expects the same ordering. The sensor profiles array must match the coverage matrix column order exactly.

## Open Risks

- **Polygon zone support completeness** — S01's coordinateTransform handles polygon zones (vertex-wise transform), but the new write path needs to format polygon vertices as the text format zoneWriter uses (`polygonToText()`). Need to verify this helper is accessible/importable.
- **Concurrent write safety** — If two room saves happen simultaneously, zone writes to the same device could interleave. The current per-device endpoints have the same issue; this isn't a new risk but worth noting. No mitigation planned for S03.