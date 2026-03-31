# S01: Backend sensors[] data model + migration

**Goal:** Add `sensors: SensorAttachment[]` to `RoomConfig`, update the API to serve and accept it, and auto-migrate existing single-device rooms on startup.
**Demo:** After this: Backend API returns rooms with `sensors[]` array. Existing rooms auto-migrate from `deviceId` → `sensors[0]`. `POST/PUT /api/rooms` accepts both old and new format. All backend tests pass.

## Tasks
- [x] **T01: Add SensorAttachment type and update RoomConfig + normalizeRoom** — 
  - Files: backend/src/domain/types.ts, backend/src/routes/rooms.ts
  - Verify: `npx tsc --noEmit` passes
- [x] **T02: Startup migration + integration tests** — 
  - Files: backend/src/routes/rooms.ts, backend/src/__tests__/integration/rooms.test.ts
  - Verify: `npx vitest run` — all tests pass
