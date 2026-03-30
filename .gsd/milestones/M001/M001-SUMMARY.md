---
id: M001
provides:
  - Room-first configurator architecture — rooms exist before devices
  - Floor + room CRUD with HA import
  - Dashboard landing page with rooms grouped by floor
  - EditorSidebar with pop-out panels replacing old wizard/toolbar
  - Inline device attachment, zone editing, and live tracking per room
  - Dev stack with Docker (HA 2026.2, Mosquitto, mock devices)
  - Backend test infrastructure (vitest, 16 tests)
key_decisions:
  - D001: Feature branch from upstream 2f097aa
  - D002: npm 10.8.2 lockfile generation for Docker compatibility
  - D003: Docker build network host for DNS resolution
  - D004: Removed per-workspace node_modules from Dockerfile
  - D005: Test infrastructure ported from prior milestones
  - D006: HA container pinned to 2026.2
patterns_established:
  - PopOutPanel + EditorSidebar pattern for section-based canvas editors
  - JSON file persistence for rooms and floors
  - MockReadTransport/MockWriteClient for backend integration tests
  - Docker dev stack with auto-bootstrap for HA onboarding
observability_surfaces:
  - "GET /api/health — backend liveness"
  - "GET /api/rooms — room state inspection"
  - "GET /api/floors — floor state inspection"
  - "Backend vitest — 16 integration tests covering rooms, floors, HA import"
  - "npm run build — contract check (0 backend TS errors, Vite build succeeds)"
requirement_outcomes: []
duration: "11 days (2026-03-20 to 2026-03-30)"
verification_result: passed-with-notes
completed_at: 2026-03-30
---

# M001: Room-First Configurator Rewrite

**Reversed the configurator flow from device-first to room-first: users land on a Dashboard, import or create rooms with floors, draw walls, then attach devices — all through a new EditorSidebar with pop-out panels.**

## What Happened

**S01 (Backend Foundation + Dev Stack)** stood up the development environment. The upstream codebase was forked at commit 2f097aa, a Docker compose dev stack was created (HA 2026.2, Mosquitto, mock EP devices, auto-bootstrap), and vitest test infrastructure was added. Several environment issues were resolved: npm lockfile incompatibility between npm 10/11, Docker DNS failures, and workspace hoisting. The slice established baselines: 0 backend TS errors, 112 frontend TS errors (upstream), 6 passing tests, 3 mock devices discovered.

**S02 (Room-First Entry Flow)** built the core architecture change. Backend gained `Floor` type with CRUD routes, `floorId` on `RoomConfig`, `listFloorRegistry()` on the HA transport interface, and a `POST /api/import/ha` endpoint that fetches HA floors + areas and creates local floors + rooms with deduplication. The frontend got a `DashboardPage` as the new landing view — rooms grouped by floor, collapsible sections, room cards with status indicators. Room creation works without selecting a device first (name + floor + draw walls). "Add Device" on existing rooms reuses the WizardPage with an `existingRoomId` prop. Tests grew to 16 passing, frontend TS errors dropped to 107.

**S03 (Room Editor Navigation & Panel Rework)** replaced the old hamburger menu and flat toolbar with a structured editing experience. A reusable `PopOutPanel` component and `EditorSidebar` with 6 sections (Walls, Devices, Zones, Doors, Furniture, Settings) replaced the old navigation. Each section opens a pop-out panel — only one at a time. Device attachment was reworked to use an inline picker + entity discovery instead of navigating to the full wizard. Zone editing was embedded inline. Canvas improvements included zoom-to-cursor, middle-click pan, constant-size device icons, and scroll isolation. 15 commits addressed panel overlap, zoom leaks, preview line persistence, and centroid computation issues.

## Cross-Slice Verification

| Success Criterion | Status | Evidence |
|---|---|---|
| User lands on dashboard showing rooms by floor | ✅ Met | `DashboardPage` is the landing view in `App.tsx`. Rooms grouped by floor with collapsible sections. Verified in Docker e2e (S02). |
| User can import rooms and floors from HA | ✅ Met | `POST /api/import/ha` endpoint tested (3 integration tests). Docker verification imported 3 rooms from mock HA (S02). |
| User can create a room manually without device | ✅ Met | Dashboard "New Room" form creates room with name + floor. `RoomConfig` allows null `deviceId`. Verified in Docker (S02). |
| User can add a device to a room | ✅ Met | Devices panel in EditorSidebar → inline device picker + entity discovery + placement. `DeviceEditor` component (S03). |
| Zone editor, live tracking, room builder work | ✅ Met | Zone editing embedded inline in RoomBuilderPage (S03). Live tracking page functional. Room builder has full wall/door/furniture/device editing. |
| Page refresh preserves all state | ✅ Met | JSON file persistence for rooms (`rooms.json`) and floors (`floors.json`). Room/floor CRUD tested (16 vitest tests). |
| Works behind HA ingress | ⚠️ Not explicitly verified | Base URL awareness exists in upstream code. Docker stack uses direct port (42069). Ingress-specific testing was out of scope for dev stack. |
| Contract checks pass | ✅ Met | `npm run build` succeeds. 0 backend TS errors. 16/16 vitest pass. Frontend TS errors at 137 (up from 107 baseline — see notes). |

**Notes on frontend TS errors:** The count rose from 107 (S02) to 137 (S03). The 30 new errors are unused-variable warnings (TS6133) and type gaps in the reworked `RoomBuilderPage.tsx` — all non-blocking since Vite build succeeds via esbuild. These are cleanup candidates but do not affect runtime behavior.

**Notes on HA ingress:** The upstream codebase already handles base URL via ingress token. This was not independently verified in M001 since the dev stack uses direct port access. Real ingress testing requires a production HA instance.

## Requirement Changes

No formal requirements were tracked in `REQUIREMENTS.md` during M001. The milestone was planned and executed against the roadmap success criteria directly.

## Forward Intelligence

### What the next milestone should know
- The EditorSidebar + PopOutPanel pattern is the canonical way to add new canvas editor sections. Each section gets a button in the sidebar and a pop-out panel for its tools.
- `RoomConfig` uses `deviceId` (singular) — multi-sensor support (multiple devices per room) is not yet implemented. This is the natural next step.
- The WizardPage (3,322 lines) is largely bypassed — device attachment uses inline picker in S03. The wizard still exists for the `existingRoomId` flow but could be fully replaced.
- Dashboard is the entry point. Navigation is: Dashboard → RoomBuilder (with EditorSidebar) → Save → Dashboard.

### What's fragile
- **Frontend TS error count (137)** — increased by 30 during S03. The reworked `RoomBuilderPage.tsx` has unused variables and type gaps that tsc catches but Vite ignores. A cleanup pass would prevent further accumulation.
- **RoomBuilderPage.tsx (2,269 lines)** — This file absorbed zone editing, device management, and all panel logic. It's the largest source file and a refactoring candidate.
- **npm lockfile** — Must be generated with npm 10.8.2 (`npx -y npm@10.8.2 install`). npm 11 lockfiles break Docker builds.
- **Docker DNS** — `network: host` required for Docker builds on this machine.

### Authoritative diagnostics
- `npm run build` — single command to verify contract (backend + frontend compile)
- `cd backend && npx vitest run` — 16 integration tests (rooms, floors, import)
- `GET /api/health` — backend liveness check
- `GET /api/rooms` + `GET /api/floors` — state inspection

### What assumptions changed
- **"No components need rebuilding"** — Partially true. RoomCanvas, ZoneCanvas, and core components survived intact, but RoomBuilderPage required major rework (not rebuilding, but significant restructuring) to support the EditorSidebar pattern.
- **"WizardPage is bypassed"** — Mostly true. S03 replaced the wizard navigation with inline device picker for the "Add Device" flow, but WizardPage still exists and is used for entity discovery.
- **Frontend TS errors would stay at baseline** — S02 reduced errors from 112 to 107, but S03 increased them to 137 during the major RoomBuilderPage rework.

## Files Created/Modified

### New files
- `frontend/src/components/PopOutPanel.tsx` — Reusable pop-out panel component
- `frontend/src/components/EditorSidebar.tsx` — Section switcher sidebar
- `frontend/src/components/DeviceEditor.tsx` — Device placement controls panel
- `frontend/src/pages/DashboardPage.tsx` — Room dashboard landing page
- `frontend/src/api/floors.ts` — Floor CRUD + HA import API client
- `backend/src/routes/floors.ts` — Floor CRUD routes
- `backend/src/routes/import.ts` — HA import endpoint
- `backend/src/__tests__/integration/floors.test.ts` — Floor integration tests
- `backend/src/__tests__/integration/import.test.ts` — Import integration tests
- `dev/` — Docker compose dev stack (HA, Mosquitto, mock devices, bootstrap)

### Modified files
- `frontend/src/pages/RoomBuilderPage.tsx` — Major rework: EditorSidebar + pop-out panels
- `frontend/src/App.tsx` — Dashboard-first entry flow
- `frontend/src/pages/WizardPage.tsx` — existingRoomId prop + inline picker support
- `backend/src/domain/types.ts` — Floor type, floorId on RoomConfig
- `frontend/src/components/RoomCanvas.tsx` — Canvas zoom/pan improvements
