---
id: T04
parent: S02
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts"]
key_decisions: ["Entity IDs derived from object_id (e.g. binary_sensor.zone_0_occupancy) not unique_id — matches HA MQTT discovery behavior", "Pre-cleanup in beforeAll ensures idempotent test runs even if a prior run left stale entities"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "All slice-level and task-level checks pass: 168/168 unit tests pass across 6 files, integration test passes with full lifecycle verified against live HA (create → verify → remove → verify removal in 6s), mqtt dependency confirmed in package.json."
completed_at: 2026-03-31T11:20:26.076Z
blocker_discovered: false
---

# T04: Created integration test proving full MQTT discovery lifecycle — device creation, entity registration, and cleanup removal — verified against live HA instance via Docker dev stack

> Created integration test proving full MQTT discovery lifecycle — device creation, entity registration, and cleanup removal — verified against live HA instance via Docker dev stack

## What Happened
---
id: T04
parent: S02
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts
key_decisions:
  - Entity IDs derived from object_id (e.g. binary_sensor.zone_0_occupancy) not unique_id — matches HA MQTT discovery behavior
  - Pre-cleanup in beforeAll ensures idempotent test runs even if a prior run left stale entities
duration: ""
verification_result: passed
completed_at: 2026-03-31T11:20:26.076Z
blocker_discovered: false
---

# T04: Created integration test proving full MQTT discovery lifecycle — device creation, entity registration, and cleanup removal — verified against live HA instance via Docker dev stack

**Created integration test proving full MQTT discovery lifecycle — device creation, entity registration, and cleanup removal — verified against live HA instance via Docker dev stack**

## What Happened

Built an integration test at backend/src/__tests__/integration/roomDevice.test.ts that exercises the complete room device lifecycle against the real Docker dev stack (HA + Mosquitto). The test probes MQTT broker reachability and resolves the HA token from the Docker shared volume — skips gracefully if either is unavailable. It publishes MQTT discovery messages for a hardcoded "Bedroom" room with 2 zones (OR and majority aggregation), verifies the device and 4 entities appear in HA registries, publishes removal messages, and verifies cleanup. Key discovery: HA derives entity_id from object_id not unique_id, so expected entity IDs were corrected accordingly.

## Verification

All slice-level and task-level checks pass: 168/168 unit tests pass across 6 files, integration test passes with full lifecycle verified against live HA (create → verify → remove → verify removal in 6s), mqtt dependency confirmed in package.json.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run src/__tests__/unit/` | 0 | ✅ pass | 3200ms |
| 2 | `npx vitest run src/__tests__/unit/discoveryPayload.test.ts` | 0 | ✅ pass | 300ms |
| 3 | `npx vitest run src/__tests__/integration/roomDevice.test.ts` | 0 | ✅ pass | 12700ms |
| 4 | `grep '"mqtt"' package.json` | 0 | ✅ pass | 50ms |


## Deviations

Expected entity IDs corrected from ep_room_bedroom_01_zone_X_* to zone_X_* because HA derives entity_id from object_id field. HA base URL uses port 18123 matching dev stack docker-compose mapping.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts`


## Deviations
Expected entity IDs corrected from ep_room_bedroom_01_zone_X_* to zone_X_* because HA derives entity_id from object_id field. HA base URL uses port 18123 matching dev stack docker-compose mapping.

## Known Issues
None.
