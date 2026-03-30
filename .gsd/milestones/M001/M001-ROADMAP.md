# M001: Room-First Configurator Rewrite

**Vision:** Reverse the configurator flow so users create rooms first, then add a device — instead of the current device-first wizard. Rooms and floors can be imported from Home Assistant or created manually.

## Success Criteria

- User lands on a dashboard showing their rooms organized by floor
- User can import rooms and floors from Home Assistant
- User can create a room manually (name + draw walls) without selecting a device first
- User can then add a device to that room (select device → entity discovery → place on canvas)
- Zone editor, live tracking, room builder all work as before
- Page refresh preserves all state
- Works behind HA ingress

## Key Insight

The upstream codebase already has everything: RoomCanvas, RoomBuilderPage, ZoneEditorPage, LiveTrackingPage, EntityDiscovery, room CRUD API, zone push. **No components need rebuilding.** The backend already fetches HA areas via `listAreaRegistry()` (including `floor_id`). HA also has `config/floor_registry/list` which we can add.

## What Changes

1. **Floors**: New `Floor` type (id, name, level). Floor CRUD API. `RoomConfig` gets optional `floorId`. Backend fetches HA floor registry.
2. **HA import**: Endpoint to import HA areas as rooms and HA floors as floors. Maps `area.floor_id` to local floors.
3. **App.tsx entry flow**: Dashboard-first instead of wizard-first. Rooms grouped by floor with "New Room" and "Import from HA" buttons.
4. **Room creation**: Name room, optionally assign floor, draw walls, done. No device selection required.
5. **Device attachment**: "Add Device" action on an existing room — reuses device selection + EntityDiscovery + placement.
6. **Navigation**: Dashboard ↔ room builder ↔ zone editor ↔ live tracking.

## What Stays (no changes)

- `RoomConfig` core fields (single `deviceId` per room — unchanged)
- RoomCanvas, ZoneCanvas, ZoneEditor components
- Room CRUD API (POST/GET/PUT/DELETE /api/rooms) — extended, not replaced
- Zone push/read pipeline
- Entity discovery backend + EntityDiscovery component
- Device profiles, device discovery, transport abstraction
- Device settings, firmware, heatmap

## Verification Classes

- Contract verification: npm run build, backend vitest, TS error count
- Integration verification: Docker dev stack at localhost:42069
- UAT: user imports from HA or creates room manually → draws walls → adds device → configures zones → views tracking

## Milestone Definition of Done

- User can import floors + rooms from HA, or create them manually
- Rooms are organized by floor on the dashboard
- User can add a device to a room (device select → entity discovery → placement)
- Zone editor and live tracking work for the room
- Page refresh preserves state
- Contract checks pass

## Slices

- [x] **S01: Backend foundation + dev stack** `risk:high` `depends:[]`
  > After this: Backend boots on upstream, dev stack runs, API returns devices/profiles/rooms at localhost:42069

- [x] **S02: Room-first entry flow** `risk:medium` `depends:[S01]`
  > After this: Floors + HA import on backend. Dashboard shows rooms by floor. Create room (name + floor + walls) without device. Add device to existing room. Zone editor and live tracking work. Full flow in Docker dev stack.

- [x] **S03: Room Editor navigation & panel rework** `risk:high` `depends:[S02]`
  > After this: Left panel with context-switching sections (Walls, Devices, Zones, Doors, Furniture, Settings). Pop-out panels styled like Zone Slots. Zone editor embedded inline. Save returns to Dashboard. Old menu removed.

## Boundary Map

### S01 → S02

Produces:
- Working backend with all upstream API endpoints
- Dev stack with mock HA, MQTT, mock devices
- Test infrastructure (vitest, mock transports)
- `listAreaRegistry()` already returns areas with `floor_id`

### S02 (final slice)

Consumes S01. Produces:
- `Floor` type + CRUD routes (GET/POST/PUT/DELETE /api/floors)
- `listFloorRegistry()` on transport interface (WS: `config/floor_registry/list`)
- `RoomConfig.floorId` optional field
- Import endpoint: POST /api/import/ha — fetches HA floors + areas, creates local floors + rooms
- Dashboard landing page: rooms grouped by floor, "New Room", "Import from HA"
- Room creation flow: name + floor + draw walls (no device needed)
- "Add Device" flow on existing room: device select → entity discovery → placement
- Navigation: dashboard ↔ room detail (builder/zones/tracking)
- WizardPage bypassed
