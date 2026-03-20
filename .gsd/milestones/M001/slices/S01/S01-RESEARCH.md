# S01: Backend Foundation + Dev Stack — Research

**Date:** 2026-03-19

## Summary

S01 must deliver: (1) backend booting on upstream main (2f097aa), (2) a Docker dev stack with mock HA + MQTT + mock devices, (3) API endpoints returning devices/profiles/rooms at localhost:42069, and (4) a frontend shell that renders. This is a "build on upstream, not rewrite" slice — the upstream backend is already well-structured with DI, storage abstraction, and route factories. The challenge is that the backend *requires* HA credentials to boot (`loadConfig()` throws without them), and the dev stack infrastructure (bootstrap scripts, mock devices, docker-compose) doesn't exist on upstream.

The upstream codebase is highly capable: 46 backend source files, 57 frontend source files, JSON-file persistence, Express route factory pattern with DI, abstract transport layer, device profile loader from JSON configs, and ingress-aware API client. Backend is TS-clean (0 errors). Frontend has 108 pre-existing TS errors (all in upstream — unused vars, type mismatches in ZoneEditorPage, WizardPage complexity). The WizardPage alone is 3,322 lines — this is the component we're eventually replacing with the room-first flow, but S01 doesn't touch it.

The dev stack from prior milestones (`dev/` directory) is battle-tested: docker-compose with HA 2026.2, Mosquitto, auto-bootstrap (onboarding + MQTT setup + long-lived token via WebSocket), and MQTT mock devices that generate auto-discovery payloads from real device profiles. This infrastructure can be cherry-picked cleanly — it's self-contained with no dependencies on prior milestones code changes.

## Recommendation

**Approach: Upstream + cherry-pick dev stack + minimal frontend shell**

1. **Backend**: Use upstream as-is. The server.ts `createServer()` already has a `deps?` optional pattern — routes that don't need HA (rooms, settings, zones, custom-assets) work without deps. The issue is `index.ts` which calls `loadConfig()` unconditionally. Fix: make config HA detection graceful (warn + continue without HA deps when creds aren't set, or use the dev stack which provides creds via bootstrap).

2. **Dev stack**: Cherry-pick the entire `dev/` directory from the current branch. It works against upstream's Dockerfile (standalone target). The bootstrap script, mock devices, mosquitto config, and docker-compose are independent of prior milestones code changes. Verify by building the configurator from upstream sources.

3. **Frontend shell**: The upstream frontend is a monolithic `App.tsx` with view switching (no React Router). For S01, keep this pattern. The frontend already renders and calls the API. The only question is whether to strip it down or leave it intact. Recommendation: leave it intact for S01 — it proves the "frontend renders and talks to API" deliverable. S02 introduces the room-first UI changes.

4. **Test infrastructure**: Port the test helpers (MockReadTransport, MockWriteClient, testApp, tempStorage) from M001. These are the foundation for all integration tests in later slices. Add vitest to backend devDependencies.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| HA onboarding + token creation | `dev/scripts/bootstrap-ha.sh` (current branch) | 270-line battle-tested script handling onboarding, MQTT setup, WS long-lived token — extremely tricky to get right |
| Mock EP devices with MQTT discovery | `dev/mock-devices/` (current branch) | 760-line Node.js service that reads real device profiles and generates proper MQTT auto-discovery payloads |
| Test app harness with mock transports | `backend/src/__tests__/helpers/testApp.ts` (current branch) | Creates isolated Express+WS server on random port with MockReadTransport/MockWriteClient — used by 85+ tests in prior milestones |
| JSON file persistence for rooms | `backend/src/config/storage.ts` (upstream) | Already handles rooms, settings, custom floors, custom furniture with ensureDataDir, read/write/CRUD operations |
| Device profile loading | `backend/src/domain/deviceProfiles.ts` (upstream) | Loads JSON profiles from config dir, provides profile lookup by ID |
| Ingress-aware API client | `frontend/src/api/client.ts` (upstream) | `ingressAware()` function adjusts base URLs for HA ingress routing |

## Existing Code and Patterns

### Backend (upstream, reusable as-is)

- `backend/src/server.ts` — Express factory with optional deps pattern. Routes without HA deps (rooms, settings, zones, custom-assets, device-mappings) mount unconditionally. HA-dependent routes gated behind `if (deps)`. **Reuse as-is.**
- `backend/src/config/storage.ts` — JSON file persistence singleton for rooms, settings, custom assets. `DATA_DIR` from env, auto-creates directory. **Reuse as-is.**
- `backend/src/routes/rooms.ts` — Full CRUD with normalizeRoom parser, parseZone, parseRoomShell, etc. 260+ lines. **Reuse as-is.**
- `backend/src/domain/deviceProfiles.ts` — Loads JSON profiles from `config/device-profiles/`. Three profiles: EP Lite, EP One, EP Pro. **Reuse as-is.**
- `backend/src/domain/deviceDiscovery.ts` — Discovers EP devices from HA device registry, filters by manufacturer. **Reuse as-is.** Needs HA transport.
- `backend/src/ha/readTransport.ts` — `IHaReadTransport` interface abstraction. WS and REST implementations. **Reuse as-is.**
- `backend/src/ha/writeClient.ts` — `IHaWriteClient` for writing entity states. **Reuse as-is.**
- `backend/src/index.ts` — Entry point that orchestrates config, transports, profile loader, server. **Must modify** — currently `loadConfig()` throws without HA creds. The dev stack solves this by providing creds, so no code change needed if we use the dev stack.
- `backend/src/routes/liveWs.ts` — WebSocket server for live state streaming. Subscribes to HA state changes and broadcasts to frontend clients. **Reuse as-is.**

### Frontend (upstream, reusable as-is for S01)

- `frontend/src/App.tsx` — Root component with view switching (dashboard/wizard/zoneEditor/roomBuilder/liveTracking/settings). 100+ lines of state management. **Reuse for S01; replace in S02+.**
- `frontend/src/api/client.ts` — `ingressAware()` + fetch wrappers for devices, profiles, settings. **Reuse as-is.**
- `frontend/src/api/rooms.ts` — Room CRUD client (fetchRooms, createRoom, updateRoom, deleteRoom). **Reuse as-is.**
- `frontend/src/pages/WizardPage.tsx` — 3,322 lines. The device-first wizard. **Don't touch in S01. Replace in S02+.**
- `frontend/src/components/RoomCanvas.tsx` — 1,685 lines. 2D SVG renderer for room outlines, furniture, doors, sensors, targets. **Reuse heavily in S02+.**

### Dev Stack (prior milestones branch, cherry-pick)

- `dev/docker-compose.dev.yaml` — HA 2026.2 + Mosquitto + bootstrap + configurator + mock-devices. **Cherry-pick.**
- `dev/scripts/bootstrap-ha.sh` — Full HA programmatic onboarding (create user, exchange tokens, set up MQTT integration, create long-lived token via WebSocket). **Cherry-pick.**
- `dev/mock-devices/` — MQTT auto-discovery from real device profiles. Simulates 3 EP device types with moving targets. **Cherry-pick.**
- `dev/scripts/verify-stack.sh` — Health check script for the dev stack. **Cherry-pick.**

### Test Infrastructure (prior milestones branch, cherry-pick)

- `backend/src/__tests__/helpers/mockReadTransport.ts` — In-memory mock implementing `IHaReadTransport` with configurable devices, entities, states.
- `backend/src/__tests__/helpers/mockWriteClient.ts` — Mock `IHaWriteClient` that records all writes for assertions.
- `backend/src/__tests__/helpers/testApp.ts` — Spins up isolated Express+WS server on random port with mock transports.
- `backend/src/__tests__/helpers/tempStorage.ts` — Temporary data dir for test isolation.
- `backend/src/__tests__/setup.ts` — Vitest setup file for DATA_DIR isolation.

## Constraints

- **Must build on upstream main (2f097aa)** — no merging prior milestones feature branch code. Cherry-pick infrastructure only.
- **Backend requires HA creds to boot** — `loadConfig()` throws without `SUPERVISOR_TOKEN` or `HA_BASE_URL + HA_LONG_LIVED_TOKEN`. The dev stack bootstrap solves this, but local `npm run dev` won't work without `.env`.
- **NPM workspaces** — root `package.json` at `everything-presence-mmwave-configurator/` orchestrates backend + frontend.
- **Backend is CommonJS (ES2021)**, frontend is ESM (ES2022) — different module systems.
- **Frontend has 108 pre-existing TS errors** — all on upstream, mostly unused vars and type mismatches in ZoneEditorPage/WizardPage. S01 must not increase this count.
- **Backend is TS-clean (0 errors)** — must stay clean.
- **Device profiles are JSON files** in `config/device-profiles/` — 3 profiles (EP Lite, EP One, EP Pro). Loaded by DeviceProfileLoader.
- **Feature branch only** — work on `gsd/M001/S01`, no direct pushes to main (D079).

## Common Pitfalls

- **Cherry-picking test infrastructure without vitest dependency** — Upstream backend `package.json` has no vitest. Must add `vitest` to devDependencies when porting test helpers. The `testApp.ts` imports from `../../server` and `../../routes/liveWs` — these paths must match upstream's file structure.
- **Mock device profile path mismatch** — `testApp.ts` uses `path.resolve(__dirname, '../../../../config/device-profiles')`. This assumes the test file is at `src/__tests__/helpers/testApp.ts` and profiles are at `config/device-profiles/` relative to the backend root. Verify this path resolves correctly.
- **Storage DATA_DIR in tests** — Tests need `DATA_DIR` env set to a temp directory. The `setup.ts` file handles this, but must be configured in `vitest.config.ts`.
- **Docker context for configurator build** — The Dockerfile's build context is `everything-presence-mmwave-configurator/`, but docker-compose.dev.yaml references it as `../everything-presence-mmwave-configurator`. Paths must match.
- **Bootstrap script Python dependency** — The WebSocket long-lived token creation uses inline Python3 for raw WebSocket manipulation. The Alpine image needs `python3` installed (the script does `apk add --no-cache curl python3`).
- **HA 2026.2 onboarding API** — Pinned to 2026.2 (D043). The onboarding API may differ in other versions. Don't upgrade without testing bootstrap.

## Open Risks

- **Upstream code may have changed since 2f097aa** — If upstream merges new PRs, we'd need to rebase. Low risk for S01 since we're starting a feature branch.
- **Frontend 108 TS errors on upstream** — Some may interact with new code we write in later slices. S01 establishes the baseline; later slices must not increase it.
- **Docker build time** — The configurator Dockerfile does a full `npm ci --include=dev` + `npm run build --workspaces`. First build will be slow. Subsequent builds use layer caching.
- **Mock devices vs upstream profiles** — The mock device service reads device profiles from a mounted volume. If upstream profile JSON format has changed since the mock devices were written, discovery payloads may be wrong. Verify by checking `verify-stack.sh` output.
- **Test infrastructure from prior milestones references types not on upstream** — Some test files may import types (e.g., `SensorAttachment`, `RoomZone`) that were added in prior milestones and don't exist on upstream. Must audit and only port the subset that works against upstream types.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Express/TypeScript backend | `wshobson/agents@nodejs-backend-patterns` | available (10.8K installs) |
| Docker Compose | `affaan-m/everything-claude-code@docker-patterns` | available (1.3K installs) |
| React/Vite/Tailwind | `jezweb/claude-skills@tailwind-v4-shadcn` | available (2.7K installs, but Tailwind v4 — we use v3) |
| Frontend design | `frontend-design` | installed ✅ |
| SwiftUI | `swiftui` | installed (not relevant) |

Note: The `wshobson/agents@nodejs-backend-patterns` skill has 10.8K installs and could be useful for backend patterns. However, the upstream codebase already has well-established patterns (DI via route factories, transport abstraction, storage singleton). Installing it is optional — the existing patterns are sufficient.

## Key Architectural Observations

### What upstream gives us for free

1. **Room CRUD** — Full create/read/update/delete with robust parsing/normalization
2. **Device discovery** — Manufacturer-filtered discovery via HA device registry
3. **Profile system** — JSON profiles with entity definitions, limits, capabilities
4. **Entity mapping** — Full EntityMappings type with zone/target entity resolution
5. **Zone read/write** — ZoneWriter and ZoneReader for pushing/reading zones via HA
6. **Live tracking WebSocket** — Frontend ↔ backend ↔ HA state subscription pipeline
7. **Settings persistence** — Wizard state tracking
8. **Ingress routing** — Frontend `ingressAware()` + backend path handling

### What's missing for M001

1. **Room-first UI** — WizardPage is device-first; need new room creation flow (S02)
2. **Sensor attachment model** — Upstream uses `room.deviceId` (singular). prior milestones added `sensors[]` array, but we're not carrying that code. S03 must re-implement.
3. **Dev stack** — No `dev/` directory on upstream. Cherry-pick from branch.
4. **Test infrastructure** — No vitest, no test helpers on upstream. Cherry-pick from branch.
5. **Frontend routing** — Upstream uses view switching in App.tsx state, no React Router.

### What to cherry-pick vs rebuild

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| `dev/docker-compose.dev.yaml` | Cherry-pick | Battle-tested, self-contained |
| `dev/scripts/bootstrap-ha.sh` | Cherry-pick | Complex WS token creation — don't rewrite |
| `dev/mock-devices/` | Cherry-pick | 760 lines of MQTT discovery from real profiles |
| `dev/mosquitto/`, `dev/ha-config/` | Cherry-pick | Config files, trivial |
| Test helpers (mockReadTransport, testApp, etc.) | Cherry-pick + audit | May reference prior milestones types |
| `backend/src/__tests__/setup.ts` | Cherry-pick | vitest DATA_DIR setup |
| Backend room/storage/routes | Keep upstream | Already works |
| Frontend shell | Keep upstream | Proves "renders and talks to API" |

## Sources

- Upstream backend entry point: `git show 2f097aa:everything-presence-mmwave-configurator/backend/src/index.ts`
- Upstream server factory: `git show 2f097aa:everything-presence-mmwave-configurator/backend/src/server.ts`
- Upstream config: `git show 2f097aa:everything-presence-mmwave-configurator/backend/src/config.ts`
- Upstream storage: `git show 2f097aa:everything-presence-mmwave-configurator/backend/src/config/storage.ts`
- Upstream rooms route: `git show 2f097aa:everything-presence-mmwave-configurator/backend/src/routes/rooms.ts`
- Upstream frontend App: `git show 2f097aa:everything-presence-mmwave-configurator/frontend/src/App.tsx`
- Dev stack docker-compose: `dev/docker-compose.dev.yaml` (current branch)
- Dev stack bootstrap: `dev/scripts/bootstrap-ha.sh` (current branch)
- Mock devices: `dev/mock-devices/src/index.ts` (current branch)
- Test harness: `backend/src/__tests__/helpers/testApp.ts` (current branch)
- Decision register: `.gsd/DECISIONS.md` (D007, D012, D013, D014, D043, D058, D079)
