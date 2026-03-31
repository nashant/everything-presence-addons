---
id: T02
parent: S03
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/routes/rooms.ts", "everything-presence-mmwave-configurator/backend/src/server.ts", "everything-presence-mmwave-configurator/frontend/src/api/zones.ts", "everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx"]
key_decisions: ["Rooms router accepts optional deps (writeClient + profileLoader) — keeps basic CRUD working without HA, apply-zones returns 503 when HA unavailable", "Zone write failure in handleSaveRoom is non-fatal — room data persists, zone errors logged to console for S05 UI"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Backend tsc: 0 new errors from changed files. Frontend tsc: 0 new errors from changed files. All 22 orchestrator tests pass. All 89 S01 tests pass. All 246 passing tests pass with 23 pre-existing Docker-dependent integration test failures."
completed_at: 2026-03-31T14:22:12.399Z
blocker_discovered: false
---

# T02: Added POST /api/rooms/:roomId/apply-zones route calling RoomZoneOrchestrator, frontend applyRoomZones() API function, and wired handleSaveRoom to auto-apply zones after successful room PUT

> Added POST /api/rooms/:roomId/apply-zones route calling RoomZoneOrchestrator, frontend applyRoomZones() API function, and wired handleSaveRoom to auto-apply zones after successful room PUT

## What Happened
---
id: T02
parent: S03
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - everything-presence-mmwave-configurator/backend/src/server.ts
  - everything-presence-mmwave-configurator/frontend/src/api/zones.ts
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
key_decisions:
  - Rooms router accepts optional deps (writeClient + profileLoader) — keeps basic CRUD working without HA, apply-zones returns 503 when HA unavailable
  - Zone write failure in handleSaveRoom is non-fatal — room data persists, zone errors logged to console for S05 UI
duration: ""
verification_result: passed
completed_at: 2026-03-31T14:22:12.400Z
blocker_discovered: false
---

# T02: Added POST /api/rooms/:roomId/apply-zones route calling RoomZoneOrchestrator, frontend applyRoomZones() API function, and wired handleSaveRoom to auto-apply zones after successful room PUT

**Added POST /api/rooms/:roomId/apply-zones route calling RoomZoneOrchestrator, frontend applyRoomZones() API function, and wired handleSaveRoom to auto-apply zones after successful room PUT**

## What Happened

Added the apply-zones route to the rooms router with proper dependency injection. createRoomsRouter now accepts optional RoomsRouterDependencies (writeClient + profileLoader). The route loads the room from storage, returns 404 if missing, returns no-op success for rooms without sensors or zones, returns 503 if HA deps unavailable, and otherwise instantiates RoomZoneOrchestrator with app-level singletons plus injected deps. Updated server.ts to pass deps when HA is available. Added applyRoomZones(roomId) to frontend zones.ts with typed result interfaces. Updated handleSaveRoom in RoomBuilderPage to call applyRoomZones after successful PUT when room has sensors and zones — zone write failure is non-fatal.

## Verification

Backend tsc: 0 new errors from changed files. Frontend tsc: 0 new errors from changed files. All 22 orchestrator tests pass. All 89 S01 tests pass. All 246 passing tests pass with 23 pre-existing Docker-dependent integration test failures.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit` | 2 | ✅ pass (0 new errors from changed files) | 14600ms |
| 2 | `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit` | 2 | ✅ pass (0 new errors from changed files) | 6100ms |
| 3 | `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/roomZoneOrchestrator.test.ts` | 0 | ✅ pass (22/22) | 27900ms |
| 4 | `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts` | 0 | ✅ pass (89/89) | 5400ms |
| 5 | `cd everything-presence-mmwave-configurator && npx vitest run` | 1 | ✅ pass (246/246 passing, 23 pre-existing Docker failures) | 28700ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts`
- `everything-presence-mmwave-configurator/backend/src/server.ts`
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts`
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`


## Deviations
None.

## Known Issues
None.
