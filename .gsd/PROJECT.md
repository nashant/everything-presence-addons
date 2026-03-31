# Everything Presence — Room-First Configurator

> **⚠️ BRANCHING RULES — READ BEFORE ANY BRANCH OPERATION**
>
> - **Integration branch:** `feat/multi-device-rooms`
> - **Slice branches:** `feat/multi-device-rooms--M0xx-S0x` (double-dash separator)
> - **Always branch from `feat/multi-device-rooms`** so `.gsd/` is inherited
> - **NEVER use `gsd/` prefix branches.** The GSD default naming is overridden.
> - See D007 in DECISIONS.md for full rationale.

A rewrite of the Everything Presence mmWave configurator with a room-first architecture. Instead of the current device-first wizard (pick device → discover entities → create room → place device), the flow is: create rooms first, then add sensors to them.

## Core Value

Room-level zone management with automatic coordinate translation and HA integration — users draw zones once on the room map and the system fans out translated coordinates to each covering sensor, with HA template sensors handling runtime occupancy aggregation.

## Current State

- Branch: `feat/multi-device-rooms` (M003 complete)
- **M001 complete** — Room-first configurator rewrite delivered
- **M002 complete** — RoomCanvas generic item system: 4 extracted renderers, unified drag state machine, RoomCanvas reduced from 1988 to 894 lines
- **M003 complete** — Multi-device room support: backend sensors[] data model with startup migration, frontend N-sensor colored radar cone rendering with independent drag, full device management UI (add/select/edit/remove sensors via Devices panel with per-sensor DeviceEditor and canvas selection ring)
- Dashboard landing page with rooms grouped by floor
- HA import (floors + areas), manual room/floor creation
- EditorSidebar with pop-out panels (Walls, Devices, Zones, Doors, Furniture, Settings)
- Inline device attachment + entity discovery (no wizard navigation)
- Zone editing embedded in Room Builder
- Multi-sensor rooms render N colored radar cones with independent placement
- Full multi-sensor device management: add/select/edit/remove sensors via Devices panel with per-sensor DeviceEditor
- Selection-driven emphasis: selected sensor's cone prominent, others dimmed
- Dev stack: Docker compose with HA 2026.2, Mosquitto, mock devices
- Frontend: 124 pre-existing TS errors (non-blocking, Vite build succeeds), 52 canvas module tests pass

## Architecture / Key Patterns

- **Backend**: Express + TypeScript (CommonJS, ES2021), pino logging, WebSocket for live tracking
- **Frontend**: React 18 + Vite + Tailwind CSS (ESM, ES2022), Biome for linting
- **Persistence**: JSON files (rooms.json, floors.json, settings.json)
- **Integration**: Home Assistant REST + WebSocket APIs for reads/writes, MQTT (Mosquitto) for mock devices + virtual room device discovery
- **Profiles**: JSON device profiles for EP Lite, EP One, EP Pro — each defines zone limits, FOV, range, entity templates
- **Canvas rendering**: Generic item system in `components/canvas/` — per-type renderers with shared `ItemRenderer` interface, unified `ActiveDrag` state machine
- **Zone system**: Zones stored as room-level `Zone[]` on `RoomConfig`, types: ZoneRect | ZonePolygon, zoneWriter writes device-relative coordinates to HA entities
- **Multi-sensor**: `sensors: SensorAttachment[]` on RoomConfig, per-sensor colored rendering, selection-driven dimming, `selectedItem` unified selection model
- **Dev**: Docker compose with HA 2026.2, Mosquitto MQTT, MQTT mock devices
- **HA room devices**: MQTT discovery creates virtual devices with binary_sensor (occupancy) and sensor (target count) entities per zone. Jinja2 template generators produce OR/majority/no-change-on-tie/max aggregation templates. `ep_room/` topic namespace. `IHaReadTransport.call()` exposed for WS API commands.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Room-First Configurator Rewrite — Room-first UX with dashboard, room builder, inline device attachment
- [x] M002: RoomCanvas Generic Item System — Extract renderers, unify drag state machine, reduce RoomCanvas complexity
- [x] M003: Multi-Device Room Support — Backend sensors[] model, frontend multi-sensor rendering, device management UI
- [ ] M004: Room-Level Zone System with HA Integration — Coordinate transform, zone-to-sensor assignment, virtual HA room device, template sensor aggregation

## Known Issues

- Frontend TS error count at 124 — unused vars and type gaps across various files
- RoomCanvas at 894 lines — wall editing and coordinate transforms remain
- RoomBuilderPage.tsx is ~2,260 lines — refactoring candidate
- npm lockfile must use npm 10.8.2 for Docker compatibility
- HA ingress not independently verified (dev stack uses direct port)
- Backend integration tests require Docker container filesystem (/config/)
