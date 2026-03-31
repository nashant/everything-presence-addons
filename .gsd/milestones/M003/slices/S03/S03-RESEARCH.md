# S03: Room builder device management UI — Research

**Date:** 2026-03-30

## Summary

S03 is straightforward UI wiring. S02 delivered all the rendering infrastructure: `SensorRenderInfo[]`, `sensorPlacements` prop, `handleSensorChange`/`handleSensorSelect` callbacks, and per-sensor drag on the canvas. S01 delivered the backend `sensors[]` data model with bidirectional compat. What's missing is the Devices panel UI — it's still entirely single-device: `hasDevice` (checks singular `deviceId`) gates the "Add Device" button (disabled after one device), only one device card renders, remove clears singular fields, and `linkedDeviceIds` only checks `r.deviceId`.

The work decomposes into: (1) update `linkedDeviceIds` to also check `sensors[]`, (2) rewrite the Devices panel to list all sensors with per-sensor cards, (3) update "Add Device" to append to `sensors[]` instead of setting singular fields, (4) add per-sensor remove that splices from `sensors[]`, (5) wire `selectedSensorId` for visual selection highlighting on canvas, and (6) update `DeviceEditor` to work with sensor context. All within `RoomBuilderPage.tsx` plus minor `DeviceEditor` prop changes.

## Recommendation

Build incrementally within `RoomBuilderPage.tsx`. Start with `linkedDeviceIds` fix (unblocks multi-device available list), then rewrite the Devices panel default state to render from `sensors[]`, then wire Add Device → `sensors[]` append via EntityDiscovery, then per-sensor selection + DeviceEditor, then per-sensor remove. Verify in browser with a multi-sensor room from S02.

## Implementation Landscape

### Key Files

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` (2323 lines) — Primary target. Contains: `linkedDeviceIds` (line ~1107, only checks `r.deviceId`), `availableDevices` (line ~1111), `hasDevice` (line ~1092, only checks `deviceId`), Devices panel JSX (line ~1536–1680), `handleSensorSelect` (line ~265, already wires `selectedItem`), `handleSensorChange` (line ~249, sensor drag persist), EntityDiscovery `onComplete` callback (line ~1556, sets singular fields), remove button handler (line ~1644, clears singular fields), DeviceEditor rendering (line ~2266, gated on `hasDevice`).
- `everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — Receives `deviceName`, `placement`, `onPlacementChange`, `onUnlink`, `onClose`, `onRotationCommit`. Currently singular-device scoped. Needs a `sensorId` prop or similar to identify which sensor is being edited.
- `everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — Already has `selectedSensorId` prop (line ~91) destructured as `_selectedSensorId` (reserved, not yet used for visual highlighting). S03 should pass the active sensor ID and add a selection ring/highlight in the rendering loop.
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — Already color-parameterized (S02). May need a `selected` or `highlighted` prop for the selection ring.
- `everything-presence-mmwave-configurator/frontend/src/api/types.ts` — `SensorAttachment { deviceId, profileId?, placement? }`. No changes needed.
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` — `SensorRenderInfo`, `SENSOR_COLORS`. No changes needed.

### Build Order

1. **Fix linkedDeviceIds + hasDevice** — Update `linkedDeviceIds` to also collect device IDs from `r.sensors[]`. Update `hasDevice` or replace its usage with a `sensorCount` that counts sensors. This unblocks the available devices list and the "Add Device" button for multi-sensor rooms.
2. **Rewrite Devices panel default state** — Replace the single-device card with a loop over `selectedRoom.sensors[]`. Each card shows sensor name (from `devices` lookup), profile label, and SENSOR_COLORS dot for visual identification. The "Add Device" button is always enabled when there are available devices (no longer gated by `hasDevice`).
3. **Wire Add Device → sensors[] append** — Update the EntityDiscovery `onComplete` callback to append a `SensorAttachment` to `sensors[]` instead of setting singular `deviceId/profileId`. Also keep singular fields in sync from `sensors[0]` for backward compat (pattern established in `handleSensorChange`).
4. **Wire per-sensor selection + DeviceEditor** — When a sensor card is clicked (or sensor tapped on canvas via `handleSensorSelect`), set `selectedItem` to `{ type: 'device', id: sensorId }`. Pass `selectedSensorId` to RoomCanvas for visual highlighting. Update DeviceEditor to accept sensor-specific props.
5. **Per-sensor remove** — Remove button on each sensor card splices from `sensors[]`. If removing the last sensor, also clear singular legacy fields. Update backward compat sync.
6. **Selection highlighting on canvas** — Pass `selectedSensorId` to RoomCanvas (currently not passed). In RoomCanvas, use `_selectedSensorId` to add a selection ring around the active sensor's device icon in the rendering loop. May need a `selected` prop on `DeviceItemRenderer`.

### Verification Approach

- TypeScript: `npx tsc --noEmit` — zero new errors from S03 files
- Browser verification (localhost:5173):
  1. Open a room with 2 sensors (created in S02 testing) → both sensor cards show in Devices panel with correct colors
  2. Click "Add Device" → EntityDiscovery flow → new sensor appended → 3 radar cones render
  3. Click a sensor card → DeviceEditor opens for that sensor → placement fields reflect that sensor's position
  4. Click sensor on canvas → same sensor highlights in panel + DeviceEditor opens
  5. Remove a sensor → sensor disappears from panel and canvas → remaining sensors unaffected
  6. Save room → reload → sensors persist correctly

## Constraints

- `handleSensorChange` only updates local React state (not backend) — persistence happens via the explicit "Save" button calling `updateRoom()`. New code must follow this pattern.
- `normalizeRoom` in the backend auto-syncs `sensors[0]` → singular legacy fields. Frontend should also sync `sensors[0].placement` → `devicePlacement` for backward compat (pattern from S02's `handleSensorChange`).
- DeviceEditor is rendered as a fixed side panel (`fixed top-14 bottom-0 right-0`). Only one instance should show at a time — the active sensor's editor.
- Colors must be 6-digit hex per K004 (SENSOR_COLORS already satisfies this).

## Common Pitfalls

- **linkedDeviceIds only checks `r.deviceId`** — Without also checking `r.sensors[].deviceId`, a device linked via `sensors[]` could appear as "available" and be linked to two rooms. Fix this first.
- **hasDevice gates too aggressively** — Currently `!!selectedRoom?.deviceId` which is false for sensor-only rooms (rooms created via `sensors[]` API without legacy `deviceId`). Need to also check `sensors.length > 0`.
- **EntityDiscovery onComplete sets singular fields** — If not updated to append to `sensors[]`, adding a second device would overwrite the first. This is the highest-risk change in the slice.
- **DeviceEditor onUnlink clears singular fields only** — Removing a device via DeviceEditor won't remove it from `sensors[]` unless updated.
