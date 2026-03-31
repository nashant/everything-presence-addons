---
id: S03
parent: M003
milestone: M003
provides:
  - Full multi-sensor device management UI: add, select, edit placement, remove sensors via Devices panel
  - Per-sensor DeviceEditor with color identification and sensor-scoped placement editing
  - Canvas selection ring highlighting the active sensor
  - Backward-compatible singular field sync from sensors[0]
requires:
  - slice: S02
    provides: Frontend SensorRenderInfo/SENSOR_COLORS types, RoomCanvas multi-sensor rendering with sensorPlacements prop, DeviceItemRenderer color parameterization
affects:
  []
key_files:
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx
key_decisions:
  - Add Device enabled whenever availableDevices.length > 0, no longer gated by single-device boolean (D009)
  - Shared removeSensor callback for both trash icon and DeviceEditor onUnlink with legacy field sync (D010)
  - DeviceEditor render block uses IIFE to derive selectedSensor inline
  - Selection ring is dashed stroke circle with sensor color, scaling inversely with zoom
patterns_established:
  - Sensor card pattern: colored dot from SENSOR_COLORS[index], device name, profile label, hover trash icon — reusable for any per-sensor UI list
  - removeSensor shared callback pattern: splice from sensors[], sync singular legacy fields from sensors[0], clear all when empty — canonical way to remove sensors throughout the app
  - DeviceEditor sensor mode: pass sensorId + color props to scope editor to a specific sensor in the array
observability_surfaces:
  - none
drill_down_paths:
  - .gsd/milestones/M003/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-31T05:46:44.463Z
blocker_discovered: false
---

# S03: Room builder device management UI

**Delivered full multi-sensor device management UI: per-sensor colored cards, Add Device appending to sensors[], per-sensor selection with DeviceEditor and canvas highlight ring, per-sensor remove, and backward-compatible legacy field sync.**

## What Happened

Three tasks replaced the single-device UI with a full multi-sensor management system.

T01 rewrote the Devices panel: replaced the `hasDevice` boolean gate (7 references) with `sensorCount`, rewrote the panel to render `.map()` over `sensors[]` with SENSOR_COLORS dots and profile labels, updated `linkedDeviceIds` to collect from both legacy `deviceId` and `sensors[].deviceId`, and changed EntityDiscovery `onComplete` to append a SensorAttachment rather than overwrite singular fields.

T02 wired all interactions: sensor card click opens DeviceEditor for that specific sensor with color dot and correct placement, a shared `removeSensor` callback handles both trash icon and DeviceEditor onUnlink (splicing from sensors[], syncing singular fields from sensors[0], clearing all legacy fields when last sensor removed), `selectedSensorId` passes through to RoomCanvas where `_selectedSensorId` was renamed and a dashed selection ring renders around the active sensor in DeviceItemRenderer.

T03 verified all six scenarios end-to-end in the browser: sensor card rendering with colors and profiles, Add Device appending new sensors, per-sensor selection switching DeviceEditor context, per-sensor trash removal, persistence after save/reload, and clean TypeScript compilation across all four touched files. No code fixes were needed — T01 and T02 implementations were correct on first pass.

## Verification

All slice-level verification checks pass:
- `npx tsc --noEmit` → zero errors from RoomBuilderPage.tsx, DeviceEditor.tsx, RoomCanvas.tsx, DeviceItemRenderer.tsx
- `grep -c hasDevice RoomBuilderPage.tsx` → 0 (fully replaced)
- `grep -q SENSOR_COLORS RoomBuilderPage.tsx` → OK (imported and used)
- `grep -c _selectedSensorId RoomCanvas.tsx` → 0 (underscore prefix removed)
- `grep -q 'selected.*boolean' DeviceItemRenderer.tsx` → OK (selected prop present)
- All 6 browser verification scenarios passed in T03

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

None.

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — Replaced hasDevice with sensorCount, rewrote Devices panel to render per-sensor cards from sensors[], updated linkedDeviceIds to include sensors[], changed EntityDiscovery onComplete to append SensorAttachment, added removeSensor callback, wired sensor card click to DeviceEditor
- `everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — Added sensorId and color props, renders color dot in header for sensor identification
- `everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — Renamed _selectedSensorId to selectedSensorId, passes selected flag to renderDeviceInteractive for each sensor
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — Added selected boolean prop, renders dashed stroke selection ring with sensor color when selected
