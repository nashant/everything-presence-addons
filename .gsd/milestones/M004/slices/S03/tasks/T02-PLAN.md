---
estimated_steps: 48
estimated_files: 3
skills_used: []
---

# T02: Wire route endpoint and frontend apply-zones integration

Add `POST /api/rooms/:roomId/apply-zones` route that calls RoomZoneOrchestrator. Add frontend `applyRoomZones()` API function and call it from `handleSaveRoom` in RoomBuilderPage after the room PUT succeeds. Run full verification: tsc, all tests, no regressions.

## Steps

1. Add route in `backend/src/routes/rooms.ts`:
   - `POST /:roomId/apply-zones` handler
   - Load room from storage, 404 if missing
   - Bail early with success if room has no sensors or no zones (no-op)
   - Instantiate RoomZoneOrchestrator with app-level dependencies (writeClient from haClients, deviceEntityService singleton, deviceMappingStorage singleton, profileLoader singleton)
   - Call `orchestrator.applyRoomZones(room)`
   - Return JSON: `{ ok, results, unassigned, warnings }` with 200 status
   - Catch errors → 500 with message

2. Resolve dependency injection for route:
   - The rooms router factory `createRoomsRouter()` currently takes no args. Add optional `deps` parameter with writeClient for zone writes.
   - In server.ts (or wherever the router is mounted), pass the writeClient dependency. If no writeClient is available (e.g., HA not connected), the route returns 503.
   - Check how the existing device zone routes in `routes/devices.ts` access writeClient for the pattern to follow.

3. Add frontend API function in `frontend/src/api/zones.ts`:
   - `applyRoomZones(roomId: string): Promise<ApplyZonesResult>` where `ApplyZonesResult` has `ok`, `results`, `unassigned`, `warnings`
   - POST to `api/rooms/${roomId}/apply-zones` with empty body
   - Use existing `handle()` and `ingressAware()` patterns

4. Update `handleSaveRoom` in `frontend/src/pages/RoomBuilderPage.tsx`:
   - After successful PUT (room saved), check if room has sensors and zones
   - If both present, call `applyRoomZones(room.id)`
   - On success: show saved modal as before. If applyZones returned unassigned zones or warnings, they can be logged to console for now (S05 will add UI for this).
   - On failure: set error message but still show that room was saved (the room data is persisted, just zone writes failed)

5. Run full verification:
   - `npx tsc --noEmit` in both backend and frontend
   - All unit tests pass
   - No S01 regressions

## Must-Haves

- [ ] `POST /api/rooms/:roomId/apply-zones` returns structured result
- [ ] Route returns 404 for missing room, 200 with empty result for room with no sensors/zones
- [ ] Frontend `applyRoomZones()` function exists in `api/zones.ts`
- [ ] `handleSaveRoom` calls apply-zones after successful PUT when room has sensors and zones
- [ ] tsc passes for both backend and frontend
- [ ] All existing tests pass (S01 89 tests + S02 tests + new orchestrator tests)

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit` — backend compiles
- `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit` — frontend compiles
- `cd everything-presence-mmwave-configurator && npx vitest run` — all tests pass

## Inputs

- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts` — orchestrator from T01
- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts` — adapter from T01
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — existing room routes
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts` — existing zone API
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — room save handler

## Expected Output

- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — new apply-zones route added
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts` — applyRoomZones() function added
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — handleSaveRoom updated

## Inputs

- `everything-presence-mmwave-configurator/backend/src/domain/roomZoneOrchestrator.ts`
- `everything-presence-mmwave-configurator/backend/src/ha/zoneWriter.ts`
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts`
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts`
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/roomZoneOrchestrator.test.ts`

## Expected Output

- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts`
- `everything-presence-mmwave-configurator/frontend/src/api/zones.ts`
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit && cd frontend && npx tsc --noEmit && cd .. && npx vitest run
