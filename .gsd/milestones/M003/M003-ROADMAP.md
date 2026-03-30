# M003: Multi-Device Room Support

**Vision:** Allow multiple EP sensors in a single room — each with its own placement, radar cone, profile, and entity mappings — so users can cover large rooms or complex spaces with overlapping sensor coverage.

## Success Criteria

- A room can have 2+ sensors, each with independent placement and radar rendering
- Room builder UI shows all sensors with colored radar cones, allows selecting and dragging each
- Adding a new sensor to a room works via a "Add Device" flow in the Devices panel
- Removing a sensor from a room doesn't break remaining sensors or zones
- Backend API serves rooms with `sensors[]` array; single-device rooms still work (backward compat)
- Existing single-device rooms auto-migrate to `sensors[0]` on startup

## Key Risks / Unknowns

- **Data model migration** — Changing `deviceId/profileId/devicePlacement` → `sensors[]` cascades through ~50 files. If the migration isn't clean, every consumer breaks.
- **Canvas rendering performance** — Multiple radar cones with wall clipping are computationally expensive. Two sensors doubles the geometry work.
- **Zone-to-sensor association** — Currently zones are room-level. With multiple sensors, zones may need association with a specific device for entity mapping push.

## Proof Strategy

- Data model migration → retire in S01 by proving backend serves `sensors[]` and single-device rooms auto-migrate without data loss
- Canvas rendering → retire in S02 by proving 2+ radar cones render and drag independently in the room builder
- Zone association → defer to future milestone (zones stay room-level for now; entity mapping push already uses DeviceMapping per-device)

## Verification Classes

- Contract verification: backend tests for migration + API, TypeScript compilation
- Integration verification: browser testing of room builder with multi-sensor rooms
- Operational verification: startup migration of existing rooms
- UAT / human verification: visual check that radar cones render correctly for multiple sensors

## Milestone Definition of Done

This milestone is complete only when all are true:

- Backend `RoomConfig.sensors[]` replaces `deviceId/profileId/devicePlacement` with backward compat
- Existing single-device rooms auto-migrate to `sensors[0]` on server startup
- Room builder Devices panel shows all linked sensors and allows adding/removing
- RoomCanvas renders N sensor placements with colored radar cones
- Each sensor can be selected and dragged independently in the room builder
- All existing functionality (walls, doors, furniture, zones) continues working

## Requirement Coverage

- Covers: multi-device rooms data model, room builder rendering, device management UI
- Leaves for later: zone-to-sensor association, wizard multi-sensor flow, zone editor per-sensor selection, live tracking multi-device

## Slices

- [ ] **S01: Backend sensors[] data model + migration** `risk:high` `depends:[]`
  > After this: Backend API returns rooms with `sensors[]` array. Existing rooms auto-migrate from `deviceId` → `sensors[0]`. `POST/PUT /api/rooms` accepts both old and new format. All backend tests pass.

- [ ] **S02: Frontend data model + RoomCanvas multi-sensor rendering** `risk:medium` `depends:[S01]`
  > After this: Frontend types match backend `sensors[]`. RoomCanvas renders N colored radar cones. Room builder shows all sensors but device management UI is not yet wired — this proves rendering works.

- [ ] **S03: Room builder device management UI** `risk:low` `depends:[S02]`
  > After this: Devices panel lists all sensors, "Add Device" links a new sensor, each sensor can be selected/dragged/removed. Full demo: add 2 devices to a room, place both, see overlapping radar coverage.

## Boundary Map

### S01 → S02

Produces:
- `RoomConfig.sensors: SensorAttachment[]` with `SensorAttachment = { deviceId, profileId, placement }` 
- `GET /api/rooms` returns rooms with `sensors[]` populated
- `POST/PUT /api/rooms` accepts `sensors[]` and backfills legacy `deviceId/profileId/devicePlacement` for backward compat
- Startup migration writes `sensors[0]` to disk for all rooms that have `deviceId` but no `sensors[]`

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Frontend `RoomConfig.sensors: SensorAttachment[]` type matching backend
- `RoomCanvas` accepts `sensorPlacements: SensorRenderInfo[]` prop and renders N colored radar cones
- `DeviceItemRenderer` updated to render multiple sensors with per-sensor selection

Consumes:
- Backend `sensors[]` API from S01
