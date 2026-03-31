---
id: S03
parent: M004
milestone: M004
provides:
  - POST /api/rooms/:roomId/apply-zones endpoint for triggering zone writes
  - RoomZoneOrchestrator service for full room → device zone pipeline
  - ZoneWriter.applyTranslatedZones() for multi-sensor slot-indexed writes
  - Frontend applyRoomZones() API function
  - handleSaveRoom auto-applies zones after successful room PUT
requires:
  - slice: S01
    provides: coordinateTransform (transformZoneToDeviceSpace), zoneCoverage (computeAllCoverage), zoneAssignment (assignZonesToDevices)
affects:
  - S04
  - S05
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts
  - everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomZoneOrchestrator.test.ts
  - everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - everything-presence-mmwave-configurator/backend/src/server.ts
  - everything-presence-mmwave-configurator/frontend/src/api/zones.ts
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
key_decisions:
  - D013: New applyTranslatedZones() method with explicit slot indices instead of modifying existing ID-based methods
  - D014: Rooms router accepts optional deps — CRUD works without HA, apply-zones returns 503
  - D015: Zone write failure in handleSaveRoom is non-fatal — room data persists
patterns_established:
  - RoomZoneOrchestrator chains coverage → assignment → transform → write with all deps injected for testability
  - Optional router dependencies pattern: route factories accept deps, HA-dependent routes return 503 when unavailable
  - Vitest 3.x vi.fn<> uses function-signature generics: vi.fn<(arg: Type) => Return>()
observability_surfaces:
  - RoomZoneOrchestrator structured return: results[] (per-device write status), unassigned[] (zones no sensor covers), warnings[] (skipped sensors, overflow)
  - Per-device ZoneWriteResult.failures[] with entityId and error message
  - Pino structured logs: zone write counts, skipped sensors, unassigned zones per orchestration run
drill_down_paths:
  - .gsd/milestones/M004/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S03/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-31T14:29:00.672Z
blocker_discovered: false
---

# S03: Zone assignment + per-device translated zone writes

**Built the full pipeline from room save → zone-to-sensor assignment → coordinate transform → per-device zone writes via ZoneWriter, with 22 unit tests proving correctness and a new REST endpoint + frontend integration for automatic zone application.**

## What Happened

S03 connects the S01 coordinate transform and coverage engine to the actual zone write infrastructure, closing the loop from room-level zone drawing to device-level hardware configuration.

**T01 (ZoneWriter.applyTranslatedZones + RoomZoneOrchestrator):** Added `applyTranslatedZones()` to ZoneWriter — a new method that accepts DeviceZoneRect/DeviceZonePolygon with explicit slot indices (bypassing the existing ID-based matching which doesn't work for multi-sensor assignment). The method writes beginX/endX/beginY/endY directly for rects and polygonToText() for polygons, then clears unused slots based on profile limits. Built `RoomZoneOrchestrator` service that chains the full pipeline: profile resolution → computeAllCoverage → assignZonesToDevices → transformZoneToDeviceSpace → applyTranslatedZones per device. All dependencies are injected for testability. 22 unit tests cover rect writes, polygon writes, unused slot clearing, multi-sensor assignment, missing mappings (warning not crash), EP One exclusion, below-threshold zones appearing in unassigned, write failures captured in results, mixed rect+polygon zones, device-space coordinate verification, and slot capacity overflow. Existing applyZones()/applyPolygonZones() methods remain unchanged.

**T02 (REST route + frontend integration):** Added `POST /api/rooms/:roomId/apply-zones` route to rooms router. The `createRoomsRouter` factory now accepts optional `RoomsRouterDependencies` (writeClient + profileLoader) — basic room CRUD works without HA, while apply-zones returns 503 when deps are unavailable. Added `applyRoomZones(roomId)` to frontend `api/zones.ts` with typed result interfaces. Updated `handleSaveRoom` in RoomBuilderPage to call apply-zones after successful room PUT when the room has both sensors and zones. Zone write failure is non-fatal — room data always persists, zone errors are logged for S05's warning UI.

**Type fix during slice completion:** Fixed `vi.fn<Args, Return>()` generic syntax in roomZoneOrchestrator.test.ts — Vitest 3.x changed to function-signature generics `vi.fn<(args) => return>()`.

## Verification

- Backend tsc: 0 new errors from S03-touched files (3 pre-existing errors in mockReadTransport.ts/testApp.ts from missing `call` method — not S03)
- Frontend tsc: 0 new errors from S03-touched files (zones.ts clean, RoomBuilderPage errors all pre-existing at lines unrelated to S03 changes)
- roomZoneOrchestrator.test.ts: 22/22 tests pass
- S01 regression tests: 89/89 pass (coordinateTransform + zoneCoverage + zoneAssignment)
- Full test suite: 246/246 unit tests pass, 23 pre-existing Docker-dependent integration test failures (K007)

## Requirements Advanced

- R004 — Per-device zone writes with translated coordinates fully implemented — RoomZoneOrchestrator chains coverage→assignment→transform→write, ZoneWriter.applyTranslatedZones writes device-space beginX/endX/beginY/endY for rects and polygonToText for polygons, 22 unit tests verify correctness
- R012 — EP One exclusion enforced — orchestrator resolves profiles and skips sensors with maxZones=0, verified in unit test 'EP One + EP Lite: zones only assigned to Lite, One excluded'

## Requirements Validated

- R004 — 22 unit tests in roomZoneOrchestrator.test.ts verify: rect zones write correct beginX/endX/beginY/endY (device-space transformed), polygon zones write via polygonToText(), unused slots cleared, multi-sensor assignment fans out correctly, write failures captured not thrown
- R012 — Unit test 'EP One + EP Lite: zones only assigned to Lite, One excluded' — EP One with maxZones=0 receives no assignments, Lite gets all zones

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

Fixed vi.fn<> generic syntax during slice completion — Vitest 3.x uses function-signature generics instead of positional type args. This was a type-only fix (no runtime change).

## Known Limitations

- Apply-zones endpoint has no dedicated integration test (requires running HA + device entities). Unit tests cover the orchestrator pipeline fully via mocks.
- Frontend zone write errors are console-logged only — S05 will add UI for warnings and unassigned zones.
- Zone writes happen synchronously per device (sequential, not parallel) to avoid HA rate limiting.

## Follow-ups

- S04 will wire room device lifecycle (create/update/cleanup virtual HA device) and aggregation config on top of S03's zone write pipeline.
- S05 will add coverage visualization UI and surface the warnings/unassigned arrays from the apply-zones result to users.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts` — New file: RoomZoneOrchestrator service orchestrating coverage→assignment→transform→write pipeline with injected deps
- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts` — Added applyTranslatedZones() method for multi-sensor slot-indexed writes with rect/polygon support and unused slot clearing
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomZoneOrchestrator.test.ts` — 22 unit tests covering full orchestrator pipeline, ZoneWriter.applyTranslatedZones, and edge cases (fixed vi.fn generic syntax for Vitest 3.x)
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — Added POST /:roomId/apply-zones route with optional dependency injection
- `everything-presence-mmwave-configurator/backend/src/server.ts` — Passes writeClient + profileLoader deps to createRoomsRouter when HA available
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts` — Added applyRoomZones(roomId) function with typed ApplyZonesResult interface
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — handleSaveRoom calls applyRoomZones after successful PUT when room has sensors and zones
