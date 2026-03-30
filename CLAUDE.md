# CLAUDE.md — Agent Instructions

## Critical: Branch Strategy

**The active development branch is `feat/multi-device-rooms`.** This branch contains all delivered work from M001 (Room-First Rewrite), M002 (RoomCanvas Generic Item System), and M003 (Multi-Device Room Support, in progress).

**`main` does NOT contain this work.** It has not been merged yet.

**Rules:**
- All new work (milestones, slices, tasks) MUST branch from `feat/multi-device-rooms`
- NEVER branch from `main` for feature work
- NEVER create new milestone branches off `main`
- Before starting any work, verify you are on `feat/multi-device-rooms` or a sub-branch of it
- If GSD tries to create a slice branch, it must be based on `feat/multi-device-rooms`

**Branch lineage:** `main` → `feat/room-first-ux` (M001–M002) → `feat/multi-device-rooms` (M003+)

## Project

Everything Presence mmWave configurator — a Home Assistant add-on with React frontend and Express backend. Room-first architecture: create rooms, draw walls, attach sensors, configure zones.

## Dev Stack

- `cd dev && docker compose -f docker-compose.dev.yaml up -d --build` — full stack at localhost:42069
- Backend: `cd everything-presence-mmwave-configurator && npm run dev`
- Frontend: `cd everything-presence-mmwave-configurator/frontend && npm run dev`
- Tests: `cd everything-presence-mmwave-configurator && npx vitest run`

## Key Paths

- Backend source: `everything-presence-mmwave-configurator/backend/src/`
- Frontend source: `everything-presence-mmwave-configurator/frontend/src/`
- Device profiles: `everything-presence-mmwave-configurator/config/device-profiles/`
- Docker dev stack: `dev/`
- GSD planning: `.gsd/`
