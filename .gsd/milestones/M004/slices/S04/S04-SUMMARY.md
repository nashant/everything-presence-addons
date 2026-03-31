---
id: S04
parent: M004
milestone: M004
provides:
  - aggregationMode field on zone types (backend + frontend)
  - roomDeviceLifecycle service (buildRoomDeviceDescriptor, createOrUpdateRoomDevice, removeRoomDevice)
  - MqttClient wired into server startup
  - Apply-zones route creates/updates room devices after zone writes
  - DELETE route cleans up room devices before storage deletion
requires:
  - slice: S02
    provides: RoomDeviceService, MqttClient, MQTT discovery infrastructure
  - slice: S03
    provides: Zone assignment engine, ZoneAssignment type, OrchestratorResult
affects:
  - S05
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/roomDeviceLifecycle.ts
  - everything-presence-mmwave-configurator/backend/src/domain/types.ts
  - everything-presence-mmwave-configurator/frontend/src/api/types.ts
  - everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - everything-presence-mmwave-configurator/backend/src/index.ts
  - everything-presence-mmwave-configurator/backend/src/server.ts
  - everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceLifecycle.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/helpers/mockReadTransport.ts
key_decisions:
  - Use spread with conditional include pattern for aggregationMode in parseZone to omit undefined values
  - Simplified deps interface to IEntityResolver (getEntityId only) instead of full IDeviceEntityService/IDeviceMappingStorage/IProfileLoader
  - Exported deriveEntityKeys as standalone pure function for direct unit testing
  - Exposed assignments in OrchestratorResult instead of duplicating coverage+assignment computation in route handler
  - MQTT connection failure at startup is non-fatal — logs error and continues without room device lifecycle
patterns_established:
  - Non-fatal MQTT: when config.mqtt exists but connection fails, server runs without room device lifecycle — zone writes still work
  - Lifecycle orchestrator bridges domain services (zone assignment → room device) with clean deps injection via IEntityResolver
  - Apply-zones response includes optional roomDevice field when MQTT is available
observability_surfaces:
  - Apply-zones response includes roomDevice.warnings array when entity resolution has gaps
  - MQTT connection status logged at startup
  - Room device cleanup failures logged as warnings in DELETE route
drill_down_paths:
  - .gsd/milestones/M004/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S04/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-31T15:48:02.362Z
blocker_discovered: false
---

# S04: Room device lifecycle + aggregation config

**Full room device lifecycle: zone saves create/update virtual HA room devices with template binary sensors using configurable aggregation modes, room deletes clean up HA entities, and the pipeline gracefully degrades when MQTT is unavailable.**

## What Happened

S04 wired together S02's RoomDeviceService (MQTT discovery + template sensors) with S03's zone assignment engine into a complete lifecycle.

**T01** added the `aggregationMode` field to `ZoneRect` and `ZonePolygon` in both backend domain types and frontend API types. The rooms router's `parseZone` validates against the three legal values ('or', 'majority', 'no_change_on_tie') and omits invalid/absent values cleanly.

**T02** created `roomDeviceLifecycle.ts` — the bridge between zone assignments and RoomDeviceService. The `buildRoomDeviceDescriptor` pure function groups multi-sensor zone assignments by room zone, resolves per-sensor entity IDs via `IEntityResolver`, and produces a `RoomDeviceDescriptor` for S02's service. `deriveEntityKeys` maps slot IDs (1-based: zone1→zone1Occupancy, zone1TargetCount) to entity keys while filtering out exclusion/entry slots. Missing entity mappings produce warnings instead of errors. Default aggregation is 'or'. 25 unit tests cover all combinations: single/multi sensor, single/multi zone, aggregation modes, label fallbacks, missing entities, error propagation.

**T03** connected everything to the running server. MqttClient is created at startup when `config.mqtt` is present (non-fatal on connection failure). The apply-zones route now calls `createOrUpdateRoomDevice` after successful zone writes, returning a `roomDevice` field in the response. The DELETE route calls `removeRoomDevice` before storage deletion, with try/catch so cleanup failure doesn't block room deletion. Rather than duplicating coverage+assignment computation, T03 exposed `assignments` in `OrchestratorResult`.

**Verification fix**: Added missing `call()` method to `MockReadTransport` — the `IHaReadTransport` interface gained this method in S02 but the mock wasn't updated, causing tsc failures in integration test helpers.

## Verification

Backend tsc --noEmit: 0 errors (clean). Frontend tsc --noEmit: only pre-existing errors in unrelated files. Vitest: 271/271 non-Docker tests pass (23 Docker-only integration tests fail as expected per K007). All 25 roomDeviceLifecycle unit tests pass. All 5 roomZoneOrchestrator tests pass.

## Requirements Advanced

- R007 — aggregationMode field added to zone types and validated in parseZone; roomDeviceLifecycle passes mode to template generation, defaulting to 'or'
- R008 — buildRoomDeviceDescriptor resolves target count entity IDs per covering sensor; template generation uses max aggregation
- R009 — Full lifecycle implemented: createOrUpdateRoomDevice on zone save, removeRoomDevice on room delete, graceful degradation when MQTT unavailable
- R005 — MqttClient wired into server; apply-zones triggers MQTT discovery publish for virtual room device
- R006 — Apply-zones flow creates template binary sensors via RoomDeviceService after zone writes succeed

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

T02: Simplified RoomDeviceLifecycleDeps to IEntityResolver (getEntityId only) instead of the planned IDeviceEntityService/IDeviceMappingStorage/IProfileLoader — the lifecycle layer only needs entity ID lookup, so this is a cleaner interface. T03: Exposed assignments in OrchestratorResult instead of duplicating coverage+assignment computation in the route handler. T03: MQTT connection failure at startup is non-fatal (logs and continues) rather than the plan's suggestion of failing startup.

## Known Limitations

Integration testing of the full MQTT lifecycle (connect → publish discovery → verify HA entities) requires a running MQTT broker and HA instance, which isn't available outside Docker. The 25 unit tests verify all logic with mocks.

## Follow-ups

S05 needs to build the frontend zone coverage visualization and aggregation config UI on top of the backend infrastructure S04 provides.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/domain/types.ts` — Added aggregationMode?: AggregationMode to ZoneRect and ZonePolygon interfaces
- `everything-presence-mmwave-configurator/frontend/src/api/types.ts` — Added aggregationMode?: literal union to ZoneRect and ZonePolygon interfaces
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — parseZone validates aggregationMode; apply-zones calls createOrUpdateRoomDevice; DELETE calls removeRoomDevice
- `everything-presence-mmwave-configurator/backend/src/domain/roomDeviceLifecycle.ts` — New file: lifecycle orchestrator bridging zone assignments to RoomDeviceService
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceLifecycle.test.ts` — New file: 25 unit tests for lifecycle service
- `everything-presence-mmwave-configurator/backend/src/index.ts` — MqttClient creation and connection at startup when config.mqtt present
- `everything-presence-mmwave-configurator/backend/src/server.ts` — Added mqttClient to ServerDependencies and RoomsRouterDependencies
- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts` — Exposed assignments in OrchestratorResult
- `everything-presence-mmwave-configurator/backend/src/__tests__/helpers/mockReadTransport.ts` — Added missing call() method to satisfy IHaReadTransport interface
