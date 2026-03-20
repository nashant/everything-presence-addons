# S01: Backend Foundation + Dev Stack

**Goal:** Backend boots on upstream, dev stack runs with mock HA + MQTT + mock devices, API returns devices/profiles/rooms, frontend renders at localhost:42069.
**Demo:** `docker compose -f dev/docker-compose.dev.yaml up` → browser at localhost:42069 shows dashboard, API calls to `/api/rooms`, `/api/devices`, `/api/devices/profiles` return valid JSON.

## Must-Haves

- Backend compiles and boots with upstream code (0 TS errors in backend)
- Dev stack docker-compose launches HA, Mosquitto, bootstrap, configurator, mock devices
- `/api/rooms` returns `{ rooms: [] }` (empty — no rooms created yet)
- `/api/devices` returns discovered mock EP devices (3 devices)
- `/api/devices/profiles` returns 3 device profiles (EP Lite, One, Pro)
- `/api/health` returns `{ status: "ok" }`
- Frontend loads at localhost:42069 and renders without JS errors
- Vitest runs with test helpers (MockReadTransport, MockWriteClient, testApp) and at least one smoke test passes
- Frontend TS error count ≤ 108 (upstream baseline)

## Proof Level

- This slice proves: integration (dev stack with real Docker containers)
- Real runtime required: yes (Docker dev stack)
- Human/UAT required: no (automated verification)

## Verification

- `cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit` — 0 errors
- `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"` — ≤ 108
- `cd everything-presence-mmwave-configurator && npm run build` — succeeds
- `cd everything-presence-mmwave-configurator/backend && npx vitest run` — smoke tests pass
- `docker compose -f dev/docker-compose.dev.yaml up -d` → all services healthy
- `curl -sf http://localhost:42069/api/health` returns `{"status":"ok"}`
- `curl -sf http://localhost:42069/api/rooms` returns `{"rooms":[...]}`
- `curl -sf http://localhost:42069/api/devices` returns devices array with ≥1 entry
- `curl -sf http://localhost:42069/api/devices/profiles` returns profiles array with 3 entries
- Browser at `http://localhost:42069` loads without console errors

## Observability / Diagnostics

- Runtime signals: pino structured JSON logs from Express backend (request/response logging via pino-http)
- Inspection surfaces: `/api/health` endpoint, `/api/meta` endpoint (transport status), `docker compose logs` per service
- Failure visibility: Backend logs include transport status (WS/REST), config validation errors, startup sequence
- Redaction constraints: HA tokens redacted in logs via `redactedHaConfig()`

## Integration Closure

- Upstream surfaces consumed: `backend/src/server.ts`, `backend/src/config.ts`, `backend/src/config/storage.ts`, `backend/src/routes/*`, `backend/src/domain/*`, `backend/src/ha/*`, `frontend/src/*` — all upstream code at 2f097aa
- New wiring introduced in this slice: `dev/` directory (docker-compose, bootstrap, mock-devices), `backend/src/__tests__/` (test infrastructure), vitest config
- What remains before the milestone is truly usable end-to-end: Room-first UI (S02), sensor attachment + entity discovery (S03), multi-sensor rendering (S04), zone configuration + push (S05), live tracking (S06)

## Tasks

- [x] **T01: Port dev stack infrastructure** `est:45m`
  - Why: The dev stack (HA + Mosquitto + bootstrap + mock devices) doesn't exist on upstream. It's needed for all integration verification in S01 and later slices.
  - Files: `dev/docker-compose.dev.yaml`, `dev/scripts/bootstrap-ha.sh`, `dev/scripts/verify-stack.sh`, `dev/mock-devices/`, `dev/mosquitto/`, `dev/ha-config/`, `dev/.env.dev`, `dev/.gitignore`, `dev/README.md`
  - Do: Cherry-pick the `dev/` directory from the current branch (it exists in the working tree from prior milestones). The files are self-contained — no dependencies on prior milestones code changes to backend/frontend. Verify that `docker-compose.dev.yaml` references the upstream Dockerfile correctly (`../everything-presence-mmwave-configurator` context, `standalone` target). Ensure mock-devices `package.json` and source are included. Run `npm install` in mock-devices if needed.
  - Verify: `docker compose -f dev/docker-compose.dev.yaml config` validates without errors
  - Done when: `dev/` directory exists with all infrastructure files and docker-compose validates

- [x] **T02: Port test infrastructure and add vitest** `est:30m`
  - Why: Test helpers (MockReadTransport, MockWriteClient, testApp, tempStorage) are the foundation for all backend tests. Upstream has no vitest or test setup.
  - Files: `backend/package.json`, `backend/vitest.config.ts`, `backend/src/__tests__/setup.ts`, `backend/src/__tests__/helpers/mockReadTransport.ts`, `backend/src/__tests__/helpers/mockWriteClient.ts`, `backend/src/__tests__/helpers/testApp.ts`, `backend/src/__tests__/helpers/tempStorage.ts`
  - Do: Add vitest to backend devDependencies. Port test helpers from current branch, but strip prior milestones additions: remove `mqttClient` from testApp.ts (upstream `ServerDependencies` doesn't have it), remove `MockMqttClient` import. Ensure `mockReadTransport.ts` implements the upstream `IHaReadTransport` interface (no prior milestones type additions). Port `setup.ts` for DATA_DIR temp directory. Add vitest.config.ts with setupFiles pointing to setup.ts. Write one smoke test (`src/__tests__/integration/rooms.test.ts`) that creates a testApp, hits `GET /api/rooms`, and asserts `{ rooms: [] }`.
  - Verify: `cd backend && npx vitest run` — smoke test passes
  - Done when: vitest runs, testApp creates isolated server, smoke test for `/api/rooms` passes

- [x] **T03: Verify upstream backend and frontend build** `est:20m`
  - Why: Confirm the upstream code at 2f097aa compiles cleanly and builds for production. Establishes TS error baseline.
  - Files: none modified — verification only
  - Do: Run `npx tsc --noEmit` in backend (expect 0 errors). Run `npx tsc --noEmit` in frontend (record error count as baseline — expect ~108). Run `npm run build` from workspace root. Record all baselines in task summary.
  - Verify: Backend 0 TS errors, frontend ≤ 108, `npm run build` succeeds
  - Done when: Build passes, baselines recorded

- [x] **T04: Launch dev stack and verify end-to-end** `est:30m`
  - Why: Proves the full integration: backend boots with HA creds from bootstrap, mock devices discovered, frontend serves at :42069, API endpoints return real data.
  - Files: none modified — verification only (may fix minor issues discovered)
  - Do: Run `docker compose -f dev/docker-compose.dev.yaml up -d`. Wait for all services healthy. Hit `/api/health`, `/api/rooms`, `/api/devices`, `/api/devices/profiles` via curl. Open browser at localhost:42069 and verify frontend loads. Check browser console for errors. Run `dev/scripts/verify-stack.sh` if it works against upstream. Document results.
  - Verify: All API endpoints return expected data, frontend loads, no critical console errors
  - Done when: curl to all 4 API endpoints succeeds with valid JSON, browser loads frontend, `docker compose down` cleans up

## Files Likely Touched

- `dev/docker-compose.dev.yaml`
- `dev/scripts/bootstrap-ha.sh`
- `dev/scripts/verify-stack.sh`
- `dev/mock-devices/` (entire directory)
- `dev/mosquitto/mosquitto.conf`
- `dev/ha-config/configuration.yaml`
- `dev/.env.dev`
- `dev/.gitignore`
- `dev/README.md`
- `everything-presence-mmwave-configurator/backend/package.json` (add vitest)
- `everything-presence-mmwave-configurator/backend/vitest.config.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/setup.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/helpers/mockReadTransport.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/helpers/mockWriteClient.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/helpers/testApp.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/helpers/tempStorage.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/integration/rooms.test.ts`
