# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — Room-space → device-space coordinate transform
- Class: core-capability
- Status: active
- Description: Pure function that translates zone coordinates from room-space (mm, room origin) to device-space (mm, sensor origin + rotation). Must handle arbitrary sensor positions and rotations.
- Why it matters: Without correct coordinate translation, zone positions written to devices will be wrong. Every downstream feature depends on this math being right.
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S03
- Validation: unmapped
- Notes: Transform is translate to sensor origin then rotate by negative sensor angle. Both ZoneRect and ZonePolygon must be supported.

### R002 — Zone-to-sensor coverage analysis with configurable overlap threshold
- Class: core-capability
- Status: active
- Description: For each zone in a room, compute which sensors cover it and what percentage of the zone falls within each sensor's FOV. Sensors must meet a user-configurable overlap threshold to participate in aggregation.
- Why it matters: Determines which sensors get which zones and which sensors participate in the room-level aggregation templates. Configurable threshold gives users control over noise vs. coverage.
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S03, M004/S05
- Validation: unmapped
- Notes: Coverage computed from zone vertices vs. sensor FOV cone. Threshold stored per zone on RoomConfig.

### R003 — Zone-to-device slot assignment
- Class: core-capability
- Status: active
- Description: Map room-level zones to specific device zone slots (zone1-zone4) on each covering sensor. Handle slot conflicts when the same device covers multiple room zones.
- Why it matters: EP devices have a fixed number of zone slots (typically 4). The system must allocate slots without conflicts.
- Source: user
- Primary owning slice: M004/S02
- Supporting slices: none
- Validation: unmapped
- Notes: EP Lite/Pro have 4 regular + 2 exclusion + 2 entry zone slots. EP One has 0 zones (excluded from assignment).

### R004 — Per-device zone writes with translated coordinates
- Class: core-capability
- Status: active
- Description: On room save, write translated zone coordinates to each covering sensor's HA entities via the existing zoneWriter infrastructure.
- Why it matters: This is the actual hardware-level output — the EP sensor needs device-relative zone coordinates to detect presence in the right area.
- Source: user
- Primary owning slice: M004/S03
- Supporting slices: none
- Validation: unmapped
- Notes: Uses existing ZoneWriter.applyZones() and ZoneWriter.applyPolygonZones(). Coordinates must be in device-space (mm from sensor origin).

### R005 — Virtual HA room device via MQTT discovery
- Class: integration
- Status: active
- Description: Create a virtual device in HA's device registry for each room that has zones + sensors, using MQTT discovery messages. The device groups all room-level zone entities.
- Why it matters: Gives users a single HA device per room where all zone aggregation entities live. Clean HA UX.
- Source: user
- Primary owning slice: M004/S02
- Supporting slices: M004/S04
- Validation: unmapped
- Notes: Requires MQTT client in backend (new dependency). Device created automatically on zone save. Uses shared device identifier so all zone entities group under one device.

### R006 — Template binary sensors per zone via WS API
- Class: integration
- Status: active
- Description: Create HA template binary sensors for each room zone using the WebSocket API. Each sensor's Jinja2 template references the covering EP sensors' zone occupancy entities and implements the configured aggregation logic.
- Why it matters: This is where occupancy determination runs — inside HA, not in the configurator. The configurator is the author, HA is the runtime.
- Source: user
- Primary owning slice: M004/S02
- Supporting slices: M004/S04
- Validation: unmapped
- Notes: Template sensors must be created as HA helpers, not configuration.yaml entries. User has confirmed this is doable via WS API.

### R007 — Configurable occupancy aggregation per zone
- Class: primary-user-loop
- Status: active
- Description: Each room zone can be configured with an aggregation strategy: OR (any sensor sees occupancy), majority (more than half), or no-change-on-tie (hold previous state when sensors split evenly). Strategy stored per zone.
- Why it matters: Different zones have different reliability needs. A bed zone might want majority to reduce false positives. A doorway zone might want OR for maximum responsiveness.
- Source: user
- Primary owning slice: M004/S04
- Supporting slices: M004/S05
- Validation: unmapped
- Notes: No-change-on-tie uses Jinja2 self-reference to hold state: `{{ states('binary_sensor.room_zone_occupancy') }}` as fallback.

### R008 — Target count aggregation: max across covering sensors
- Class: primary-user-loop
- Status: active
- Description: Room-level target count per zone uses max of all covering sensors' zone_N_target_count values. Avoids double-counting overlapping FOVs.
- Why it matters: Summing would overcount targets in overlapping FOV regions. Max is the safest default.
- Source: user
- Primary owning slice: M004/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Generated as a template sensor: `{{ [states('sensor.s1_zone_2')|int(0), states('sensor.s2_zone_1')|int(0)] | max }}`

### R009 — Room device lifecycle: create/update/cleanup
- Class: continuity
- Status: active
- Description: Virtual HA room device and template sensors are created on first zone save, updated when zones or sensor assignments change, and cleaned up when a room is deleted or all zones are removed.
- Why it matters: Stale HA entities from deleted rooms would confuse users. The lifecycle must be managed.
- Source: inferred
- Primary owning slice: M004/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Cleanup requires removing MQTT discovery messages (empty payload to config topic) and deleting template helpers via WS API.

### R010 — Zone coverage visualization in room builder UI
- Class: primary-user-loop
- Status: active
- Description: Room builder shows per-sensor zone coverage: which sensors cover which zones, overlap percentages, and visual indicators on the canvas.
- Why it matters: Users need to see whether their sensor placement actually covers the zones they drew. Without this, zone assignment is a black box.
- Source: user
- Primary owning slice: M004/S05
- Supporting slices: none
- Validation: unmapped
- Notes: Extends existing coverage computation (currently single-sensor) to multi-sensor. Colors/indicators per-sensor on each zone.

### R011 — Uncovered zones: warn in UI + create as unavailable in HA
- Class: failure-visibility
- Status: active
- Description: Zones that no sensor covers display a warning in the room builder. The room-level HA entity is still created but with unavailable state. User can fix by repositioning sensors.
- Why it matters: Silent failures are worse than visible warnings. Users need to know when a zone isn't being monitored.
- Source: user
- Primary owning slice: M004/S05
- Supporting slices: M004/S04
- Validation: unmapped
- Notes: Warning style similar to existing zone coverage indicators (full/partial/none).

### R012 — EP One exclusion: 0 zones, excluded from zone assignment
- Class: constraint
- Status: active
- Description: EP One devices have maxZones=0 and must be excluded from zone-to-sensor assignment. The system must not attempt to write zones to EP One devices.
- Why it matters: Writing zones to a device that doesn't support them would fail or cause undefined behavior.
- Source: inferred
- Primary owning slice: M004/S01
- Supporting slices: M004/S03
- Validation: unmapped
- Notes: EP One still participates in room rendering (radar cone) but not zone assignment. Profile limits.maxZones checked during assignment.

## Validated

(None yet.)

## Deferred

### R013 — Zone editing per-sensor (adjust zone geometry per device)
- Class: differentiator
- Status: deferred
- Description: Allow users to adjust zone boundaries per-sensor (e.g., clip a zone differently for each covering sensor). Currently zones have a single geometry shared across all devices.
- Why it matters: Some advanced users may want per-sensor zone tuning. Deferring keeps the initial implementation simpler.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred until user feedback indicates demand. The per-zone overlap threshold partially addresses this need.

### R014 — Live zone occupancy state display in room builder
- Class: differentiator
- Status: deferred
- Description: Show real-time zone occupancy states (from HA template sensors) directly in the room builder canvas — zones light up when occupied.
- Why it matters: Useful for verification and debugging but not required for the core zone assignment workflow.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Would require subscribing to HA state changes from the frontend. Deferred to a future milestone.

## Out of Scope

### R015 — Runtime occupancy aggregation in the configurator backend
- Class: anti-feature
- Status: out-of-scope
- Description: The configurator backend does NOT run occupancy aggregation logic at runtime. It does not subscribe to sensor states, evaluate occupancy rules, or publish aggregated states. All runtime aggregation is handled by HA template sensors that the configurator authors.
- Why it matters: Ensures the configurator is a configure-time tool, not a runtime dependency. If the configurator stops running, occupancy detection continues working in HA.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The configurator generates Jinja2 templates and writes them to HA. HA evaluates them at runtime.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M004/S01 | M004/S03 | unmapped |
| R002 | core-capability | active | M004/S01 | M004/S03, M004/S05 | unmapped |
| R003 | core-capability | active | M004/S02 | none | unmapped |
| R004 | core-capability | active | M004/S03 | none | unmapped |
| R005 | integration | active | M004/S02 | M004/S04 | unmapped |
| R006 | integration | active | M004/S02 | M004/S04 | unmapped |
| R007 | primary-user-loop | active | M004/S04 | M004/S05 | unmapped |
| R008 | primary-user-loop | active | M004/S04 | none | unmapped |
| R009 | continuity | active | M004/S04 | none | unmapped |
| R010 | primary-user-loop | active | M004/S05 | none | unmapped |
| R011 | failure-visibility | active | M004/S05 | M004/S04 | unmapped |
| R012 | constraint | active | M004/S01 | M004/S03 | unmapped |
| R013 | differentiator | deferred | none | none | unmapped |
| R014 | differentiator | deferred | none | none | unmapped |
| R015 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 12
- Mapped to slices: 12
- Validated: 0
- Unmapped active requirements: 0
