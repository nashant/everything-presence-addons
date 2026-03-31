---
id: S02
parent: M004
milestone: M004
provides:
  - MqttClient service wrapper (connect/publish/disconnect/isConnected)
  - Discovery payload builder (sanitizeForMqtt, discoveryTopic, buildRoomDeviceBlock, buildBinarySensorDiscovery, buildSensorDiscovery)
  - Template generator (generateOrTemplate, generateMajorityTemplate, generateNoChangeOnTieTemplate, generateMaxTargetCountTemplate, generateTemplate dispatcher, AggregationMode type)
  - RoomDeviceService (createRoomDevice, removeRoomDevice, getDiscoveryTopics) with RoomDeviceDescriptor interface
  - IHaReadTransport.call() for arbitrary WS API commands (exposed from WsReadTransport)
requires:
  []
affects:
  - S04
key_files:
  - everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts
  - everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts
  - everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts
  - everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts
  - everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts
  - everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/discoveryPayload.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts
key_decisions:
  - D012: MQTT topic namespace ep_room/ for room devices, distinct from ep_mock/
  - D013: HA entity_id derived from object_id not unique_id in MQTT discovery
  - sanitizeForMqtt returns 'unnamed' for degenerate inputs rather than throwing
  - Majority aggregation uses float division (count > N/2) for correct odd-count resolution
  - No-change-on-tie uses states() with default('OFF', true) for self-reference fallback
  - generateMaxTargetCountTemplate excluded from AggregationMode dispatcher — called directly by orchestration
  - selfEntityId for no_change_on_tie derived as binary_sensor.<unique_id> matching HA convention
  - removeRoomDevice publishes entity empties before availability for clean HA teardown ordering
patterns_established:
  - Pure-function payload/template builders with service orchestrator pattern: discoveryPayload.ts and templateGenerator.ts are stateless pure functions, roomDeviceService.ts orchestrates them with MqttClient
  - RoomDeviceDescriptor as the interface contract between zone assignment (S01/S03) and HA device creation (S02/S04)
  - Integration test pattern: probe infra reachability (MQTT, HA), skip gracefully if unavailable, pre-cleanup for idempotent runs, wait for HA processing between publish and verify
observability_surfaces:
  - pino structured logs for room device create/remove with roomId, zoneCount, topic list
  - getDiscoveryTopics() returns all MQTT topics for a room — can be used for broker inspection
  - Integration test output shows exactly which entities were found/missing in HA registries
drill_down_paths:
  - .gsd/milestones/M004/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T03-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-31T11:23:42.115Z
blocker_discovered: false
---

# S02: HA room device + template sensor creation proof

**Built and proved the complete HA virtual room device pipeline — MQTT discovery, Jinja2 template generation for all aggregation modes, RoomDeviceService orchestration, and live integration test against Docker dev stack — with 79 unit tests and a full create/verify/remove lifecycle confirmed against real HA.**

## What Happened

S02 delivered the HA integration layer that creates virtual room devices with aggregated zone sensors. Four tasks built a layered architecture from bottom to top:

**T01 (MqttClient + discovery payloads):** Added mqtt@^5.15.1 dependency and created two foundational modules — MqttClient wrapper (connect/publish/disconnect/isConnected following the HaWriteClient pattern) and discovery payload builder (pure functions for sanitization, topic construction, device blocks, binary_sensor and sensor payloads). Topic namespace uses `ep_room/` prefix distinct from `ep_mock/`. sanitizeForMqtt returns 'unnamed' for empty/all-special-char inputs. 32 unit tests cover all edge cases.

**T02 (Jinja2 template generator):** Created templateGenerator.ts as a pure-function module generating Jinja2 value_template strings for all four aggregation strategies: OR (is_state chains), majority (states() list with count comparison using float division), no-change-on-tie (self-reference fallback via states() with default('OFF', true)), and max target count (states()|int(0) list piped through |max). AggregationMode type exported. Single-sensor and empty-list degenerate cases produce simplified templates. 27 unit tests.

**T03 (RoomDeviceService + WsReadTransport.call()):** Created the orchestration service that accepts a RoomDeviceDescriptor (roomId, roomName, zones with covering sensor entity IDs and aggregation mode) and publishes retained MQTT discovery messages to create binary_sensor (occupancy) and sensor (target count) entities grouped under a single virtual device. Cleanup publishes empties in entity-before-availability order. Also exposed WsReadTransport.call() as public on IHaReadTransport interface (with throwing stub in RestReadTransport) for S04's template helper creation needs. 20 unit tests with mocked MqttClient.

**T04 (Integration test):** Built a lifecycle integration test against the real Docker dev stack (HA + Mosquitto). Publishes discovery for a hardcoded 2-zone "Bedroom" room with OR and majority aggregation, verifies device and 4 entities appear in HA registries, publishes removal, verifies cleanup. Key discovery: HA derives entity_id from object_id not unique_id — corrected expected IDs accordingly. Test skips gracefully when Docker stack is unavailable. Pre-cleanup in beforeAll ensures idempotent runs.

## Verification

**Unit tests (79/79 pass):**
- discoveryPayload.test.ts: 32 tests — sanitization, topic formatting, payload structure, device grouping, negative cases
- templateGenerator.test.ts: 27 tests — all aggregation modes, degenerate cases, dispatcher routing, empty lists
- roomDeviceService.test.ts: 20 tests — create/remove lifecycle, mocked MqttClient publish tracking, empty zones

**Full regression (168/168 pass):** All 6 unit test files (S01 + S02) pass together — no cross-slice regressions.

**Integration test (Docker dev stack):** Full lifecycle: create room device → wait → verify device in HA registry → verify 4 entities (2 binary_sensor occupancy + 2 sensor target_count) → remove → verify cleanup. Passes in ~6s against live HA.

**Structural checks:**
- `grep '"mqtt"' package.json` → `"mqtt": "^5.15.1"` confirmed
- `grep 'public async call' wsReadTransport.ts` → visibility change confirmed
- `grep 'call(' readTransport.ts` → interface method confirmed
- All 4 source files exist: mqttClient.ts, discoveryPayload.ts, templateGenerator.ts, roomDeviceService.ts

## Requirements Advanced

- R005 — MQTT discovery creates virtual HA room device with correct identifier, verified in HA device registry via integration test
- R006 — Template binary sensors and sensor entities created via MQTT discovery with Jinja2 value_templates implementing aggregation logic, verified in HA entity registry
- R007 — Jinja2 template generators implemented and tested for all three aggregation strategies (OR, majority, no-change-on-tie) plus max target count
- R008 — generateMaxTargetCountTemplate produces Jinja2 using states()|int(0) list piped through |max filter, verified with unit tests

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

T04 corrected expected entity IDs from ep_room_bedroom_01_zone_X_* to zone_X_* because HA derives entity_id from object_id field, not unique_id. HA base URL uses port 18123 matching dev stack docker-compose port mapping. Test file paths use backend/src/ prefix matching existing test convention.

## Known Limitations

Template sensors not yet created via WS API (deferred to S04 — this slice proves MQTT discovery and template generation work; S04 combines them with zone assignment to create the full pipeline). Integration test requires Docker dev stack running — skips gracefully otherwise.

## Follow-ups

S04 needs to build the full pipeline: zone save → zone assignment → coordinate transform → per-device writes → room device creation with template sensors via WS API. S04 should use RoomDeviceDescriptor as its interface contract with this slice. The entity_id derivation from object_id (K008) is critical for S04's entity lookup logic.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts` — New: MqttClient service wrapper with connect/publish/disconnect/isConnected
- `everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts` — New: Pure-function MQTT discovery payload builder for HA room devices
- `everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — New: Jinja2 template generators for all aggregation modes (OR, majority, no-change-on-tie, max target count)
- `everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts` — New: Orchestration service for creating/removing virtual HA room devices via MQTT discovery
- `everything-presence-mmwave-configurator/backend/src/ha/types.ts` — Modified: Added MqttConfig interface
- `everything-presence-mmwave-configurator/backend/src/config.ts` — Modified: Added optional mqtt config from MQTT_BROKER_URL env var
- `everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` — Modified: Made call() public
- `everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts` — Modified: Added call() to IHaReadTransport interface
- `everything-presence-mmwave-configurator/backend/src/ha/restReadTransport.ts` — Modified: Added throwing call() stub
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/discoveryPayload.test.ts` — New: 32 unit tests for discovery payload builder
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts` — New: 27 unit tests for template generator
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts` — New: 20 unit tests for room device service
- `everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts` — New: Integration test for full MQTT discovery lifecycle against live HA
