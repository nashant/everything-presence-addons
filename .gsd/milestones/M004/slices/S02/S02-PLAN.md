# S02: HA room device + template sensor creation proof

**Goal:** Prove MQTT discovery creates a virtual HA room device with binary sensor entities whose Jinja2 value_templates implement occupancy aggregation referencing EP sensor zone entities. Prove the template generator produces correct Jinja2 for all aggregation strategies (OR, majority, no-change-on-tie, max target count).
**Demo:** After this: A hardcoded test room creates a virtual HA device via MQTT discovery. Template binary sensors created via WS API appear in HA device registry with correct Jinja2 templates referencing EP sensor zone entities.

## Tasks
- [x] **T01: Added mqtt v5.x dependency, MqttClient service wrapper, and discovery payload builder with 32 passing unit tests** — ## Description

Add the `mqtt` npm package (v5.x, same as mock-devices) to the backend and create two foundational modules:

1. **MqttClient** (`backend/src/ha/mqttClient.ts`) — A thin wrapper around the `mqtt` package that manages broker connection, publish with retain, and disconnect. Follows the same service pattern as `HaWriteClient`: constructor takes config, exposes `connect()`, `disconnect()`, `publish()`, and `isConnected`. The config should accept `brokerUrl` string (e.g., `mqtt://mosquitto:1883`).

2. **Discovery payload builder** (`backend/src/ha/discoveryPayload.ts`) — Functions that build MQTT discovery message payloads for HA, following the exact pattern from `dev/mock-devices/src/index.ts` `buildDiscoveryPayload()`. Key functions:
   - `buildRoomDeviceBlock(roomId, roomName)` → the `device` object shared across all entities (identifiers, name, manufacturer, model)
   - `buildBinarySensorDiscovery(roomId, roomName, zoneId, zoneName, valueTemplate, deviceBlock)` → complete discovery payload for a binary_sensor with `value_template`, `device_class: occupancy`, `state_topic`, `payload_on/off`, `availability_topic`
   - `buildSensorDiscovery(roomId, roomName, zoneId, zoneName, valueTemplate, deviceBlock)` → discovery payload for a sensor (target count)
   - `discoveryTopic(component, nodeId, objectId)` → builds `homeassistant/{component}/{nodeId}/{objectId}/config`
   - `sanitizeForMqtt(input)` → strips non-`[a-zA-Z0-9_-]` characters from room/zone names for safe use in topics and identifiers

**Topic structure convention:**
- Node ID: `ep_room_{sanitizedRoomId}`
- Object ID for zone occupancy: `zone_{zoneIndex}_occupancy`
- Object ID for target count: `zone_{zoneIndex}_target_count`
- State topic: `ep_room/{sanitizedRoomId}/{objectId}/state`
- Availability topic: `ep_room/{sanitizedRoomId}/availability`

**MQTT config:** Add `MqttConfig` interface to `backend/src/ha/types.ts` with `brokerUrl: string`. Add `mqtt?: MqttConfig` to `AppConfig` in `config.ts`, reading from `MQTT_BROKER_URL` env var (matching the docker-compose.dev.yaml convention). Make it optional — the backend should still start without MQTT configured.

## Steps

1. `cd everything-presence-mmwave-configurator && npm install mqtt` — add mqtt v5.x
2. Add `MqttConfig` interface to `backend/src/ha/types.ts`: `{ brokerUrl: string }`
3. Add `mqtt?: MqttConfig` to `AppConfig` in `backend/src/config.ts`, sourced from `MQTT_BROKER_URL` env var. Optional — no error if missing.
4. Create `backend/src/ha/mqttClient.ts`:
   - Constructor takes `MqttConfig`
   - `async connect(): Promise<void>` — connects with `mqtt.connectAsync()`, logs success/failure
   - `async publish(topic: string, payload: string | Buffer, retain?: boolean): Promise<void>` — publishes with QoS 1
   - `async disconnect(): Promise<void>` — graceful close
   - `get isConnected(): boolean`
   - Structured pino logging for connect/disconnect/error events (broker URL only, no credentials in logs)
5. Create `backend/src/ha/discoveryPayload.ts` with the functions listed above. Follow mock-devices `buildDiscoveryPayload()` pattern closely for the device block structure.
6. Create `backend/src/__tests__/unit/discoveryPayload.test.ts`:
   - Test `sanitizeForMqtt` with special characters, spaces, slashes, wildcards
   - Test `discoveryTopic` format
   - Test `buildRoomDeviceBlock` output structure
   - Test `buildBinarySensorDiscovery` includes all required fields: unique_id, object_id, name, device, device_class, state_topic, payload_on, payload_off, value_template, availability_topic
   - Test `buildSensorDiscovery` for target count entities
   - Test that all identifiers use sanitized names
7. Run tests: `npx vitest run src/__tests__/unit/discoveryPayload.test.ts`

## Must-Haves

- [ ] `mqtt` v5.x added to backend package.json dependencies
- [ ] MqttClient wrapper with connect/publish/disconnect and isConnected
- [ ] Discovery payload builder producing correct HA MQTT discovery payloads
- [ ] sanitizeForMqtt strips MQTT-unsafe characters from topic components
- [ ] All discovery payloads share device identifiers for correct HA device grouping
- [ ] Unit tests for discovery payload builder pass

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/discoveryPayload.test.ts` — all tests pass
- `grep '"mqtt"' everything-presence-mmwave-configurator/backend/package.json` confirms dependency added

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MQTT broker | Log error + throw, caller handles | mqtt.js has built-in reconnect; connect() rejects after configurable timeout | N/A — publish is fire-and-confirm via QoS 1 |

## Negative Tests

- sanitizeForMqtt with empty string, only special chars, MQTT wildcards (+, #), forward slashes
- Discovery payload with empty room name, very long room name, unicode characters
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/package.json, everything-presence-mmwave-configurator/backend/src/ha/types.ts, everything-presence-mmwave-configurator/backend/src/config.ts, everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts, everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/discoveryPayload.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/discoveryPayload.test.ts
- [x] **T02: Created templateGenerator.ts with four Jinja2 generators (OR, majority, no-change-on-tie, max target count), dispatcher, AggregationMode type, and 27 passing unit tests** — ## Description

Create `backend/src/ha/templateGenerator.ts` — a pure-function module that generates Jinja2 template strings for HA value_template fields. This is the core logic of S02: translating zone-to-sensor assignments into correct Jinja2 that HA evaluates for occupancy aggregation.

The module needs no runtime dependencies — it takes entity ID strings and returns Jinja2 template strings. Fully unit-testable.

**Functions to implement:**

1. `generateOrTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that evaluates to `'ON'` if ANY sensor reports `'on'`, else `'OFF'`. Uses `is_state()` calls joined with `or`.
   - Example for 2 sensors: `{{ 'ON' if is_state('binary_sensor.mock_ep_lite_1_zone_2_occupancy', 'on') or is_state('binary_sensor.mock_ep_lite_2_zone_1_occupancy', 'on') else 'OFF' }}`

2. `generateMajorityTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that evaluates to `'ON'` if MORE THAN HALF of sensors report `'on'`, else `'OFF'`. Uses `states()` calls collected into a list, filtered with `select('eq', 'on')`, counted.

3. `generateNoChangeOnTieTemplate(sensorEntityIds: string[], selfEntityId: string): string` — Returns Jinja2 that evaluates to `'ON'` if majority on, `'OFF'` if majority off, and holds the entity's own previous state on tie. Uses `states()` for self-reference.

4. `generateMaxTargetCountTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that takes the max of `states()` calls with `|int(0)` fallback across all sensors. Output is the max integer.
   - Example: `{{ [states('sensor.mock_ep_lite_1_zone_2_target_count') | int(0), states('sensor.mock_ep_lite_2_zone_1_target_count') | int(0)] | max }}`

5. `generateTemplate(mode: AggregationMode, sensorEntityIds: string[], selfEntityId?: string): string` — Dispatcher that calls the correct generator based on mode. `AggregationMode` is a union type: `'or' | 'majority' | 'no_change_on_tie'`.

**Type to export:** `type AggregationMode = 'or' | 'majority' | 'no_change_on_tie';`

**Edge cases:**
- Single sensor: OR and majority both simplify to direct `is_state()` check
- Empty sensor list: return a template that evaluates to `'OFF'` (unavailable/no coverage)
- No-change-on-tie with single sensor: degenerates to direct check (tie impossible with 1)
- Max target count with single sensor: simplifies to `{{ states('sensor.x') | int(0) }}`

## Steps

1. Create `backend/src/ha/templateGenerator.ts` with all functions above
2. Export `AggregationMode` type
3. Create `backend/src/__tests__/unit/templateGenerator.test.ts` with comprehensive tests:
   - OR mode: 1 sensor, 2 sensors, 3 sensors — verify correct `is_state()` calls and `or` chaining
   - Majority mode: 1 sensor, 2 sensors, 3 sensors, 4 sensors — verify list construction and count comparison
   - No-change-on-tie: 2 sensors (tie possible), 3 sensors (no tie possible with odd count, but template should still handle it), verify self-reference entity ID appears correctly
   - Max target count: 1 sensor, 2 sensors, 3 sensors — verify `int(0)` fallbacks and `max` filter
   - Empty sensor list: all modes return sensible fallback
   - Dispatcher `generateTemplate()` routes to correct generator
4. Run tests: `npx vitest run src/__tests__/unit/templateGenerator.test.ts`

## Must-Haves

- [ ] All four aggregation mode generators produce syntactically valid Jinja2
- [ ] OR template uses `is_state()` with `or` chaining
- [ ] Majority template uses `states()` list with `select('eq', 'on')` count comparison
- [ ] No-change-on-tie template includes self-entity-id reference for tie fallback
- [ ] Max target count template uses `int(0)` fallback and `max` filter
- [ ] Edge cases (single sensor, empty list) handled
- [ ] AggregationMode type exported
- [ ] All unit tests pass

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/templateGenerator.test.ts` — all tests pass

## Negative Tests

- Empty sensor entity ID list for all aggregation modes
- Single sensor for all modes (degenerate cases)
  - Estimate: 45m
  - Files: everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/templateGenerator.test.ts
- [ ] **T03: Build RoomDeviceService and expose WsReadTransport.call() for downstream use** — ## Description

Create the room device service (`backend/src/ha/roomDeviceService.ts`) that orchestrates MQTT discovery to create/remove virtual HA room devices with zone entities. Also expose the private `call()` method on `WsReadTransport` so downstream slices (S04) can use it for template helper creation.

**RoomDeviceService** takes an `MqttClient` (from T01) and uses the discovery payload builder (T01) + template generator (T02) to publish MQTT discovery messages that create:
- A virtual device in HA identified by `ep_room_{roomId}`
- One `binary_sensor` per zone with `value_template` containing the Jinja2 aggregation template
- One `sensor` per zone for target count with `value_template` containing the max template

The service also handles cleanup by publishing empty payloads to the same config topics.

**Input data model:** The service accepts a room descriptor (not the full RoomConfig — just the subset needed):
```typescript
interface RoomDeviceDescriptor {
  roomId: string;
  roomName: string;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    zoneIndex: number;
    aggregationMode: AggregationMode;
    coveringSensorEntities: {
      occupancy: string[];  // e.g., ['binary_sensor.mock_ep_lite_1_zone_2_occupancy']
      targetCount: string[]; // e.g., ['sensor.mock_ep_lite_1_zone_2_target_count']
    };
  }>;
}
```

This descriptor is what S04 will build from zone assignments + device profiles. For S02, we hardcode test data.

**Methods:**
- `async createRoomDevice(descriptor: RoomDeviceDescriptor): Promise<void>` — publishes availability 'online', then discovery messages for all zone entities
- `async removeRoomDevice(roomId: string, zoneCount: number): Promise<void>` — publishes empty payloads to all config topics to remove entities, then removes availability
- `getDiscoveryTopics(roomId: string, zoneCount: number): string[]` — returns all topics that would be published to (for inspection/debugging)

**WsReadTransport exposure:** Make `call()` public (change `private` to `public` on line 407 of wsReadTransport.ts). This is a purely internal class — there's no external API contract to break. The method signature `call(command: Record<string, unknown>): Promise<unknown>` is already correct for arbitrary WS commands. S04 will use this for `config/template/create` and `config/entity_registry/update` commands.

## Steps

1. In `backend/src/ha/wsReadTransport.ts`, change `private async call(` to `public async call(` (line 407). Also add `call(command: Record<string, unknown>): Promise<unknown>` to the `IHaReadTransport` interface in `readTransport.ts`. For `RestReadTransport`, add a stub that throws `new Error('WS call() not available in REST mode')`.
2. Create `backend/src/ha/roomDeviceService.ts`:
   - Import `MqttClient`, discovery payload builders, and template generators
   - Define `RoomDeviceDescriptor` interface (export it)
   - Implement `createRoomDevice()`: iterate zones, build discovery payloads with generated templates, publish each with retain:true
   - Implement `removeRoomDevice()`: publish empty string to each config topic (retain:true to remove retained message)
   - Implement `getDiscoveryTopics()` for debugging
   - Log room device operations with pino (room ID, zone count, topics published)
3. Create `backend/src/__tests__/unit/roomDeviceService.test.ts`:
   - Mock MqttClient (track publish calls)
   - Test `createRoomDevice()` with a 2-zone room covered by 2 sensors:
     - Verify correct number of publish calls (availability + N binary_sensors + N sensors)
     - Verify each publish topic matches expected format
     - Verify each payload contains correct value_template from template generator
     - Verify all payloads share the same device identifiers
   - Test `removeRoomDevice()` publishes empty payloads to correct topics
   - Test `getDiscoveryTopics()` returns expected topic list
   - Test with empty zones array (should publish only availability)
4. Run tests: `npx vitest run src/__tests__/unit/roomDeviceService.test.ts`

## Must-Haves

- [ ] RoomDeviceService creates correct MQTT discovery messages for binary_sensor and sensor entities
- [ ] All entities under one room share identical device identifiers
- [ ] value_template contains Jinja2 from template generator
- [ ] Cleanup publishes empty payloads to remove entities
- [ ] WsReadTransport.call() is public and on the IHaReadTransport interface
- [ ] RestReadTransport has a throwing stub for call()
- [ ] Unit tests pass with mocked MQTT client

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomDeviceService.test.ts` — all tests pass
- `grep 'public async call' everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` confirms visibility change

## Observability Impact

- Signals added: pino logs for room device create/remove with room ID, zone count, topic list
- How a future agent inspects this: `getDiscoveryTopics()` returns all topics for a room — can be used to verify against MQTT broker
- Failure state exposed: publish failures logged with topic path

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MqttClient.publish() | Log + rethrow — caller decides retry strategy | mqtt.js QoS 1 has built-in retry; publish() rejects if client disconnected | N/A — we build the payload, not receive it |
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts, everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts, everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts, everything-presence-mmwave-configurator/backend/src/ha/restReadTransport.ts, everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomDeviceService.test.ts
- [ ] **T04: Integration test: verify room device + zone entities appear in HA via Docker dev stack** — ## Description

Create an integration test script that boots the MQTT client, publishes discovery messages for a hardcoded test room, and verifies the virtual device + entities appear in HA's device and entity registries. Also verify cleanup removes them.

This test runs against the Docker dev stack (`cd dev && docker compose -f docker-compose.dev.yaml up -d`). It uses `MqttClient` to publish and `WsReadTransport` to verify via HA's WS API.

**Test room descriptor (hardcoded):**
- Room: 'bedroom' (id: 'bedroom_01')
- 2 zones: 'Zone 1' (OR aggregation), 'Zone 2' (majority aggregation)
- 2 covering sensors per zone: mock_ep_lite_1 (zone 2 slot), mock_ep_lite_2 (zone 1 slot)
- Entity IDs reference the mock devices already in HA from the dev stack's mock-devices container:
  - `binary_sensor.mock_ep_lite_1_zone_2_occupancy`, `binary_sensor.mock_ep_lite_2_zone_1_occupancy`
  - `sensor.mock_ep_lite_1_zone_2_target_count`, `sensor.mock_ep_lite_2_zone_1_target_count`

**Test flow:**
1. Connect MqttClient to `mqtt://localhost:1883`
2. Create RoomDeviceService with the client
3. Call `createRoomDevice()` with the test descriptor
4. Wait 2 seconds for HA to process discovery messages
5. Connect WsReadTransport to HA and verify:
   - `listDevices()` contains a device with identifier `ep_room_bedroom_01`
   - `listEntityRegistry()` contains entities: `binary_sensor.ep_room_bedroom_01_zone_1_occupancy`, `binary_sensor.ep_room_bedroom_01_zone_2_occupancy`, `sensor.ep_room_bedroom_01_zone_1_target_count`, `sensor.ep_room_bedroom_01_zone_2_target_count`
6. Call `removeRoomDevice()` to cleanup
7. Wait 2 seconds for HA to process removal
8. Verify entities no longer appear in registry
9. Disconnect both clients

This test is placed in `backend/src/__tests__/integration/roomDevice.test.ts`. It requires the Docker dev stack to be running and should be excluded from normal `npx vitest run` (which only runs unit tests by default since the test pattern includes `src/__tests__/**/*.test.ts` — we'll use the specific path to run it).

**Important:** The integration test needs the HA token from the dev stack. The docker-compose writes it to a shared volume. For local runs, the test can read it from the `HA_LONG_LIVED_TOKEN` env var or from the standard dev stack token path. If the Docker stack isn't running, the test should skip gracefully.

## Steps

1. Create `backend/src/__tests__/integration/roomDevice.test.ts`:
   - Import MqttClient, RoomDeviceService, WsReadTransport
   - Define hardcoded test descriptor
   - `beforeAll`: Check if Docker stack is running (try connecting to MQTT on localhost:1883, skip test suite if not). Connect MqttClient. Load HA token from env or dev stack shared volume.
   - Test: create room device → wait → verify in HA → cleanup → wait → verify removed
   - `afterAll`: disconnect clients, ensure cleanup ran
2. Add a vitest config section or separate script to run integration tests: `npx vitest run src/__tests__/integration/roomDevice.test.ts`
3. Run the integration test against the dev stack (if running): `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/integration/roomDevice.test.ts`
4. Run the full unit test suite to confirm no regressions: `npx vitest run src/__tests__/unit/`

## Must-Haves

- [ ] Integration test creates a virtual HA room device via MQTT discovery
- [ ] Device appears in HA device registry with correct identifier
- [ ] Binary sensor and sensor entities appear in HA entity registry with correct entity IDs
- [ ] Cleanup removes device and entities from HA registries
- [ ] Test skips gracefully if Docker dev stack isn't running
- [ ] Existing unit tests still pass

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/` — all unit tests pass (regression check)
- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/integration/roomDevice.test.ts` — integration test passes (requires Docker dev stack)

## Observability Impact

- Signals added: integration test logs connection status, entity verification results
- How a future agent inspects this: test output shows exactly which entities were found/missing in HA
- Failure state exposed: test assertion messages include expected vs actual entity IDs

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MQTT broker (localhost:1883) | Skip test suite with descriptive message | 5s connection timeout → skip | N/A |
| HA WS API (localhost:8123) | Skip test suite with descriptive message | 10s connection timeout → skip | Log raw response, fail test |
| Mock devices not running | Entities won't exist for template reference — test still passes (templates reference entities but don't need them to exist for discovery) | N/A | N/A |
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts
  - Verify: cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/integration/roomDevice.test.ts
