---
estimated_steps: 54
estimated_files: 1
skills_used: []
---

# T04: Integration test: verify room device + zone entities appear in HA via Docker dev stack

## Description

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

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts` — MQTT client from T01`
- ``everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts` — room device service from T03`
- ``everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` — WS transport for HA registry verification`
- ``everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts` — payload builder from T01`
- ``everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — template generator from T02`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/__tests__/integration/roomDevice.test.ts` — integration test proving HA room device lifecycle`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/integration/roomDevice.test.ts
