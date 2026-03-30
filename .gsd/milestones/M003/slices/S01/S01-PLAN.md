# S01: Backend sensors[] data model + migration

**Goal:** Add `sensors: SensorAttachment[]` to `RoomConfig`, update the API to serve and accept it, and auto-migrate existing single-device rooms on startup.
**Demo:** `GET /api/rooms` returns rooms with `sensors[]` populated. Creating a room with `sensors[]` works. Existing rooms with `deviceId` auto-migrate to `sensors[0]`. Legacy API format (sending `deviceId`) still works via backfill.

## Must-Haves

- `SensorAttachment` type: `{ deviceId, profileId, placement }`
- `RoomConfig.sensors: SensorAttachment[]` alongside legacy `deviceId/profileId/devicePlacement`
- `normalizeRoom()` backfills `sensors[0]` from legacy fields when `sensors` not provided
- `normalizeRoom()` backfills legacy fields from `sensors[0]` for backward compat
- Startup migration: rooms on disk with `deviceId` but no `sensors[]` get `sensors[0]` written
- Integration tests proving migration, backfill in both directions, and API responses

## Proof Level

- This slice proves: contract (API + data model)
- Real runtime required: yes (test server)
- Human/UAT required: no

## Verification

- `cd everything-presence-mmwave-configurator/backend && npx vitest run` — all tests pass
- `npx tsc --noEmit` — zero errors
- New integration tests cover: sensors[] creation, legacy backfill, startup migration

## Observability / Diagnostics

- Runtime signals: startup log for migration count
- Inspection surfaces: `GET /api/rooms` shows sensors[] in response
- Failure visibility: migration logs per-room errors
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: existing `RoomConfig`, `storage.listRooms/saveRoom`, `normalizeRoom()`
- New wiring introduced: `SensorAttachment` type, `sensors[]` on RoomConfig, `migrateSensorsArray()` at startup
- What remains: frontend type updates (S02), canvas rendering (S02), device management UI (S03)

## Tasks

- [ ] **T01: Add SensorAttachment type and update RoomConfig + normalizeRoom** `est:30m`
  - Why: The data model change is the foundation everything else builds on
  - Files: `backend/src/domain/types.ts`, `backend/src/routes/rooms.ts`
  - Do:
    1. Add `SensorAttachment = { deviceId: string; profileId?: string; placement?: DevicePlacement }` to types.ts
    2. Add `sensors?: SensorAttachment[]` to `RoomConfig`
    3. Update `normalizeRoom()` in rooms.ts:
       - Parse `sensors[]` from body if provided
       - If `sensors` not provided but `deviceId` is, synthesize `sensors[0]` from legacy fields
       - Always backfill legacy `deviceId/profileId/devicePlacement` from `sensors[0]` for backward compat
    4. Add `parseSensorAttachment()` helper
  - Verify: `npx tsc --noEmit` passes
  - Done when: RoomConfig has sensors[], normalizeRoom handles both formats

- [ ] **T02: Startup migration + integration tests** `est:30m`
  - Why: Existing rooms on disk need sensors[] written, and tests prove the contract
  - Files: `backend/src/routes/rooms.ts`, `backend/src/__tests__/integration/rooms.test.ts`
  - Do:
    1. Add `migrateSensorsArray()` function (reads all rooms, writes sensors[0] for any with deviceId but no sensors)
    2. Wire into startup (or export for test use)
    3. Add integration tests:
       - POST with sensors[] → GET returns sensors[] + legacy fields backfilled
       - POST with legacy deviceId (no sensors) → GET returns sensors[0] + legacy fields
       - POST with both sensors[] and deviceId → sensors[] wins
       - PUT updating sensors[] → legacy fields updated
       - Migration: write legacy room to disk → run migration → verify sensors[0]
  - Verify: `npx vitest run` — all tests pass
  - Done when: All tests pass, migration function works, backward compat proven

## Files Likely Touched

- `everything-presence-mmwave-configurator/backend/src/domain/types.ts`
- `everything-presence-mmwave-configurator/backend/src/routes/rooms.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/integration/rooms.test.ts`
