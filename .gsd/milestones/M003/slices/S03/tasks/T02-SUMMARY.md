---
id: T02
parent: S03
milestone: M003
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx", "everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx", "everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx", "everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx"]
key_decisions: ["Shared removeSensor helper used by both trash icon and DeviceEditor onUnlink", "DeviceEditor render block uses IIFE to derive selectedSensor inline", "Selection ring is dashed stroke circle with sensor color, scaling inversely with zoom"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "All checks pass: npx tsc --noEmit zero errors from all four files, _selectedSensorId count 0 in RoomCanvas, selected boolean prop present in DeviceItemRenderer, hasDevice count 0 in RoomBuilderPage, SENSOR_COLORS imported."
completed_at: 2026-03-31T05:34:02.809Z
blocker_discovered: false
---

# T02: Wired sensor card click → DeviceEditor for specific sensor, trash icon remove, canvas selection ring, and sensor-aware DeviceEditor with color dot and per-sensor placement editing

> Wired sensor card click → DeviceEditor for specific sensor, trash icon remove, canvas selection ring, and sensor-aware DeviceEditor with color dot and per-sensor placement editing

## What Happened
---
id: T02
parent: S03
milestone: M003
key_files:
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx
key_decisions:
  - Shared removeSensor helper used by both trash icon and DeviceEditor onUnlink
  - DeviceEditor render block uses IIFE to derive selectedSensor inline
  - Selection ring is dashed stroke circle with sensor color, scaling inversely with zoom
duration: ""
verification_result: passed
completed_at: 2026-03-31T05:34:02.809Z
blocker_discovered: false
---

# T02: Wired sensor card click → DeviceEditor for specific sensor, trash icon remove, canvas selection ring, and sensor-aware DeviceEditor with color dot and per-sensor placement editing

**Wired sensor card click → DeviceEditor for specific sensor, trash icon remove, canvas selection ring, and sensor-aware DeviceEditor with color dot and per-sensor placement editing**

## What Happened

Eight changes across four files: (1) Sensor card click sets selectedItem to device type with sensor.deviceId and opens DeviceEditor. (2) New removeSensor useCallback splices sensor from sensors[], syncs singular legacy fields from sensors[0] or clears all when last sensor removed. (3) Trash icon calls removeSensor. (4) DeviceEditor gets sensorId and color props with color dot in header. (5) DeviceEditor render block rewritten as IIFE that finds selected sensor and passes sensor-specific placement/handlers. (6) selectedSensorId prop passed to RoomCanvas. (7) RoomCanvas _selectedSensorId renamed to selectedSensorId, passed as selected to renderDeviceInteractive. (8) DeviceItemRenderer renders dashed selection ring when selected=true.

## Verification

All checks pass: npx tsc --noEmit zero errors from all four files, _selectedSensorId count 0 in RoomCanvas, selected boolean prop present in DeviceItemRenderer, hasDevice count 0 in RoomBuilderPage, SENSOR_COLORS imported.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | head -10` | 0 | ✅ pass | 3000ms |
| 2 | `grep -c '_selectedSensorId' frontend/src/components/RoomCanvas.tsx` | 0 | ✅ pass | 50ms |
| 3 | `grep -q 'selected.*boolean' frontend/src/components/canvas/DeviceItemRenderer.tsx && echo 'OK'` | 0 | ✅ pass | 50ms |
| 4 | `grep -c 'hasDevice' frontend/src/pages/RoomBuilderPage.tsx` | 0 | ✅ pass | 50ms |
| 5 | `grep -q 'SENSOR_COLORS' frontend/src/pages/RoomBuilderPage.tsx && echo 'OK'` | 0 | ✅ pass | 50ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`
- `everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx`
- `everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx`
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx`


## Deviations
None.

## Known Issues
None.
