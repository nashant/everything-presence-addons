# M001: Room-First Configurator Rewrite

**Vision:** Reverse the configurator flow so users create rooms first, then add a device — instead of the current device-first wizard.

## Success Criteria

- User lands on a dashboard showing their rooms
- User can create a room (name + draw walls) without selecting a device first
- User can then add a device to that room (select device → entity discovery → place on canvas)
- Zone editor, live tracking, room builder all work as before
- Page refresh preserves all state
- Works behind HA ingress

## Key Insight

The upstream codebase already has everything: RoomCanvas, RoomBuilderPage, ZoneEditorPage, LiveTrackingPage, EntityDiscovery, room CRUD API, zone push. **No components need rebuilding.** The only change is the entry flow — the WizardPage forces device-first ordering. We replace that with a room-first flow that reuses existing components.

## What Changes

1. **App.tsx entry flow**: Dashboard-first instead of wizard-first. Room list with "New Room" button.
2. **Room creation**: Simple flow — name room, draw walls, done. No device selection required.
3. **Device attachment**: "Add Device" action on an existing room — reuses device selection + EntityDiscovery + placement from the wizard.
4. **Navigation**: Dashboard ↔ room builder ↔ zone editor ↔ live tracking.

## What Stays (no changes)

- `RoomConfig` data model (single `deviceId` per room — unchanged)
- RoomCanvas, ZoneCanvas, ZoneEditor components
- Room CRUD API (POST/GET/PUT/DELETE /api/rooms)
- Zone push/read pipeline (ZoneWriter, ZoneReader, EntityResolver)
- Entity discovery backend + EntityDiscovery component
- Device profiles, device discovery, transport abstraction
- Device settings, firmware, heatmap — all untouched
- Backend routes — no changes needed

## Verification Classes

- Contract verification: npm run build, backend vitest, TS error count
- Integration verification: Docker dev stack at localhost:42069
- UAT: user creates room → draws walls → adds device → configures zones → views tracking

## Milestone Definition of Done

- User can create a room by name + drawing walls (no device selection)
- User can add a device to that room (device select → entity discovery → placement)
- Zone editor and live tracking work for the room
- Page refresh preserves state
- Contract checks pass

## Slices

- [x] **S01: Backend foundation + dev stack** `risk:high` `depends:[]`
  > After this: Backend boots on upstream, dev stack runs, API returns devices/profiles/rooms at localhost:42069

- [ ] **S02: Room-first entry flow** `risk:medium` `depends:[S01]`
  > After this: Dashboard shows rooms. User can create a room (name + walls) without picking a device. User can add a device to an existing room. Zone editor and live tracking work. Full flow exercised in Docker dev stack.

## Boundary Map

### S01 → S02

Produces:
- Working backend with all upstream API endpoints
- Dev stack with mock HA, MQTT, mock devices
- Test infrastructure (vitest, mock transports)

### S02 (final slice)

Consumes S01. Produces:
- Dashboard landing page with room list and "New Room" button
- Room creation flow: name → draw walls → save (no device needed)
- "Add Device" flow on existing room: device select → entity discovery → place on canvas
- Navigation: dashboard ↔ room detail (builder/zones/tracking)
- WizardPage bypassed or removed
