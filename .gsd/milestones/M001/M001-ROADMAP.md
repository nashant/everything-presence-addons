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

## Key Risks / Unknowns

- Upstream backend structure — how much is reusable vs needs rewriting
- Entity discovery complexity — the existing flow is deeply coupled to the wizard step sequence
- Zone push pipeline — the zone writer depends on entity resolution and device profiles, which have specific initialization requirements

## Proof Strategy

- Upstream assessment → retire in S01 by proving backend boots, API responds, and frontend renders
- Entity discovery → retire in S03 by proving device entities are discovered and mapped for a mock device
- Zone push → retire in S05 by proving zones are pushed to a mock device and read back correctly

## Verification Classes

- Contract verification: npm run build, backend vitest, frontend vitest, TS error count
- Integration verification: Docker dev stack with mock HA + 3 mock EP devices at localhost:42069
- Operational verification: none for M001 (HA ingress deferred to final polish)
- UAT / human verification: user walks through create room → add sensors → configure zones → view tracking

## Milestone Definition of Done

This milestone is complete only when all are true:

- All slice deliverables are complete
- A user can create a room, add 2 sensors, place them, draw zones, push zones, and see live tracking at localhost:42069
- Page refresh preserves room, sensor, and zone state
- Contract checks pass (build, tests, TS errors)
- Success criteria re-checked against live behavior in Docker dev stack

## Slices

- [x] **S01: Backend foundation + dev stack** `risk:high` `depends:[]`
  > After this: Backend boots on upstream, dev stack runs, API returns devices/profiles/rooms at localhost:42069

- [ ] **S02: Room CRUD + canvas** `risk:high` `depends:[S01]`
  > After this: User can create a room by drawing walls, see it rendered, edit outline, delete room — all at localhost:42069

- [ ] **S03: Sensor attachment + entity discovery** `risk:high` `depends:[S02]`
  > After this: User can select a device, run entity discovery, add it to a room, and place it on the canvas with the room outline visible

- [ ] **S04: Multi-sensor rendering + placement** `risk:medium` `depends:[S03]`
  > After this: User can add 2+ sensors to a room, see all with distinct colors, drag each independently, rotation slider works per sensor

- [ ] **S05: Zone configuration + push** `risk:medium` `depends:[S03]`
  > After this: User can create/edit/delete rectangular and polygon zones, push them to devices, zones appear on canvas

- [ ] **S06: Live tracking + dashboard** `risk:low` `depends:[S04, S05]`
  > After this: Live tracking page shows room with sensors, zones, and real-time target positions from mock devices. Navigation menu works between all views.

## Boundary Map

### S01 → S02

Produces:
- Working backend with Express server, device/profile/room API endpoints
- Dev stack docker-compose with mock HA, MQTT, mock devices, configurator
- Backend storage layer for rooms (JSON file persistence)
- Frontend shell with Vite + Tailwind + React Router or view switching

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Room CRUD API (POST/GET/PUT/DELETE /api/rooms)
- RoomCanvas component rendering room outline with wall drawing
- Room list/selector UI
- `RoomConfig` type with `id`, `name`, `units`, `roomShell`, `sensors[]`

Consumes:
- Backend server + dev stack from S01

### S03 → S04

Produces:
- Entity discovery flow (backend + frontend)
- Sensor attachment API (POST /api/rooms/:id/sensors, DELETE, PATCH placement)
- Single sensor rendering on RoomCanvas with placement drag + rotation
- `SensorAttachment` type with `deviceId`, `profileId`, `placement`, `label`

Consumes:
- Room CRUD + canvas from S02

### S03 → S05

Produces:
- Entity mapping storage (device → HA entity ID resolution)
- Device profile loader (zone limits, FoV, max range per profile)

Consumes:
- Room CRUD from S02

### S04 → S06

Produces:
- Multi-sensor RoomCanvas with distinct colors, per-sensor selection, independent drag
- `SensorRenderInfo` type and `SENSOR_COLORS` palette

Consumes:
- Single sensor rendering from S03

### S05 → S06

Produces:
- Zone CRUD API + zone canvas
- Zone push pipeline (allocator → zone writer → device)
- Zone rendering on canvas (rectangular + polygon)

Consumes:
- Entity mapping + device profiles from S03
