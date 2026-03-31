---
estimated_steps: 50
estimated_files: 2
skills_used: []
---

# T02: Build room device lifecycle orchestrator with unit tests

Create the core service that bridges S03's zone assignment results with S02's RoomDeviceService. The lifecycle orchestrator takes a RoomConfig + zone assignments, resolves per-device zone entity IDs, builds a `RoomDeviceDescriptor`, and calls `createRoomDevice()`. This is the riskiest piece of S04 — all integration logic lives here.

## Steps

1. **Create `backend/src/domain/roomDeviceLifecycle.ts`** — new service with:
   - `RoomDeviceLifecycleDeps` interface: `{ roomDeviceService: RoomDeviceService, deviceEntityService: IDeviceEntityService, deviceMappingStorage: IDeviceMappingStorage, profileLoader: IProfileLoader }`
   - `buildRoomDeviceDescriptor(room: RoomConfig, assignments: ZoneAssignment[]): RoomDeviceDescriptor` — pure function that:
     a. Groups assignments by room zoneId (multiple sensors may cover the same room zone)
     b. For each room zone, iterates covering sensors and resolves entity IDs:
        - From `assignment.slotId` (e.g. `zone2`), derive entity keys: `zone2Occupancy`, `zone2TargetCount`
        - Call `deviceEntityService.getEntityId(assignment.sensorDeviceId, 'zone2Occupancy')` → occupancy entity
        - Call `deviceEntityService.getEntityId(assignment.sensorDeviceId, 'zone2TargetCount')` → target count entity
        - If either returns null, skip that sensor for that zone (log warning)
     c. Maps room zone index (0-based, order of zones in room.zones) to `RoomDeviceDescriptor.zones[].zoneIndex`
     d. Uses `zone.aggregationMode ?? 'or'` as the aggregation mode
     e. Uses `zone.label ?? zone.id` as zoneName
     f. Returns the complete descriptor
   - `createOrUpdateRoomDevice(room: RoomConfig, assignments: ZoneAssignment[], deps: RoomDeviceLifecycleDeps): Promise<{ created: boolean, warnings: string[] }>` — orchestration function that:
     a. Calls `buildRoomDeviceDescriptor()` to build the descriptor
     b. Skips if descriptor has 0 zones with covering entities (all sensors had missing mappings)
     c. Calls `deps.roomDeviceService.createRoomDevice(descriptor)` (re-publishing updates existing)
     d. Returns created=true and any warnings from entity resolution
   - `removeRoomDevice(room: RoomConfig, deps: { roomDeviceService: RoomDeviceService }): Promise<void>` — calls `removeRoomDevice(room.id, room.zones.length)`

2. **Entity key derivation from SlotId** — critical mapping:
   - SlotId `zone1` → entity keys `zone1Occupancy`, `zone1TargetCount` (1-based, matching device profile convention)
   - SlotId `zone2` → `zone2Occupancy`, `zone2TargetCount`
   - SlotId `exclusion1`/`entry1` → skip (no occupancy/target_count entities for exclusion/entry zones)
   - Room zone index in RoomDeviceDescriptor is 0-based (matching S02 convention where `zone_0_occupancy` is the first room zone)

3. **Create unit test file `backend/src/__tests__/unit/roomDeviceLifecycle.test.ts`** — at least 12 tests:
   - Builds correct descriptor for single zone + single sensor
   - Builds correct descriptor for multiple zones + single sensor
   - Builds correct descriptor for single zone + multiple covering sensors (entities aggregated)
   - Uses zone.aggregationMode when present, defaults to 'or' when absent
   - Uses zone.label as zoneName, falls back to zone.id
   - Skips sensors with missing entity mappings (warning logged, not thrown)
   - Skips exclusion/entry slot assignments (no occupancy entities)
   - Returns empty zones array when all entity lookups fail
   - createOrUpdateRoomDevice calls roomDeviceService.createRoomDevice with built descriptor
   - createOrUpdateRoomDevice skips when no zones have covering entities
   - removeRoomDevice calls roomDeviceService.removeRoomDevice with correct roomId and zoneCount
   - EP One sensor assignments (if any leak through) produce no entity lookups

## Must-Haves

- [ ] `buildRoomDeviceDescriptor` correctly groups multi-sensor assignments by room zone
- [ ] Entity key derivation from SlotId uses 1-based keys (`zone1Occupancy` etc.)
- [ ] Room zone indices in descriptor are 0-based
- [ ] Missing entity mappings produce warnings, not errors
- [ ] Aggregation mode defaults to `'or'` when zone has no `aggregationMode`
- [ ] ≥12 unit tests passing

## Negative Tests

- **Malformed inputs**: ZoneAssignment with unknown slotId format, zone with no matching assignment
- **Error paths**: deviceEntityService.getEntityId returns null for all sensors, RoomDeviceService.createRoomDevice throws
- **Boundary conditions**: empty assignments array, single zone with single sensor, zone with only exclusion assignments (no occupancy entities)

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts` — RoomDeviceService class and RoomDeviceDescriptor interface (S02)`
- ``everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — AggregationMode type`
- ``everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts` — ZoneAssignment and SlotId types (S01/S03)`
- ``everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts` — IDeviceEntityService, IDeviceMappingStorage, IProfileLoader interfaces`
- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — RoomConfig, Zone types with aggregationMode (from T01)`
- ``everything-presence-mmwave-configurator/backend/src/domain/deviceEntityService.ts` — getEntityId(deviceId, entityKey) method`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/domain/roomDeviceLifecycle.ts` — lifecycle orchestrator service`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceLifecycle.test.ts` — ≥12 unit tests`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/roomDeviceLifecycle.test.ts
