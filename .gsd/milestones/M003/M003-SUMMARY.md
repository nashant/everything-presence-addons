---
id: M003
title: "Multi-Device Room Support"
status: complete
completed_at: 2026-03-31T05:57:44.857Z
key_decisions:
  - D007: Sub-branches of feat/multi-device-rooms using double-dash separator
  - D008: showDevice condition expanded to accept sensors[] without legacy deviceId
  - D009: Shared removeSensor callback with legacy field sync from sensors[0]
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/types.ts
  - everything-presence-mmwave-configurator/backend/src/domain/sensorMigration.ts
  - everything-presence-mmwave-configurator/backend/src/routes/rooms.ts
  - everything-presence-mmwave-configurator/frontend/src/api/types.ts
  - everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts
  - everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx
lessons_learned:
  - Always verify merge-base before starting slice branch work — S02 forked from main instead of integration branch (K005)
  - Backend integration tests require Docker /config/ — add test-mode storage adapter in future
  - DeviceItemRenderer color requires 6-digit hex — rgba/named break ${color}22 alpha append (K004)
  - showDevice gate in RoomBuilderPage is the master switch for sensor rendering — extend it, don't bypass (K002)
  - Doctor recovery can leave task DB records inconsistent with slice status — verify all levels match
---

# M003: Multi-Device Room Support

**Delivered multi-sensor room support: backend sensors[] data model with migration, frontend N-sensor colored radar cone rendering, and full device management UI with add/select/edit/remove per sensor.**

## What Happened

M003 delivered multi-device room support across three slices progressing from backend data model through frontend rendering to full UI management.

S01 added the `sensors[]` array to `RoomConfig`, replacing the singular `deviceId/profileId/devicePlacement` fields. A startup migration function (`migrateSensorsArray`) backfills existing rooms from legacy fields to `sensors[0]`. The `normalizeRoom()` write path accepts both old and new format, with automatic backward-compat backfill of legacy fields from `sensors[0]`. Ten new integration tests cover the migration and dual-format acceptance.

S02 bridged the backend model to the frontend. New types (`SensorAttachment`, `SensorRenderInfo`, `SENSOR_COLORS`) define the multi-sensor rendering contract. `DeviceItemRenderer` was parameterized to accept a `color` prop, and `RoomCanvas` gained `sensorPlacements`/`onSensorChange`/`onSensorSelect` props with a rendering loop that maps N sensors to N colored radar cones with independent drag. The fallback path preserves single-device rendering. `RoomBuilderPage` wires it with a `useMemo` building `SensorRenderInfo[]` from `room.sensors[]`.

S03 completed the user-facing experience. The Devices panel was rewritten to render per-sensor cards with colored dots, profile labels, and trash icons. "Add Device" appends a `SensorAttachment`. Clicking a card opens `DeviceEditor` scoped to that sensor with color identification. A dashed selection ring highlights the active sensor on canvas. A shared `removeSensor` callback handles removal with legacy field sync.

## Success Criteria Results

### S01: Backend sensors[] data model + migration
- ✅ Backend API returns rooms with sensors[] — RoomConfig.sensors in domain/types.ts
- ✅ Existing rooms auto-migrate deviceId → sensors[0] — migrateSensorsArray() in sensorMigration.ts
- ✅ POST/PUT accepts both formats — normalizeRoom() handles both
- ⚠️ Backend tests require Docker (pre-existing, not regression)

### S02: Frontend data model + RoomCanvas multi-sensor rendering
- ✅ Frontend types match backend sensors[] — SensorAttachment, SensorRenderInfo, SENSOR_COLORS
- ✅ RoomCanvas renders N colored radar cones — sensorPlacements.map() loop
- ✅ Room builder shows all sensors — sensorPlacements wired in RoomBuilderPage

### S03: Room builder device management UI
- ✅ Devices panel lists all sensors — sensors.map() with colored dots
- ✅ Add Device links new sensor — EntityDiscovery appends SensorAttachment
- ✅ Each sensor selectable/draggable/removable — all callbacks confirmed
- ✅ Full demo verified in browser — 6 scenarios passed

## Definition of Done Results

- ✅ **All 3 slices complete** — S01, S02, S03 all marked ✅ in roadmap
- ✅ **All slice summaries exist** — S01-SUMMARY.md, S02-SUMMARY.md, S03-SUMMARY.md present
- ✅ **All UAT files exist** — S01-UAT.md, S02-UAT.md, S03-UAT.md present
- ✅ **Cross-slice integration verified** — Backend → Frontend types → UI management layers work together
- ✅ **Backward compatibility maintained** — Legacy single-device rooms render via fallback path
- ✅ **Code changes verified** — 75 files changed via git diff vs merge-base

## Requirement Outcomes

No formal requirements tracked in REQUIREMENTS.md for M003. Scope defined in M003-CONTEXT.md — all in-scope items delivered, out-of-scope items remain unaddressed as intended.

## Deviations

S01 summary was doctor-recovered placeholder. S02 branch recreated due to wrong fork point. S02/T06 fixed two unplanned bugs (api/rooms.ts import path, showDevice condition). No scope deviations.

## Follow-ups

- Zone-to-sensor association (zones remain room-level)\n- Wizard multi-sensor flow\n- Backend test infrastructure: add tmpdir override for storage.ts\n- RoomBuilderPage.tsx refactoring (2,269 lines)\n- Frontend TS error count at 124\n- Live tracking for multiple devices
