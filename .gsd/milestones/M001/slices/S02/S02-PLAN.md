# S02: Room-First Entry Flow

**Goal:** Replace the device-first wizard with a room-first dashboard. Users create rooms (with optional HA import), draw walls, then add a device. Floors organize rooms.
**Demo:** At localhost:42069 — dashboard shows rooms grouped by floor. "Import from HA" pulls floors + areas. "New Room" creates a room without a device. "Add Device" on a room triggers device select → entity discovery → placement. Zone editor and live tracking work for the room.

## Must-Haves

- Floor type + CRUD (backend + frontend)
- `floorId` on `RoomConfig`
- HA floor registry fetch (`listFloorRegistry()` on transport)
- HA import endpoint (floors + areas → local floors + rooms)
- Dashboard landing page with rooms grouped by floor
- Room creation flow: name + floor + walls (no device)
- "Add Device" flow on existing room (device select → entity discovery → placement)
- Navigation between dashboard ↔ room builder ↔ zone editor ↔ live tracking
- WizardPage bypassed (auto-redirect to dashboard)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (Docker dev stack)
- Human/UAT required: yes (final flow walkthrough)

## Verification

- `cd backend && npx vitest run` — all existing tests pass + new floor/import tests
- `npm run build` — 0 backend TS errors, frontend errors ≤ 112
- Docker: `curl localhost:42069/api/floors` → returns floors array
- Docker: `curl -X POST localhost:42069/api/import/ha` → imports floors + rooms from mock HA
- Browser: navigate to localhost:42069 → see dashboard (not wizard)
- Browser: create room from dashboard → draw walls → save → room appears
- Browser: "Add Device" on room → select device → entity discovery → placement
- Browser: zone editor + live tracking accessible from room

## Observability / Diagnostics

- Runtime signals: pino structured logs for floor CRUD, HA import (counts imported/skipped)
- Inspection surfaces: `GET /api/floors`, `GET /api/rooms` show current state
- Failure visibility: HA import returns `{ floors: { imported, skipped }, rooms: { imported, skipped } }` with skip reasons
- Redaction constraints: none (no secrets in floor/room data)

## Integration Closure

- Upstream surfaces consumed: `IHaReadTransport.listAreaRegistry()`, `storage` (rooms.json), `createServer()` route mounting, `App.tsx` view switching
- New wiring: `listFloorRegistry()` on transport, `/api/floors` route, `/api/import/ha` route, `floorId` on `RoomConfig`, new `DashboardPage` component, modified `App.tsx` entry flow
- What remains before milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [ ] **T01: Floor backend — type, storage, CRUD route, HA transport** `est:1h`
  - Why: Floors are the new organizational layer. Need the type, persistence, API, and HA floor registry fetch before anything else.
  - Files: `backend/src/domain/types.ts`, `backend/src/config/storage.ts`, `backend/src/routes/floors.ts` (new), `backend/src/ha/readTransport.ts`, `backend/src/ha/wsReadTransport.ts`, `backend/src/ha/restReadTransport.ts`, `backend/src/__tests__/helpers/mockReadTransport.ts`, `backend/src/server.ts`
  - Do:
    1. Add `Floor` interface to `domain/types.ts`: `{ id: string; name: string; level: number; icon?: string | null }`
    2. Add `floorId?: string` to `RoomConfig`
    3. Add `FloorRegistryEntry` to `readTransport.ts` and `listFloorRegistry()` to `IHaReadTransport`
    4. Implement in `wsReadTransport.ts` (`config/floor_registry/list`) and `restReadTransport.ts`
    5. Add `addFloor()`, `listFloorRegistry()` to `MockReadTransport`
    6. Add `floors.json` read/write to `storage.ts` following the rooms pattern
    7. Create `routes/floors.ts` with GET/POST/PUT/DELETE
    8. Mount in `server.ts` (no HA deps needed for CRUD)
  - Verify: `npx vitest run` passes, `npm run build` — 0 backend TS errors
  - Done when: `GET /api/floors` returns `{ floors: [] }`, floor CRUD works, `listFloorRegistry()` exists on transport interface

- [ ] **T02: HA import endpoint** `est:45m`
  - Why: The "Import from HA" button needs a backend endpoint that fetches HA floors + areas and creates local floors + rooms.
  - Files: `backend/src/routes/import.ts` (new), `backend/src/server.ts`, `backend/src/__tests__/integration/import.test.ts` (new)
  - Do:
    1. Create `routes/import.ts` with `createImportRouter({ readTransport })` factory
    2. `POST /api/import/ha` — calls `readTransport.listFloorRegistry()` + `readTransport.listAreaRegistry()`
    3. For each HA floor: check if local floor with same name exists, skip if so, create if not. Map HA `floor_id` → local floor `id`.
    4. For each HA area: check if local room with same name exists, skip if so. Create room with `name`, `floorId` (mapped from area's `floor_id`), `units: 'metric'`, empty zones. No `deviceId` — room-first means no device yet.
    5. Return `{ floors: { imported: N, skipped: N, items: [...] }, rooms: { imported: N, skipped: N, items: [...] } }`
    6. Mount in `server.ts` inside the `if (deps)` block (needs `readTransport`)
    7. Write integration test with MockReadTransport seeded with areas + floors
  - Verify: `npx vitest run` passes, new import test passes
  - Done when: Import endpoint creates floors + rooms from mock HA data, skips duplicates, returns counts

- [ ] **T03: Frontend — floor types, API client, RoomConfig.floorId** `est:30m`
  - Why: Frontend needs the floor type, API calls, and updated RoomConfig before building the dashboard.
  - Files: `frontend/src/api/types.ts`, `frontend/src/api/floors.ts` (new), `frontend/src/api/rooms.ts`, `frontend/src/api/client.ts`
  - Do:
    1. Add `Floor` interface to `api/types.ts`: `{ id: string; name: string; level: number; icon?: string | null }`
    2. Add `floorId?: string` to frontend `RoomConfig`
    3. Create `api/floors.ts` — `fetchFloors()`, `createFloor()`, `updateFloor()`, `deleteFloor()`, `importFromHA()`
    4. Export `importFromHA` in client
  - Verify: `npm run build` — frontend TS errors ≤ 112
  - Done when: Floor API client exists, `RoomConfig.floorId` in frontend types

- [ ] **T04: Dashboard page + room-first App.tsx** `est:2h`
  - Why: This is the core UX change — replacing wizard-first with dashboard-first.
  - Files: `frontend/src/pages/DashboardPage.tsx` (new), `frontend/src/App.tsx`
  - Do:
    1. Create `DashboardPage` component:
       - Fetches floors + rooms on mount
       - Groups rooms by floor (+ "Unassigned" for rooms without floorId)
       - Floor sections are collapsible, sorted by `level`
       - Each room card shows: name, device name (if linked), buttons for Room Builder / Zone Editor / Live Tracking
       - "New Room" button → inline form or modal: name, floor select, then navigates to room builder for wall drawing
       - "Import from HA" button → calls import endpoint, refreshes floors + rooms
       - "Add Device" button on deviceless rooms → navigates to wizard-style device attachment flow
       - "New Floor" button → inline form: name, level
    2. Modify `App.tsx`:
       - Default view stays `'dashboard'` but renders `DashboardPage` instead of `LiveTrackingPage`
       - Remove auto-wizard-launch logic (the `if (!wizardCompleted && rooms.length === 0)` block)
       - Keep all existing view routes (wizard, zoneEditor, roomBuilder, liveTracking, settings)
       - Pass `onNavigate`, `onRoomChange` etc. to DashboardPage
    3. Style using existing Tailwind utilities + glass-card pattern from upstream
  - Verify: `npm run build` passes, browser at localhost:42069 shows dashboard with floor groups
  - Done when: Dashboard renders rooms by floor, "New Room" creates deviceless room, "Import from HA" works

- [ ] **T05: "Add Device" flow on existing room** `est:1h`
  - Why: Rooms created without a device need a way to attach one later — this completes the room-first cycle.
  - Files: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/App.tsx`
  - Do:
    1. "Add Device" on a room navigates to a simplified wizard-like flow:
       - Step 1: Select device from available devices (reuse device list from WizardPage or fetch directly)
       - Step 2: Entity discovery (reuse `EntityDiscovery` component)
       - Step 3: Place device on canvas (navigate to RoomBuilder with the room + newly assigned device)
    2. This can reuse the existing WizardPage by pre-setting the room and jumping to the device step, OR create a lightweight `AddDeviceFlow` component. Decide based on complexity — if WizardPage can accept an existing room, reuse it; otherwise build a simple 2-step flow.
    3. After device is added: room's `deviceId`, `profileId`, `entityMappings` are set via `updateRoom()`. User lands on room builder to place the device.
  - Verify: Browser — create room → "Add Device" → pick device → entity discovery → placement → room builder shows device on canvas
  - Done when: Full room-first flow works: create room → draw walls → add device → place device → zones → live tracking

- [ ] **T06: End-to-end Docker verification + cleanup** `est:30m`
  - Why: Final integration check in Docker dev stack with mock HA. Commit all work.
  - Files: (verification only, no new files)
  - Do:
    1. Build Docker image: `docker build --network host -f Dockerfile . --target standalone`
    2. Launch dev stack: `docker compose -f dev/docker-compose.dev.yaml up -d`
    3. Verify all endpoints: `/api/floors`, `/api/rooms`, `/api/devices`, `/api/import/ha`
    4. Browser walkthrough: import from HA → see floors + rooms → create manual room → draw walls → add device → zone editor → live tracking
    5. Verify page refresh preserves state
    6. Check no console errors
    7. Run `npx vitest run` — all tests pass
    8. Commit with clear message
  - Verify: All checks above pass
  - Done when: Full flow works in Docker, tests pass, committed

## Files Likely Touched

- `backend/src/domain/types.ts`
- `backend/src/config/storage.ts`
- `backend/src/ha/readTransport.ts`
- `backend/src/ha/wsReadTransport.ts`
- `backend/src/ha/restReadTransport.ts`
- `backend/src/__tests__/helpers/mockReadTransport.ts`
- `backend/src/routes/floors.ts` (new)
- `backend/src/routes/import.ts` (new)
- `backend/src/server.ts`
- `backend/src/__tests__/integration/floors.test.ts` (new)
- `backend/src/__tests__/integration/import.test.ts` (new)
- `frontend/src/api/types.ts`
- `frontend/src/api/floors.ts` (new)
- `frontend/src/pages/DashboardPage.tsx` (new)
- `frontend/src/App.tsx`
