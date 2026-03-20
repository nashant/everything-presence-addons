# M001: Room-First Configurator Rewrite — Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

## Project Description

Clean rewrite of the Everything Presence mmWave configurator with a room-first architecture. Instead of the current device-first wizard (pick device → discover entities → create room → place device), the flow becomes: create rooms first, then add sensors to them. Built fresh on upstream main — no code carried from M001–M004.

## Why This Milestone

The device-first wizard conflates room creation with device setup. Every multi-sensor bug we fixed in M001–M004 was a symptom of this: sensors[0] hardcoded everywhere, placement defaults to {0,0} because the room doesn't exist yet, centroid-init refs compensating for wrong entry point, "Use existing" adding sensors with dummy placement then retroactively fixing it.

A room-first architecture eliminates these problems by construction — the room (with outline) always exists before a sensor touches it.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Create and manage rooms independently (draw outline, name, configure units)
- Add one or more EP sensors to any room (device selection, entity discovery, placement)
- Position and rotate sensors within the room with all sensors visible
- Configure detection zones (rectangular slots and polygon zones)
- View live tracking with targets overlaid on the room canvas
- Push zone configurations to devices

### Entry point / environment

- Entry point: http://localhost:42069 (Docker dev stack) or HA add-on ingress
- Environment: Docker dev stack with mock HA + mock EP devices
- Live dependencies involved: Home Assistant (mocked), MQTT broker (mocked)

## Completion Class

- Contract complete means: npm run build succeeds, backend tests pass, frontend tests pass, TS errors within baseline
- Integration complete means: full user flow exercised in Docker dev stack at localhost:42069
- Operational complete means: add-on runs in HA ingress with real or mock devices

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- User can create a room, draw its outline, add 2 sensors, place both, configure zones, and push to devices — all via browser at localhost:42069
- Live tracking shows targets from mock devices overlaid on the room canvas
- Refreshing the page preserves all room and sensor state

## Risks and Unknowns

- Upstream codebase quality — unknown how clean the existing backend/frontend code is; may need significant cleanup before building on it
- Entity discovery flow — the existing entity discovery is complex; understanding and potentially simplifying it is a prerequisite
- Zone push pipeline — the zone writer and device communication layer is intricate; must work correctly for the rewrite to be useful
- Ingress routing — HA add-on ingress has specific requirements for URL handling

## Existing Codebase / Prior Art

- `everything-presence-mmwave-configurator/backend/src/` — 13.5k lines, Express server with HA transport abstraction, entity discovery, zone writer, device profiles
- `everything-presence-mmwave-configurator/frontend/src/` — 27k lines, React app with RoomCanvas, ZoneCanvas, WizardPage (3.3k lines — the main problem), EntityDiscovery, furniture/floor systems
- `feature/all-milestones-m001-m004` branch — reference for what M001–M004 built; do not merge, but can study patterns and decisions

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Scope

### In Scope

- Room CRUD (create, read, update, delete rooms with outlines)
- Sensor attachment to rooms (add/remove sensors, place within room)
- Room canvas with multi-sensor rendering
- Zone configuration (rectangular and polygon)
- Zone push to devices
- Live tracking overlay
- Entity discovery per device
- Dev stack for testing (reuse existing docker-compose pattern)
- Basic settings page

### Out of Scope / Non-Goals

- Room aggregation / MQTT room devices / template helpers (M002 S03–S08 territory — future milestone)
- Firmware update UI
- Heatmap functionality
- Zone backup/restore
- Custom asset uploads
- Advanced floor materials / furniture catalog (can add later)

## Technical Constraints

- Must build on upstream main (commit 2f097aa)
- NPM workspaces: backend/ + frontend/ under everything-presence-mmwave-configurator/
- TypeScript strict mode
- Backend: Express + WebSocket, CommonJS
- Frontend: React 18 + Vite + Tailwind CSS
- Must work behind HA ingress (base URL awareness)
- Feature branch only — merge to main via PR (D079)

## Integration Points

- Home Assistant — REST API for entity state reads/writes, WebSocket for live state streaming
- EP devices — zone configuration pushed via HA entity writes
- Docker dev stack — mock HA + MQTT + mock devices for testing

## Open Questions

- How much of upstream's backend structure to keep vs rewrite? Need to assess after S01 research.
- Should the room builder and zone editor be separate pages or tabs within a room detail view?
- How to handle the "first run" experience — wizard for initial setup vs direct room creation?
