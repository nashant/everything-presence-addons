---
id: T03
parent: S02
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts", "everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts", "everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts", "everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts", "everything-presence-mmwave-configurator/backend/src/ha/restReadTransport.ts"]
key_decisions: ["selfEntityId for no_change_on_tie derived as binary_sensor.<unique_id> matching HA entity_id convention", "sensor target count uses unit_of_measurement 'targets'", "removeRoomDevice publishes entity empties before availability for clean HA removal ordering"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "20/20 roomDeviceService tests pass. 79/79 total S02 tests pass across all 3 test files (discoveryPayload, templateGenerator, roomDeviceService). grep confirms WsReadTransport.call() is public. Slice-level verification: discoveryPayload tests pass, mqtt dependency confirmed in package.json."
completed_at: 2026-03-31T11:00:44.627Z
blocker_discovered: false
---

# T03: Built RoomDeviceService orchestrating MQTT discovery for virtual HA room devices with 20 passing unit tests, and exposed WsReadTransport.call() on IHaReadTransport interface

> Built RoomDeviceService orchestrating MQTT discovery for virtual HA room devices with 20 passing unit tests, and exposed WsReadTransport.call() on IHaReadTransport interface

## What Happened
---
id: T03
parent: S02
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts
  - everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts
  - everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts
  - everything-presence-mmwave-configurator/backend/src/ha/restReadTransport.ts
key_decisions:
  - selfEntityId for no_change_on_tie derived as binary_sensor.<unique_id> matching HA entity_id convention
  - sensor target count uses unit_of_measurement 'targets'
  - removeRoomDevice publishes entity empties before availability for clean HA removal ordering
duration: ""
verification_result: passed
completed_at: 2026-03-31T11:00:44.627Z
blocker_discovered: false
---

# T03: Built RoomDeviceService orchestrating MQTT discovery for virtual HA room devices with 20 passing unit tests, and exposed WsReadTransport.call() on IHaReadTransport interface

**Built RoomDeviceService orchestrating MQTT discovery for virtual HA room devices with 20 passing unit tests, and exposed WsReadTransport.call() on IHaReadTransport interface**

## What Happened

Created roomDeviceService.ts that accepts a RoomDeviceDescriptor and orchestrates MqttClient, discovery payload builder, and template generator to publish retained MQTT discovery messages for virtual HA room devices. Each zone gets a binary_sensor (occupancy with Jinja2 aggregation template) and sensor (max target count). For no_change_on_tie mode, selfEntityId is derived as binary_sensor.{unique_id} matching HA's entity_id derivation. removeRoomDevice publishes empty retained payloads to clear entities, getDiscoveryTopics returns all topics for debugging. Also made WsReadTransport.call() public, added it to IHaReadTransport interface, and added a throwing stub in RestReadTransport.

## Verification

20/20 roomDeviceService tests pass. 79/79 total S02 tests pass across all 3 test files (discoveryPayload, templateGenerator, roomDeviceService). grep confirms WsReadTransport.call() is public. Slice-level verification: discoveryPayload tests pass, mqtt dependency confirmed in package.json.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/roomDeviceService.test.ts` | 0 | ✅ pass | 1700ms |
| 2 | `cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/discoveryPayload.test.ts backend/src/__tests__/unit/templateGenerator.test.ts backend/src/__tests__/unit/roomDeviceService.test.ts` | 0 | ✅ pass | 2500ms |
| 3 | `grep 'public async call' everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` | 0 | ✅ pass | 50ms |
| 4 | `grep '"mqtt"' everything-presence-mmwave-configurator/package.json` | 0 | ✅ pass | 50ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts`
- `everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts`
- `everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts`
- `everything-presence-mmwave-configurator/backend/src/ha/restReadTransport.ts`


## Deviations
None.

## Known Issues
None.
