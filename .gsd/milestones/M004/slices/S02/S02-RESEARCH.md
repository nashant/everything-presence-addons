# S02 — HA Room Device + Template Sensor Creation Proof — Research

**Date:** 2026-03-30
**Depth:** Deep — new MQTT integration in backend, unfamiliar HA discovery patterns, critical architecture decisions

## Summary

S02 proves the HA integration layer for room-level virtual devices with occupancy aggregation. The slice requires two new capabilities in the backend: (1) an MQTT client that publishes discovery messages to create virtual room devices with binary sensor entities in HA's device registry, and (2) Jinja2 template generation for occupancy aggregation (OR / majority / no-change-on-tie) referencing per-device zone occupancy entities.

The critical architectural insight from research: **MQTT binary sensors with `value_template` can evaluate arbitrary Jinja2 expressions**, including `states()` calls to any HA entity. This means we can do everything via MQTT discovery alone — the `value_template` field on an MQTT binary sensor can contain the same Jinja2 that a template helper would use. This eliminates the need for a separate WS API flow for template helper creation, which the community confirms has no stable programmatic API. The device + all its zone aggregation entities are created via a single MQTT discovery burst, grouped under one device via shared `device.identifiers`.

The backend currently has zero MQTT connectivity. The `mqtt` npm package (v5.x, already used by mock-devices in the dev stack) needs to be added. The `WsReadTransport.call()` method is private and not exposed on `IHaReadTransport`, so we can't use it for arbitrary WS commands without refactoring — further supporting the MQTT-only approach.

## Recommendation

**Use MQTT discovery for everything: device creation, binary sensor entities with Jinja2 `value_template`, and sensor entities for target count aggregation.** Do not use the WS API for template helper creation — there is no stable programmatic API for it (community confirmation from 2024, no change since).

The approach:
1. Add `mqtt` package to backend
2. Create an `MqttClient` service that connects to the broker and publishes discovery messages
3. For each room with zones + sensors, publish discovery messages creating:
   - A virtual device identified by `ep_room_{roomId}` 
   - One `binary_sensor` per zone with `value_template` containing Jinja2 aggregation logic
   - One `sensor` per zone for target count (max aggregation)
4. The `value_template` references the real EP device zone occupancy entities (e.g., `binary_sensor.mock_ep_lite_1_zone_1_occupancy`)
5. Cleanup = publish empty payload to the same config topics

This mirrors exactly what `dev/mock-devices/src/index.ts` does, just with `value_template` aggregation instead of `state_topic` for raw values.

## Implementation Landscape

### Key Files

- `dev/mock-devices/src/index.ts` — **Blueprint.** Complete MQTT discovery implementation: `buildDiscoveryPayload()`, topic structure `homeassistant/{component}/{nodeId}/{objectId}/config`, device grouping via shared `device.identifiers`, availability topics. The room device service should follow this exact pattern.
- `everything-presence-mmwave-configurator/backend/src/ha/wsReadTransport.ts` — Has `call()` (private) for arbitrary WS commands. Not needed for S02 since we're using MQTT-only. But the transport layer is how we verify entities appeared in HA after creation.
- `everything-presence-mmwave-configurator/backend/src/ha/writeClient.ts` — REST write client. Not directly involved in S02 but shows the existing service dependency injection pattern.
- `everything-presence-mmwave-configurator/backend/src/server.ts` — Where dependencies are wired. The MQTT client will need to be instantiated in `index.ts` and passed through `ServerDependencies`.
- `everything-presence-mmwave-configurator/backend/src/index.ts` — App bootstrap. MQTT client creation goes here alongside `writeClient` and `readTransport`.
- `everything-presence-mmwave-configurator/backend/src/domain/types.ts` — `RoomConfig`, `SensorAttachment`, `Zone`, `ZoneRect`. Room-level data structures. May need a new field for aggregation strategy per zone.
- `everything-presence-mmwave-configurator/config/device-profiles/everything_presence_lite.json` — EP Lite profile showing zone occupancy entity templates: `binary_sensor.${name}_zone_N_occupancy`. These are the entities that the Jinja2 templates will reference.
- `everything-presence-mmwave-configurator/backend/src/ha/types.ts` — HA auth config, WS message types. May need MQTT config types.
- `everything-presence-mmwave-configurator/backend/src/config.ts` — App config. Needs `mqtt.brokerUrl` added.

### New Files (expected)

- `backend/src/ha/mqttClient.ts` — MQTT client wrapper: connect, publish discovery, publish state, cleanup
- `backend/src/ha/roomDeviceService.ts` — Room device lifecycle: create/update/remove virtual devices and zone entities
- `backend/src/ha/templateGenerator.ts` — Jinja2 template string generation for OR / majority / no-change-on-tie aggregation
- `backend/src/__tests__/unit/templateGenerator.test.ts` — Unit tests for Jinja2 template generation (string output verification)
- `backend/src/__tests__/unit/roomDeviceService.test.ts` — Unit tests for discovery payload generation (mock MQTT client)

### MQTT Discovery Message Structure

For a room "bedroom" with 2 zones covered by 2 EP Lite sensors (`mock_ep_lite_1`, `mock_ep_lite_2`):

**Device anchoring** (creates the device in HA registry):
```
Topic: homeassistant/binary_sensor/ep_room_bedroom/zone_1_occupancy/config
Payload: {
  "unique_id": "ep_room_bedroom_zone_1_occupancy",
  "object_id": "ep_room_bedroom_zone_1_occupancy",
  "name": "Zone 1 Occupancy",
  "device": {
    "identifiers": ["ep_room_bedroom"],
    "name": "Bedroom (EP Room)",
    "manufacturer": "EverythingSmartTechnology",
    "model": "EP Room Aggregator"
  },
  "device_class": "occupancy",
  "state_topic": "ep_room/bedroom/zone_1_occupancy/state",
  "payload_on": "ON",
  "payload_off": "OFF",
  "value_template": "{{ 'ON' if is_state('binary_sensor.mock_ep_lite_1_zone_2_occupancy', 'on') or is_state('binary_sensor.mock_ep_lite_2_zone_1_occupancy', 'on') else 'OFF' }}",
  "availability_topic": "ep_room/bedroom/availability"
}
```

The `value_template` field contains the aggregation Jinja2. HA evaluates this template whenever the MQTT message arrives on `state_topic`. **However**, the template evaluates entity states that change via ESPHome updates, not MQTT messages. So the backend needs to periodically publish to `state_topic` to trigger re-evaluation, OR we use a heartbeat approach.

**Alternative (simpler):** Instead of `value_template` on MQTT binary sensors, we can use MQTT binary sensors with a `state_topic` that the backend actively publishes computed state to. The backend subscribes to the EP device zone occupancy entity state changes (via the existing WS state subscription), computes the aggregation, and publishes ON/OFF to the room zone state topic. This makes the backend a runtime dependency — which contradicts R015.

**Correction — the winning approach:** Use MQTT binary sensors where the state is always "ON" on `state_topic` (just to keep the entity alive), but the actual value comes from `value_template` that reads HA entity states. HA evaluates `value_template` on *every state update of referenced entities* automatically when using MQTT template sensors. Wait — that's not quite right either. MQTT binary sensor `value_template` only fires when a message arrives on `state_topic`.

**Final approach after careful analysis:** The cleanest path is to use HA **template binary sensors via config flow** (WS API) — but this has no programmatic API. The MQTT approach requires runtime publishing. So the correct approach is:

1. Create a **virtual MQTT device** per room (using MQTT discovery) with minimal anchor entities (just availability + metadata)
2. Create **template binary sensors as HA helpers** via WS `config/template/create` commands (the same API the HA frontend uses when you create a template helper in the UI)
3. After creation, update the template sensor's device assignment via `config/entity_registry/update` to attach it to the MQTT device

Actually — this two-phase approach is what the context document envisions. And the `WsReadTransport.call()` being private is a solvable constraint: either make it public (it's internal to the codebase, no external API contract) or add a dedicated public method for arbitrary WS commands.

**Revised recommendation:** 
- **Phase 1 (MQTT):** Create the virtual room device via MQTT discovery with a simple anchor entity (availability sensor)
- **Phase 2 (WS API):** Create template binary sensors via WS config flow commands and attach them to the MQTT device
- **If WS template creation doesn't work in testing:** Fall back to MQTT binary sensors where the backend periodically publishes aggregated state (making the backend a soft runtime dependency, with the MQTT retained messages providing last-known state if backend stops)

### Jinja2 Templates

**OR aggregation (any sensor):**
```jinja2
{{ is_state('binary_sensor.mock_ep_lite_1_zone_2_occupancy', 'on') or is_state('binary_sensor.mock_ep_lite_2_zone_1_occupancy', 'on') }}
```

**Majority aggregation (more than half):**
```jinja2
{% set sensors = [
  states('binary_sensor.mock_ep_lite_1_zone_2_occupancy'),
  states('binary_sensor.mock_ep_lite_2_zone_1_occupancy')
] %}
{% set on_count = sensors | select('eq', 'on') | list | count %}
{{ on_count > (sensors | count / 2) }}
```

**No-change-on-tie (hold previous state):**
```jinja2
{% set sensors = [
  states('binary_sensor.mock_ep_lite_1_zone_2_occupancy'),
  states('binary_sensor.mock_ep_lite_2_zone_1_occupancy')
] %}
{% set on_count = sensors | select('eq', 'on') | list | count %}
{% set total = sensors | count %}
{% if on_count > total / 2 %}on
{% elif on_count < total / 2 %}off
{% else %}{{ states('binary_sensor.ep_room_bedroom_zone_1_occupancy') }}
{% endif %}
```

**Target count (max across sensors):**
```jinja2
{{ [states('sensor.mock_ep_lite_1_zone_2_target_count') | int(0), states('sensor.mock_ep_lite_2_zone_1_target_count') | int(0)] | max }}
```

### Build Order

1. **MQTT client wrapper + connection** — Add `mqtt` package, create `MqttClient` service, wire into app bootstrap. Prove broker connectivity.
2. **Jinja2 template generator** — Pure string generation functions, fully unit-testable without HA. Generate templates for OR/majority/no-change-on-tie/max. This is the core logic of S02.
3. **Discovery message builder** — Build MQTT discovery payloads for room device + anchor entity. Follow mock-devices pattern exactly.
4. **WS API template helper creation** — Expose a public `call()` method on `WsReadTransport` (or add a dedicated `createTemplateHelper()` method). Attempt to create template binary sensors programmatically. This is the highest-risk step — if it fails, fall back to MQTT binary sensors with backend-published state.
5. **Integration test with Docker stack** — Boot dev stack, create a hardcoded test room, verify device appears in HA device registry, verify template sensors evaluate correctly, verify cleanup removes entities.

### Verification Approach

1. **Unit tests** — Template generator produces correct Jinja2 strings for all aggregation modes. Discovery payload builder produces correct MQTT payloads. No HA dependency needed.
2. **Integration test** — Docker dev stack running. Backend connects to Mosquitto, publishes discovery messages, verifies device appears in HA device registry via `listDevices()` WS call. Template sensors appear via `listEntityRegistry()`. Mock EP device zone occupancy state changes → template sensor state updates.
3. **Cleanup test** — Publish empty payloads to config topics → verify device and entities removed from HA registries.

## Constraints

- `WsReadTransport.call()` is private. Need to either make it public or add new public methods for template helper management. This is an internal refactor, not an API break.
- The backend has no MQTT dependency currently. Adding `mqtt` v5.x (same as mock-devices) is safe. The dev stack Mosquitto broker is on port 1883 with no auth.
- EP One devices have `maxZones: 0` — they must be excluded from zone assignment (R012). The room device service must filter these out when determining covering sensors.
- MQTT discovery topic format is strict: `homeassistant/{component}/{nodeId}/{objectId}/config`. The `nodeId` and `objectId` must be `[a-zA-Z0-9_-]` only.
- HA evaluates `value_template` on MQTT entities only when a message arrives on `state_topic`. For template helpers, evaluation is triggered by referenced entity state changes.

## Common Pitfalls

- **MQTT `value_template` timing** — MQTT binary sensor `value_template` only fires on `state_topic` message arrival, not on referenced entity state changes. This is a critical difference from template helpers. If using MQTT binary sensors for aggregation, the backend must publish heartbeat messages to trigger re-evaluation. Template helpers (config flow) don't have this limitation.
- **Device identifier mismatch** — All entities that should group under one device must use identical `device.identifiers` arrays. A single character difference creates a separate device.
- **MQTT retained messages** — Discovery messages should be published with `retain: true` so they survive broker restarts. State messages may or may not be retained depending on the use case.
- **WS template creation API undocumented** — The config flow WS commands (`config/template/create`) are internal to HA and not in the public developer docs. The exact payload structure must be discovered by inspecting HA frontend network traffic or HA source code. This is the highest-risk unknown.
- **No-change-on-tie self-reference** — A template sensor referencing its own state (`states('binary_sensor.xxx')`) where `xxx` is itself may trigger HA's circular dependency detection. Must be tested empirically.

## Open Risks

- **WS API for template helpers may not exist or may require undocumented payloads.** Mitigation: fall back to MQTT binary sensors with backend-published state. This makes the backend a soft runtime dependency (retained MQTT messages provide last-known state).
- **Self-referencing template sensors** (no-change-on-tie) may trigger circular dependency errors in HA. Mitigation: test empirically in the dev stack. If it fails, document as a limitation and offer OR/majority only.
- **MQTT broker authentication in production.** The dev stack uses no-auth Mosquitto. Production HA add-ons may need auth credentials. Not a blocker for S02 (proof) but must be considered for S04 (lifecycle).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| MQTT client | `mqtt` npm package v5.x | Already used by mock-devices in the dev stack. Battle-tested, supports MQTT 5.0, auto-reconnect. |
| MQTT discovery payload structure | `dev/mock-devices/src/index.ts` `buildDiscoveryPayload()` | Proven working pattern in this project. Copy the device grouping and topic structure. |
| HA entity/device verification | `WsReadTransport.listDevices()` / `listEntityRegistry()` | Already implemented and working in the codebase. |

## Sources

- MQTT discovery topic format and device grouping confirmed via HA MQTT integration docs (home-assistant.io/integrations/mqtt/)
- MQTT binary sensor `value_template` behavior confirmed via HA MQTT binary sensor docs (home-assistant.io/integrations/binary_sensor.mqtt/)
- Template sensor programmatic creation has no stable public API — confirmed via HA community thread (community.home-assistant.io/t/create-template-sensor-through-api/693931) and HA developer WS API docs (developers.home-assistant.io/docs/api/websocket/)
- Jinja2 template syntax for `states()`, `is_state()`, filters confirmed via HA templating docs (home-assistant.io/docs/configuration/templating/)
- HA 2026.2 used in dev stack (dev/docker-compose.dev.yaml)
