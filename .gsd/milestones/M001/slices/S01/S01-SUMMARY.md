---
status: complete
started: 2026-03-20
completed: 2026-03-20
tasks_completed: 4
tasks_total: 4
---

# S01: Backend Foundation + Dev Stack — Summary

## What Was Done

1. **Dev stack ported** — `dev/` directory with docker-compose (HA 2026.2 + Mosquitto + bootstrap + mock devices + configurator). All self-contained.
2. **Test infrastructure added** — vitest + MockReadTransport, MockWriteClient, testApp, tempStorage. 6 smoke tests pass (rooms CRUD, health, profiles).
3. **Build verified** — Backend 0 TS errors, frontend 112 (upstream baseline), `npm run build` succeeds.
4. **End-to-end verified** — Docker stack launches, all API endpoints return valid data, frontend loads with 3 mock devices, no console errors.

## Issues Encountered and Resolved

- **npm lockfile incompatibility**: npm 11 (local) generated a lockfile that npm 10 (Docker node:20-alpine) couldn't parse ("Exit handler never called"). Fixed by regenerating with `npx -y npm@10.8.2 install`.
- **Docker DNS failure**: Docker build couldn't reach registry.npmjs.org via default bridge network. Fixed by adding `network: host` to compose build config.
- **npm workspace hoisting**: `backend/node_modules` doesn't exist when npm workspaces hoist to root. Removed per-workspace `node_modules` COPY from Dockerfile.

## Key Baselines

| Metric | Value |
|--------|-------|
| Backend TS errors | 0 |
| Frontend TS errors | 112 |
| Backend vitest | 6/6 pass |
| Mock devices discovered | 3 (mock_ep_lite_1, mock_ep_lite_2, mock_ep_one_1) |
| Device profiles | 3 (EP Lite, EP One, EP Pro) |

## Forward Intelligence

- **Dockerfile needs `network: host` for builds** — Docker DNS on this machine can't resolve npm registry via default bridge. All compose builds must use `network: host`.
- **npm lockfile must be generated with npm 10** — Local npm is v11. Use `npx -y npm@10.8.2 install` when adding deps, or the Docker build will fail.
- **Frontend has 112 pre-existing TS errors** — All upstream. Don't try to fix them in M001 scope. Later slices must not increase the count.
- **WizardPage is 3,322 lines** — This is the device-first wizard. S02 replaces it with room-first UI. Don't try to modify it.
- **upstream `RoomConfig` uses `deviceId` (singular)** — No `sensors[]` array. S03 must add this for multi-sensor support.
