# Everything Presence — Room-First Configurator

> **⚠️ BRANCHING RULES — READ BEFORE ANY BRANCH OPERATION**
>
> - **Integration branch:** `feat/multi-device-rooms`
> - **Slice branches:** `feat/multi-device-rooms--M0xx-S0x` (double-dash separator)
> - **Always branch from `feat/multi-device-rooms`** so `.gsd/` is inherited
> - **NEVER use `gsd/` prefix branches.** The GSD default naming is overridden.
> - See D007 in DECISIONS.md for full rationale.

A rewrite of the Everything Presence mmWave configurator with a room-first architecture. Instead of the current device-first wizard (pick device → discover entities → create room → place device), the flow is: create rooms first, then add sensors to them.

## Current State

- Branch: `feat/multi-device-rooms` (M003 in progress)
- **M001 complete** — Room-first configurator rewrite delivered
- **M002 complete** — RoomCanvas generic item system: 4 extracted renderers, unified drag state machine, RoomCanvas reduced from 1988 to 894 lines
- Dashboard landing page with rooms grouped by floor
- HA import (floors + areas), manual room/floor creation
- EditorSidebar with pop-out panels (Walls, Devices, Zones, Doors, Furniture, Settings)
- Inline device attachment + entity discovery (no wizard navigation)
- Zone editing embedded in Room Builder
- Dev stack: Docker compose with HA 2026.2, Mosquitto, mock devices
- Backend: 0 TS errors, 16/16 vitest tests pass
- Frontend: 124 TS errors (non-blocking, Vite build succeeds), 52 canvas module tests pass

## Tech Stack

- **Backend**: Express + TypeScript (CommonJS, ES2021), pino logging, WebSocket for live tracking
- **Frontend**: React 18 + Vite + Tailwind CSS (ESM, ES2022), Biome for linting
- **Persistence**: JSON files (rooms.json, floors.json, settings.json)
- **Integration**: Home Assistant REST + WebSocket APIs
- **Profiles**: JSON device profiles for EP Lite, EP One, EP Pro
- **Dev**: Docker compose with HA 2026.2, Mosquitto MQTT, MQTT mock devices

## Architecture

- **Entry point**: DashboardPage (rooms grouped by floor)
- **Room editing**: RoomBuilderPage with EditorSidebar + PopOutPanel sections
- **Canvas rendering**: Generic item system in `components/canvas/` — per-type renderers (Device, Door, Furniture, Zone) with shared `ItemRenderer` interface, unified `ActiveDrag` state machine, shared geometry module
- **Device attachment**: Inline device picker + EntityDiscovery (bypasses WizardPage)
- **Navigation**: Dashboard → RoomBuilder → Save → Dashboard
- **Backend routes**: `/api/rooms`, `/api/floors`, `/api/import/ha`, `/api/health`

## Known Issues

- Frontend TS error count at 124 — unused vars and type gaps across various files (10 in canvas/ module are unused-import warnings)
- RoomCanvas at 894 lines — wall editing and coordinate transforms remain; further extraction possible but not planned
- RoomBuilderPage.tsx is 2,269 lines — refactoring candidate
- npm lockfile must use npm 10.8.2 for Docker compatibility
- HA ingress not independently verified (dev stack uses direct port)
