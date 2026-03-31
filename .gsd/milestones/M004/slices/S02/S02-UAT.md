# S02: HA room device + template sensor creation proof — UAT

**Milestone:** M004
**Written:** 2026-03-31T11:23:42.115Z

## UAT: S02 — HA Room Device + Template Sensor Creation Proof

### Preconditions
- Docker dev stack running: `cd dev && docker compose -f docker-compose.dev.yaml up -d --build`
- HA accessible at http://localhost:18123
- Mosquitto MQTT broker accessible at localhost:1883
- Node.js 20+ with npm dependencies installed in `everything-presence-mmwave-configurator/`

---

### Test 1: Unit Tests — Discovery Payload Builder (32 tests)

**Steps:**
1. Run: `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/discoveryPayload.test.ts`

**Expected:** 32/32 tests pass. Covers:
- sanitizeForMqtt with special chars, spaces, slashes, MQTT wildcards (+, #), empty strings, all-special-char inputs (returns 'unnamed')
- discoveryTopic format: `homeassistant/{component}/{nodeId}/{objectId}/config`
- buildRoomDeviceBlock output: correct identifiers, name, manufacturer, model
- buildBinarySensorDiscovery: unique_id, object_id, name, device, device_class:occupancy, state_topic, payload_on/off, value_template, availability_topic
- buildSensorDiscovery: target count entities with correct unit_of_measurement
- Device grouping: all payloads share identical device identifiers for same room

---

### Test 2: Unit Tests — Template Generator (27 tests)

**Steps:**
1. Run: `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/templateGenerator.test.ts`

**Expected:** 27/27 tests pass. Covers:
- OR mode: 1/2/3 sensors — `is_state()` calls joined with `or`
- Majority mode: 1/2/3/4 sensors — states() list, select('eq','on'), count > N/2
- No-change-on-tie: 2/3 sensors — self-reference fallback via states() with default('OFF', true)
- Max target count: 1/2/3 sensors — states()|int(0) list with |max filter
- Empty sensor list: all modes return sensible 'OFF' or '0' fallback
- Dispatcher: generateTemplate() routes to correct generator per AggregationMode
- Negative: no-change-on-tie without selfEntityId throws

---

### Test 3: Unit Tests — Room Device Service (20 tests)

**Steps:**
1. Run: `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomDeviceService.test.ts`

**Expected:** 20/20 tests pass. Covers:
- createRoomDevice with 2-zone descriptor: correct publish count (availability + 2 binary_sensors + 2 sensors = 5 publishes)
- Each publish topic matches `homeassistant/{component}/ep_room_{roomId}/{objectId}/config`
- Each payload contains correct value_template from template generator
- All payloads share device identifiers for room device grouping
- removeRoomDevice publishes empty retained payloads to all config topics
- getDiscoveryTopics returns expected topic list
- Empty zones array: only availability topic published

---

### Test 4: Full Unit Regression (168 tests)

**Steps:**
1. Run: `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/`

**Expected:** 168/168 tests pass across 6 test files (S01: coordinateTransform, zoneCoverage, zoneAssignment; S02: discoveryPayload, templateGenerator, roomDeviceService). No cross-slice regressions.

---

### Test 5: Integration Test — MQTT Discovery Lifecycle (requires Docker dev stack)

**Preconditions:** Docker dev stack must be running with HA and Mosquitto accessible.

**Steps:**
1. Run: `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/integration/roomDevice.test.ts`

**Expected:**
- Test connects to MQTT broker at localhost:1883
- Publishes discovery messages for "Bedroom" room with 2 zones (OR + majority aggregation)
- After ~2s, verifies in HA:
  - Device with identifier `ep_room_bedroom_01` exists in device registry
  - 4 entities exist: `binary_sensor.zone_0_occupancy`, `binary_sensor.zone_1_occupancy`, `sensor.zone_0_target_count`, `sensor.zone_1_target_count`
- Publishes removal messages (empty retained payloads)
- After ~2s, verifies entities removed from HA registries
- Total runtime ~6s

**Graceful skip:** If Docker dev stack is not running, test suite skips entirely with descriptive message — not a failure.

---

### Test 6: Structural Verification

**Steps:**
1. Run: `grep '"mqtt"' everything-presence-mmwave-configurator/package.json`
2. Run: `grep 'public async call' everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts`
3. Run: `grep 'call(' everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts`

**Expected:**
1. Output contains `"mqtt": "^5.15.1"` — dependency added
2. Output contains `public async call(command: Record<string, unknown>): Promise<unknown>` — WsReadTransport.call() is public
3. Output contains `call(command: Record<string, unknown>): Promise<unknown>;` — method on IHaReadTransport interface

---

### Edge Cases Verified by Unit Tests

| Edge Case | Where Tested | Expected Behavior |
|-----------|-------------|-------------------|
| sanitizeForMqtt with empty string | discoveryPayload.test.ts | Returns 'unnamed' |
| sanitizeForMqtt with only MQTT wildcards (+, #) | discoveryPayload.test.ts | Returns 'unnamed' |
| Empty sensor entity list for all aggregation modes | templateGenerator.test.ts | OR/majority/no-change-on-tie return 'OFF', max returns '0' |
| Single sensor — degenerate case | templateGenerator.test.ts | Simplified direct is_state()/states() call without list construction |
| No-change-on-tie without selfEntityId | templateGenerator.test.ts | Throws error |
| Room with no zones | roomDeviceService.test.ts | Only availability topic published |
| Very long room/zone names | discoveryPayload.test.ts | sanitizeForMqtt truncates/sanitizes safely |
