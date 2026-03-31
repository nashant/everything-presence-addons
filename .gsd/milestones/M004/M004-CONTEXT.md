# M004: Room-Level Zone System with HA Integration — Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

## Project Description

The EP configurator has room-level zones drawn on the canvas, but they're currently disconnected from the multi-sensor architecture. Zones need to be translated from room coordinates to device-relative coordinates for each covering sensor, written to the hardware, and aggregated at the room level via HA template sensors on a virtual room device.

## Why This Milestone

M003 delivered multi-sensor rooms — users can place N sensors in a room. But zone management is still fundamentally single-device: zones are stored in room-space coordinates, and the zoneWriter writes them as-is to device entities (assuming device-relative). With multiple sensors at different positions and rotations, this breaks down. The system needs a coordinate transform layer, zone-to-sensor assignment, and room-level aggregation.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Draw zones on the room canvas (room coordinates)
- Save the room and have zones automatically translated + written to each covering sensor's HA entities in correct device-relative coordinates
- See a virtual HA device per room with template binary sensors per zone
- Configure aggregation strategy per zone (OR / majority / no-change-on-tie)
- See zone coverage indicators per sensor in the room builder (which sensors cover which zones)
- Get warnings for uncovered zones
- Zone occupancy works in HA automations without the configurator running

### Entry point / environment

- Entry point: http://localhost:5173 → Dashboard → Room Editor → Zones panel → Save Room
- Environment: local dev (Vite + backend + Docker HA + Mosquitto)
- Live dependencies: Home Assistant (MQTT for device discovery, WS API for template helpers, REST/WS for zone coordinate writes), Mosquitto broker

## Completion Class

- Contract complete means: coordinate transforms verified by unit tests, zone assignment logic verified by tests, template generation verified by output inspection
- Integration complete means: MQTT discovery creates HA room device, WS API creates template sensors, zoneWriter writes correct translated coordinates
- Operational complete means: zone occupancy works in HA after configurator shuts down (templates are self-contained in HA)

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Draw 2+ zones in a multi-sensor room → save → each covering sensor's HA zone entities have correct device-relative coordinates
- A virtual HA room device appears with template binary sensors per zone
- The template sensors contain correct Jinja2 referencing the right per-device zone entities
- Zone occupancy continues working in HA if the configurator backend is stopped
- Deleting a room removes the virtual HA device and template sensors

## Risks and Unknowns

- Coordinate transform math — must handle all quadrant combinations of sensor position + rotation relative to room origin. Off-by-one rotations or sign errors break everything downstream.
- WS API template helper creation — user confirms this works but it's a new pattern for this codebase. Need to discover the exact WS command structure.
- MQTT client in backend — new dependency (mqtt package). The backend currently has no MQTT connectivity; the mock devices are a separate Docker service.
- Zone slot allocation — EP devices have 4 zone slots. A room might have more zones than any single device can hold. Need overflow handling.
- Jinja2 no-change-on-tie — self-referencing the entity's own state in a template. Need to verify HA doesn't detect this as a circular dependency.

## Existing Codebase / Prior Art

- `backend/src/ha/zoneWriter.ts` — ZoneWriter class, writes ZoneRect coordinates to HA number entities via the write client. Currently assumes device-relative coordinates.
- `backend/src/ha/writeClient.ts` — HaWriteClient with setNumberEntity(), setSwitchEntity(), setTextEntity(). REST API calls to HA.
- `backend/src/ha/wsReadTransport.ts` — WsReadTransport with generic `call()` method for arbitrary WS commands. This is how we'll create template helpers.
- `backend/src/domain/types.ts` — ZoneRect, ZonePolygon, Zone, DevicePlacement, SensorAttachment, RoomConfig with zones[] and sensors[].
- `frontend/src/pages/RoomBuilderPage.tsx` — selectedZoneCoverage already computes single-sensor coverage (full/partial/none) using isInRange vertex check.
- `frontend/src/components/canvas/ZoneItemRenderer.tsx` — zone rendering with coverage-based styling (green=full, amber=partial, red=none).
- `dev/mock-devices/src/index.ts` — MQTT auto-discovery pattern for creating mock EP devices. Reference for MQTT discovery message format.
- Device profiles: EP Lite (4 zones, 2 exclusion, 2 entry), EP Pro (4 zones, 2 exclusion), EP One (0 zones — excluded).

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001-R012 — all active requirements map to M004 slices
- R015 — explicit out-of-scope: no runtime aggregation in the configurator

## Scope

### In Scope

- Room-space → device-space coordinate transform (translate + rotate)
- Zone coverage analysis: per-sensor overlap percentage
- Zone-to-sensor assignment with configurable overlap threshold
- Zone slot allocation on each covering device
- Per-device zone writes with translated coordinates via zoneWriter
- MQTT client in backend for room device discovery messages
- Virtual HA room device lifecycle (create/update/cleanup)
- Template binary sensor creation via WS API
- Jinja2 template generation with configurable aggregation (OR / majority / no-change-on-tie)
- Target count aggregation: max across covering sensors
- Frontend zone coverage visualization per sensor
- Aggregation strategy + overlap threshold UI per zone
- Uncovered zone warnings

### Out of Scope / Non-Goals

- Runtime occupancy aggregation in the configurator backend (R015)
- Per-sensor zone geometry editing (R013 — deferred)
- Live zone occupancy display in room builder (R014 — deferred)
- Zone-to-sensor association for the WizardPage (wizard remains single-device)
- Polygon zone template generation (start with rectangular zones, polygon support is stretch)

## Technical Constraints

- EP devices have fixed zone slot counts (4 regular, 2 exclusion, 2 entry for Lite/Pro; 0 for One)
- Zone coordinates in HA entities are in mm, device-relative (0,0 = sensor position, Y axis = sensor forward direction)
- MQTT broker (Mosquitto) is available in the Docker dev stack on port 1883
- The backend has no current MQTT dependency — need to add the `mqtt` npm package
- The WsReadTransport.call() method is the gateway for arbitrary WS commands

## Integration Points

- **Home Assistant MQTT** — discovery messages to create virtual room devices and anchor entities
- **Home Assistant WS API** — create template binary sensors as helpers, attach to room device
- **Existing ZoneWriter** — applyZones() / applyPolygonZones() for per-device zone coordinate writes
- **Existing writeClient** — setNumberEntity() for individual zone coordinate updates
- **Mock devices** — reference for MQTT discovery message format

## Open Questions

- Exact WS command structure for creating template helpers — needs discovery during S02
- Whether HA template sensor self-reference (for no-change-on-tie) triggers circular dependency detection — needs testing during S02
- How to attach template sensors to a device created via MQTT discovery (different config_entry?) — needs investigation during S02
