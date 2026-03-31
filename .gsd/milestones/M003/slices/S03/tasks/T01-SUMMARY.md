---
id: T01
parent: S03
milestone: M003
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx"]
key_decisions: ["Add Device enabled whenever availableDevices.length > 0, no longer gated by single-device boolean", "EntityDiscovery onComplete appends SensorAttachment to sensors[] and syncs singular fields from sensors[0] for backward compat"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "npx tsc --noEmit: zero errors from RoomBuilderPage.tsx (zero project-wide). grep -c hasDevice returns 0. grep -q SENSOR_COLORS confirms import present."
completed_at: 2026-03-31T05:29:39.869Z
blocker_discovered: false
---

# T01: Replaced single-device hasDevice gating with sensorCount, rewrote Devices panel to render per-sensor colored cards from sensors[], and updated EntityDiscovery onComplete to append new SensorAttachment to the array

> Replaced single-device hasDevice gating with sensorCount, rewrote Devices panel to render per-sensor colored cards from sensors[], and updated EntityDiscovery onComplete to append new SensorAttachment to the array

## What Happened
---
id: T01
parent: S03
milestone: M003
key_files:
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
key_decisions:
  - Add Device enabled whenever availableDevices.length > 0, no longer gated by single-device boolean
  - EntityDiscovery onComplete appends SensorAttachment to sensors[] and syncs singular fields from sensors[0] for backward compat
duration: ""
verification_result: passed
completed_at: 2026-03-31T05:29:39.869Z
blocker_discovered: false
---

# T01: Replaced single-device hasDevice gating with sensorCount, rewrote Devices panel to render per-sensor colored cards from sensors[], and updated EntityDiscovery onComplete to append new SensorAttachment to the array

**Replaced single-device hasDevice gating with sensorCount, rewrote Devices panel to render per-sensor colored cards from sensors[], and updated EntityDiscovery onComplete to append new SensorAttachment to the array**

## What Happened

Six changes to RoomBuilderPage.tsx: (1) linkedDeviceIds now collects from both r.deviceId and r.sensors[].deviceId. (2) sensorCount useMemo replaces all 7 hasDevice references. (3) Devices panel default state renders .map() over sensors[] with SENSOR_COLORS dots, device name, profile label, hover trash icon, and click placeholder. Legacy fallback for rooms with deviceId but no sensors[]. (4) Sidebar subtitle shows dynamic count. (5) EntityDiscovery onComplete appends SensorAttachment to sensors[] and syncs singular fields from sensors[0]. (6) SensorAttachment import added.

## Verification

npx tsc --noEmit: zero errors from RoomBuilderPage.tsx (zero project-wide). grep -c hasDevice returns 0. grep -q SENSOR_COLORS confirms import present.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E 'RoomBuilderPage\.tsx' | head -5` | 0 | ✅ pass | 4800ms |
| 2 | `grep -c 'hasDevice' everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` | 0 | ✅ pass (output: 0) | 50ms |
| 3 | `grep -q 'SENSOR_COLORS' everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx && echo 'OK'` | 0 | ✅ pass | 50ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`


## Deviations
None.

## Known Issues
None.
