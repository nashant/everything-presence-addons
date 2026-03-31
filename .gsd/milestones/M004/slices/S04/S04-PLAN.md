# S04: Room device lifecycle + aggregation config

**Goal:** Full room device lifecycle: zone save creates/updates virtual HA room device with template binary sensors using correct aggregation modes. Room delete cleans up HA entities. Aggregation strategy configurable per zone (OR/majority/no-change-on-tie). Target count uses max across covering sensors.
**Demo:** After this: Full pipeline: zone save creates/updates HA room device with template binary sensors. Aggregation strategy configurable per zone (OR/majority/no-change-on-tie). Room delete cleans up HA entities. Target count uses max.

## Tasks
- [x] **T01: Added aggregationMode field to ZoneRect/ZonePolygon in backend and frontend types, with whitelist validation in parseZone** — Add the `aggregationMode` field to Zone types in both backend and frontend so zones can carry their aggregation strategy. Update the rooms router parseZone to preserve the field through normalization. This is a small foundational change that unblocks T02 and T03.

## Steps

1. **Backend types** (`backend/src/domain/types.ts`): Import `AggregationMode` from `../ha/templateGenerator`. Add `aggregationMode?: AggregationMode` to both `ZoneRect` and `ZonePolygon` interfaces.

2. **Frontend types** (`frontend/src/api/types.ts`): Add `aggregationMode?: 'or' | 'majority' | 'no_change_on_tie'` to both `ZoneRect` and `ZonePolygon` interfaces. Do NOT import from backend — duplicate the literal union type to keep frontend self-contained.

3. **parseZone in rooms router** (`backend/src/routes/rooms.ts`): In the `parseZone` function, extract `aggregationMode` from the input, validate it against the three valid values (`'or'`, `'majority'`, `'no_change_on_tie'`), and include it on the returned zone object. Invalid/missing values should be omitted (will default to `'or'` at template generation time in T02).

4. **Type check both sides**:
   - `cd backend && npx tsc --noEmit` — 0 new errors from S04 files
   - `cd frontend && npx tsc --noEmit` — 0 new errors from S04 files

## Must-Haves

- [ ] `aggregationMode?: AggregationMode` on `ZoneRect` and `ZonePolygon` in backend types
- [ ] `aggregationMode?: 'or' | 'majority' | 'no_change_on_tie'` on `ZoneRect` and `ZonePolygon` in frontend types
- [ ] `parseZone` preserves valid `aggregationMode` values, omits invalid ones
- [ ] Both `tsc --noEmit` checks pass with 0 new errors
  - Estimate: 20m
  - Files: everything-presence-mmwave-configurator/backend/src/domain/types.ts, everything-presence-mmwave-configurator/frontend/src/api/types.ts, everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - Verify: cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
- [ ] **T02: Build room device lifecycle orchestrator with unit tests** — Create the core service that bridges S03's zone assignment results with S02's RoomDeviceService. The lifecycle orchestrator takes a RoomConfig + zone assignments, resolves per-device zone entity IDs, builds a `RoomDeviceDescriptor`, and calls `createRoomDevice()`. This is the riskiest piece of S04 — all integration logic lives here.

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
  - Estimate: 1h30m
  - Files: everything-presence-mmwave-configurator/backend/src/domain/roomDeviceLifecycle.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceLifecycle.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/roomDeviceLifecycle.test.ts
- [ ] **T03: Wire MqttClient into server and integrate lifecycle into routes** — Connect the lifecycle orchestrator to the running server: instantiate MqttClient at startup, extend RoomsRouterDependencies, hook room device creation into the apply-zones flow, and add cleanup to the DELETE route.

## Steps

1. **MqttClient in `index.ts`** (`backend/src/index.ts`): After creating readTransport and profileLoader, check `config.mqtt`. If present, create a `MqttClient(config.mqtt)`, call `await mqttClient.connect()`, and log success. If MQTT config is absent, log info and continue without MQTT — room device lifecycle will be a no-op. Pass mqttClient into `createServer` deps.

2. **Extend ServerDependencies and RoomsRouterDependencies** (`backend/src/server.ts`, `backend/src/routes/rooms.ts`):
   - Add `mqttClient?: MqttClient` and `readTransport?: IHaReadTransport` to `RoomsRouterDependencies`
   - In `createServer`, pass `mqttClient: deps?.mqttClient` and `readTransport: deps?.readTransport` into roomsDeps
   - Add `mqttClient?: MqttClient` to `ServerDependencies`
   - In `index.ts`, include mqttClient in the deps passed to `createServer`

3. **Lifecycle integration in apply-zones route** (`backend/src/routes/rooms.ts`):
   - After the existing `orchestrator.applyRoomZones(room)` call succeeds, check if `deps.mqttClient` is available
   - If yes: import and call `createOrUpdateRoomDevice(room, assignmentResults, lifecycleDeps)` where assignmentResults come from the orchestrator result's assignment data
   - The apply-zones route currently returns the orchestrator result — extend the response to include `roomDevice: { created: boolean, warnings: string[] }` or `roomDevice: null` when MQTT unavailable
   - **Key detail**: The orchestrator result doesn't directly expose `ZoneAssignment[]` — it returns `DeviceWriteResult[]` with `assignedZoneIds`. The lifecycle orchestrator needs the full assignment data. Solution: run `assignZonesToDevices` in the route handler (or refactor to expose assignments). Better approach: run the zone assignment engine directly in the route to get both the write results AND the assignment data, then pass assignments to the lifecycle orchestrator.
   - **Revised approach**: Import `computeAllCoverage` and `assignZonesToDevices` into the route handler. After the existing orchestrator call, run assignment independently to get `ZoneAssignment[]` for the lifecycle orchestrator. This avoids modifying the existing orchestrator's return type. The coverage + assignment computation is pure and fast — running it twice is fine.

4. **DELETE route cleanup** (`backend/src/routes/rooms.ts`):
   - In the DELETE handler, before calling `storage.deleteRoom()`, capture `room.zones.length`
   - If `deps.mqttClient` is available, create `RoomDeviceService` and call `removeRoomDevice(roomId, zoneCount)`
   - Wrap in try/catch — cleanup failure should not prevent room deletion (log warning, continue)

5. **Type check + full test suite**:
   - `cd backend && npx tsc --noEmit` — 0 new errors
   - `npx vitest run` — ≥246 tests passing, 0 regressions

## Must-Haves

- [ ] MqttClient created and connected at startup when `config.mqtt` present
- [ ] Server starts normally when `config.mqtt` is absent (no MQTT, no crash)
- [ ] Apply-zones triggers room device creation after successful zone writes
- [ ] DELETE route cleans up room device before removing from storage
- [ ] Cleanup failure in DELETE is non-fatal (logs warning, room still deleted)
- [ ] All 246+ existing tests still pass

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MQTT broker | Log error, skip room device creation — zone writes still succeed | MqttClient.connect() has 10s timeout, server startup fails if MQTT configured but unreachable | N/A — we control the publish payload |
| deviceEntityService.getEntityId | Returns null → skip that sensor → warning in response | N/A (synchronous lookup) | N/A |
| RoomDeviceService.createRoomDevice | Catch, log error, include in response warnings — zone writes already succeeded | MQTT publish timeout from underlying client | N/A |
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/index.ts, everything-presence-mmwave-configurator/backend/src/server.ts, everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - Verify: cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit && cd .. && npx vitest run
