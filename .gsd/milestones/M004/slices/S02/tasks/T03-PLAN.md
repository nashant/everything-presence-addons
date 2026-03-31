---
estimated_steps: 69
estimated_files: 5
skills_used: []
---

# T03: Build RoomDeviceService and expose WsReadTransport.call() for downstream use

## Description

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

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts` — MQTT client from T01`
- ``everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts` — payload builder from T01`
- ``everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — Jinja2 generator from T02`
- ``everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` — WS transport to expose call()`
- ``everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts` — IHaReadTransport interface to extend`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts` — room device service with create/remove/getTopics`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomDeviceService.test.ts` — unit tests with mocked MQTT`
- ``everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` — call() made public`
- ``everything-presence-mmwave-configurator/backend/src/ha/readTransport.ts` — IHaReadTransport extended with call()`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomDeviceService.test.ts
