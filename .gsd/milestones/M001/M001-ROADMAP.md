# M001: Room-First Configurator Rewrite

**Vision:** A clean, room-first configurator where rooms are first-class entities — create the space, then add sensors to it.

## Success Criteria

- User can create a room by drawing walls, then add 1–3 sensors to it
- Sensor placement step always has a room outline to place within — no {0,0} defaults
- All sensors in a room are visible simultaneously with distinct colors
- Zones can be created, edited, and pushed to devices
- Live tracking shows targets overlaid on the room canvas
- Page refresh preserves all state
- Works behind HA ingress

## Key Insight

The upstream codebase already has all the major components: RoomCanvas (1,685 lines), RoomBuilderPage (1,782), ZoneEditorPage (1,744), LiveTrackingPage (2,227), EntityDiscovery (797), zone push/read, room CRUD API. **We don't need to rebuild these.** The problem is strictly the entry flow — the WizardPage (3,322 lines) forces device-first ordering, and `RoomConfig` uses a singular `deviceId` instead of a `sensors[]` array.

## What Changes

1. **Data model**: `RoomConfig.deviceId` → `RoomConfig.sensors[]` (backend + frontend types, storage, all references)
2. **Entry flow**: Dashboard → create room → draw walls → add sensor → entity discovery → place sensor (replace WizardPage with a lighter room-first flow)
3. **Page wiring**: Existing pages (RoomBuilder, ZoneEditor, LiveTracking) read from `sensors[]` instead of `deviceId`

## What Stays

- RoomCanvas, ZoneCanvas, ZoneEditor components — reuse as-is
- Room CRUD API — already has POST/GET/PUT/DELETE
- Zone push/read pipeline (ZoneWriter, ZoneReader, EntityResolver)
- Entity discovery backend + EntityDiscovery component
- Device profiles, device discovery, transport abstraction
- Settings page, device settings modal
- All HA integration (REST, WebSocket, transport factory)

## Proof Strategy

- Upstream assessment → retired in S01 (backend boots, API responds, frontend renders)
- Data model migration → retire in S02 by proving sensors[] persists and all pages read it correctly
- Room-first flow → retire in S03 by proving user can create room → add sensor → configure zones → see tracking

## Verification Classes

- Contract verification: npm run build, backend vitest, frontend vitest, TS error count
- Integration verification: Docker dev stack with mock HA + 3 mock EP devices at localhost:42069
- UAT / human verification: user walks through create room → add sensors → configure zones → view tracking

## Milestone Definition of Done

- A user can create a room, add 2 sensors, place them, draw zones, push zones, and see live tracking at localhost:42069
- Page refresh preserves room, sensor, and zone state
- Contract checks pass (build, tests, TS errors)

## Slices

- [x] **S01: Backend foundation + dev stack** `risk:high` `depends:[]`
  > After this: Backend boots on upstream, dev stack runs, API returns devices/profiles/rooms at localhost:42069

- [ ] **S02: Data model migration + sensors array** `risk:high` `depends:[S01]`
  > After this: RoomConfig uses sensors[] array. Backend CRUD handles sensors (add/remove/patch placement). All existing pages updated to read sensors[0] instead of deviceId. Entity discovery stores mappings per sensor. Migration auto-populates sensors[] from legacy deviceId on startup.

- [ ] **S03: Room-first entry flow + integration** `risk:high` `depends:[S02]`
  > After this: Dashboard shows room list with create button. New room flow: name → draw walls → done. "Add sensor" flow on existing room: pick device → entity discovery → place on canvas. WizardPage replaced or bypassed. Zone editor, live tracking, room builder all work with multi-sensor rooms. Full user flow exercised in Docker dev stack.

## Boundary Map

### S01 → S02

Produces:
- Working backend with Express server, all upstream API endpoints
- Dev stack docker-compose with mock HA, MQTT, mock devices
- Test infrastructure (vitest, MockReadTransport, MockWriteClient, testApp)
- Frontend shell rendering upstream UI

### S02 → S03

Produces:
- `SensorAttachment` type with `deviceId`, `profileId`, `placement`, `entityMappings`, `label`
- `RoomConfig.sensors: SensorAttachment[]` replacing `deviceId`/`profileId`/`entityMappings`/`devicePlacement`
- Sensor CRUD routes: POST /api/rooms/:id/sensors, DELETE, PATCH placement
- Startup migration: rooms with legacy `deviceId` auto-populate `sensors[0]`
- All pages read `sensors[0]` instead of `room.deviceId` — no runtime behavior change yet
- Backend + frontend types aligned

### S03 (final slice)

Consumes everything from S02. Produces the complete room-first UX:
- Dashboard with room list/cards and "New Room" button
- Room creation flow (name + wall drawing, no device selection required)
- "Add Sensor" flow on existing room (device select → entity discovery → placement)
- Multi-sensor rendering on canvas with distinct colors
- Zone editor reading from sensors[], push working for all participating sensors
- Live tracking with all sensors in room
- Navigation between dashboard ↔ room builder ↔ zone editor ↔ live tracking
