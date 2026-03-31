# S04: Room device lifecycle + aggregation config — Research

**Date:** 2026-03-30

## Summary

S04 wires together S02's HA device creation pipeline (MqttClient, RoomDeviceService, templateGenerator) with S03's zone orchestration (RoomZoneOrchestrator, zone assignment, coordinate transforms) into a complete room device lifecycle. The work is primarily backend orchestration — no fundamentally new technology. The key integration challenge is building the `RoomDeviceDescriptor` from zone assignment results, resolving per-device zone entity IDs for templates, adding aggregation mode to the Zone type, and hooking lifecycle management into both the save and delete paths.

The server bootstrap (`index.ts`) currently never instantiates `MqttClient` despite S02 creating the class and `config.ts` loading `MQTT_BROKER_URL`. S04 must wire this up: create MqttClient at startup, pass it (plus readTransport) into the rooms router or a new lifecycle service. Room delete needs a new hook to call `RoomDeviceService.removeRoomDevice()`. The aggregation mode defaults to `'or'` and is stored per-zone on the Zone type — both backend and frontend types need the new field.

## Recommendation

Build in three layers: (1) Type changes + aggregation storage, (2) lifecycle orchestrator service that bridges S02 + S03 outputs, (3) server wiring + route integration. The lifecycle orchestrator is the riskiest piece — it must map zone assignments to entity IDs, build the RoomDeviceDescriptor, and manage create/update/cleanup transitions. Start there.

## Implementation Landscape

### Key Files

- `backend/src/domain/types.ts` — Add `aggregationMode?: AggregationMode` to both `ZoneRect` and `ZonePolygon` interfaces. Import type from `ha/templateGenerator.ts`.
- `frontend/src/api/types.ts` — Mirror the `aggregationMode` field on frontend Zone types.
- `backend/src/ha/roomDeviceService.ts` — Already complete from S02. `createRoomDevice(descriptor)` and `removeRoomDevice(roomId, zoneCount)` are ready to use.
- `backend/src/ha/templateGenerator.ts` — Already complete from S02. All aggregation modes implemented with full test coverage.
- `backend/src/domain/roomZoneOrchestrator.ts` — S03's orchestrator handles zone assignment + writes. S04 needs a *separate* lifecycle orchestrator (or extension) that takes the assignment results and feeds them into RoomDeviceService.
- `backend/src/domain/deviceEntityService.ts` — `getEntityId(deviceId, entityKey)` resolves mapped entity IDs. Entity keys follow patterns: `zone{N}Occupancy` → `binary_sensor.xxx_zone_N_occupancy`, `zone{N}TargetCount` → `sensor.xxx_zone_N_target_count`. The slot index N is 1-based and matches the SlotId (e.g., `zone1` → key `zone1Occupancy`).
- `backend/src/ha/mqttClient.ts` — Already complete from S02. Needs to be instantiated in `index.ts` and passed through deps.
- `backend/src/index.ts` — Add MqttClient creation + connect when `config.mqtt` is present. Pass through to server deps.
- `backend/src/server.ts` — Add mqttClient + readTransport to RoomsRouterDependencies so the lifecycle service can be constructed in the route handler.
- `backend/src/routes/rooms.ts` — Hook into both save (POST/PUT + apply-zones) and delete (DELETE) routes. On save with zones+sensors: run zone orchestration then create/update room device. On delete: remove room device.
- `backend/src/config/storage.ts` — Read-only for S04. `deleteRoom()` just removes from JSON — the route handler needs to call cleanup before deletion.
- `frontend/src/pages/RoomBuilderPage.tsx` — `handleSaveRoom` already calls `applyRoomZones()` after save. S04 extends the apply-zones endpoint to also handle room device lifecycle, so no frontend save changes needed. The aggregation mode will be settable per zone (S05 adds UI, but S04 just needs the field and a default).

### Entity ID Resolution Pattern

For building `RoomDeviceDescriptor.zones[].coveringSensorEntities`:
1. Zone assignment gives `ZoneAssignment { zoneId, sensorDeviceId, slotId }` — e.g., slotId = `zone2`
2. From slotId `zone2`, derive entity keys: `zone2Occupancy`, `zone2TargetCount`
3. Call `deviceEntityService.getEntityId(sensorDeviceId, 'zone2Occupancy')` → `binary_sensor.mock_ep_lite_1_zone_2_occupancy`
4. Call `deviceEntityService.getEntityId(sensorDeviceId, 'zone2TargetCount')` → `sensor.mock_ep_lite_1_zone_2_target_count`
5. Group by room zone: multiple sensors covering the same room zone contribute to the same coveringSensorEntities arrays.

### Build Order

1. **Types first:** Add `aggregationMode` to Zone types (backend + frontend). Quick, unblocks everything.
2. **Room lifecycle orchestrator:** New service/function that takes a `RoomConfig` + zone assignment results and builds the `RoomDeviceDescriptor`, then calls `RoomDeviceService.createRoomDevice()`. Must handle: entity ID lookup from assignment slots, zone index mapping, default aggregation mode (`'or'`), empty/no-sensor cases. This is the core of S04.
3. **Server wiring:** Add MqttClient + readTransport to server deps. Instantiate in `index.ts` when MQTT config available.
4. **Route integration:** Extend the apply-zones flow to also call room device creation after zone writes succeed. Add cleanup to DELETE route.
5. **Tests:** Unit tests for the lifecycle orchestrator (mocked deps). Verifying correct descriptor construction is the primary risk area.

### Verification Approach

- `npx vitest run` from `backend/` — all existing 246 tests must still pass
- New unit tests: lifecycle orchestrator builds correct RoomDeviceDescriptor from zone assignments
- New unit tests: entity ID resolution from slot IDs
- New unit tests: room delete triggers removeRoomDevice
- New unit tests: default aggregation mode applied when zone has none
- `npx tsc --noEmit` from `backend/` and `frontend/` — no new type errors
- Integration test (optional, Docker-dependent): full save → verify HA device → delete → verify cleanup

## Constraints

- Entity keys are 1-based (`zone1Occupancy`, not `zone0Occupancy`) but zoneIndex in RoomDeviceDescriptor is 0-based. The slot-to-key mapping needs this translation.
- `MqttClient.connect()` is async and must complete before any publish. Server startup must await it.
- `RoomDeviceService.removeRoomDevice()` needs `zoneCount` — must know how many zones the room had when created. Use `room.zones.length` from storage before deletion.
- EP One devices (maxZones=0) produce no zone assignments and must not generate entity ID lookups.
- `deviceEntityService.getEntityId()` returns `null` if no mapping exists — the lifecycle orchestrator must handle missing mappings gracefully (skip that sensor, warn).
- Per K008: HA derives entity_id from `object_id`, not `unique_id`. The discovery payloads already handle this correctly in S02's code.
- Per K012: `npx tsc --noEmit` must run from `backend/` or `frontend/` subdirectory, not monorepo root.

## Common Pitfalls

- **SlotId to entity key off-by-one** — SlotId is `zone1` (1-based), zoneIndex in RoomDeviceDescriptor is 0-based. The entity key derivation uses the slot number directly (`zone1Occupancy`), but the descriptor's zoneIndex for the room-level aggregated zone should be 0-based (matching S02's convention where `zone_0_occupancy` is the first room zone). Don't conflate device slot indices with room zone indices.
- **Missing entity mappings** — A device might have been added to the room but never gone through entity discovery. `getEntityId()` will return null. The orchestrator must skip sensors with unresolved entity mappings rather than throwing.
- **MQTT not configured** — `config.mqtt` is optional. When absent, room device lifecycle should be a no-op (same pattern as S03's 503 for missing HA deps). Don't crash on startup if MQTT broker is unavailable.
- **Zone aggregation mode parsing** — The rooms router `normalizeRoom()` doesn't currently preserve `aggregationMode` on zones. The `parseZone()` function must be updated to pass through the new field.

## Open Risks

- **readTransport.call() for WS API template helpers**: S02's S04-SUMMARY mentions WS API template creation was deferred to S04, but the S04 roadmap demo text says "template binary sensors" — however, the current S02 implementation already creates template-like MQTT discovery entities with `value_template` in the payload. These are MQTT-based sensors with Jinja2 templates, NOT HA template helpers created via WS API. This may be sufficient and the WS API template creation path may not be needed. Clarify: are MQTT discovery `value_template` entities equivalent to HA template helpers for this use case? Based on S02's integration test, yes — HA evaluates the value_template in the discovery payload just like a template helper. So WS API template creation is likely unnecessary.
- **Update semantics**: When zones change (add/remove/modify), the room device must be updated. Since MQTT discovery uses retained messages, re-publishing all discovery payloads for the room effectively updates. Removed zones need their discovery topics cleared. If zone count decreases, we need to remove old zone entity topics — this means tracking the previous zone count or always clearing a known max range.