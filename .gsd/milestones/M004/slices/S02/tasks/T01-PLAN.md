---
estimated_steps: 53
estimated_files: 6
skills_used: []
---

# T01: Add mqtt package and create MqttClient wrapper with discovery payload builder

## Description

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

## Inputs

- ``dev/mock-devices/src/index.ts` — blueprint for discovery payload structure and device grouping pattern`
- ``everything-presence-mmwave-configurator/backend/src/ha/types.ts` — existing HA type definitions to extend`
- ``everything-presence-mmwave-configurator/backend/src/config.ts` — app config to add MQTT config`
- ``everything-presence-mmwave-configurator/backend/package.json` — add mqtt dependency`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts` — MQTT client wrapper service`
- ``everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts` — discovery payload builder functions`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/discoveryPayload.test.ts` — unit tests for payload builder`
- ``everything-presence-mmwave-configurator/backend/src/ha/types.ts` — extended with MqttConfig interface`
- ``everything-presence-mmwave-configurator/backend/src/config.ts` — extended with optional mqtt config`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/discoveryPayload.test.ts
