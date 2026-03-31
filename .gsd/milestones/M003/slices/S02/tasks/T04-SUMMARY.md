---
id: T04
parent: S02
milestone: M003
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx"]
key_decisions: ["Backward compat: devicePlacement synced from sensors[0].placement on every sensor drag update", "sensorPlacements returns undefined (not empty array) when room.sensors is absent, preserving single-device fallback path"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "npx tsc --noEmit in frontend/ produces exactly 125 errors — the same pre-existing baseline. Zero new errors introduced. RoomBuilderPage imports SensorRenderInfo and SENSOR_COLORS from canvas/types. All prop wirings verified via grep."
completed_at: 2026-03-31T05:07:08.163Z
blocker_discovered: false
---

# T04: Wired RoomBuilderPage to build sensorPlacements from room.sensors[] with drag persistence and badge update

> Wired RoomBuilderPage to build sensorPlacements from room.sensors[] with drag persistence and badge update

## What Happened
---
id: T04
parent: S02
milestone: M003
key_files:
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
key_decisions:
  - Backward compat: devicePlacement synced from sensors[0].placement on every sensor drag update
  - sensorPlacements returns undefined (not empty array) when room.sensors is absent, preserving single-device fallback path
duration: ""
verification_result: passed
completed_at: 2026-03-31T05:07:08.163Z
blocker_discovered: false
---

# T04: Wired RoomBuilderPage to build sensorPlacements from room.sensors[] with drag persistence and badge update

**Wired RoomBuilderPage to build sensorPlacements from room.sensors[] with drag persistence and badge update**

## What Happened

Added sensorPlacements useMemo that maps selectedRoom.sensors[] to SensorRenderInfo[] (with profile lookup for fov/range/icon and SENSOR_COLORS cycling), handleSensorChange/handleSensorSelect callbacks for drag persistence and selection, delegated onDeviceChange to handleSensorChange when multi-sensor mode is active, wired all three props to RoomCanvas, and updated the Devices sidebar badge to show sensors.length.

## Verification

npx tsc --noEmit in frontend/ produces exactly 125 errors — the same pre-existing baseline. Zero new errors introduced. RoomBuilderPage imports SensorRenderInfo and SENSOR_COLORS from canvas/types. All prop wirings verified via grep.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit 2>&1 | grep '^src/' | wc -l` | 0 | ✅ pass (125 pre-existing, 0 new) | 4200ms |
| 2 | `grep 'SensorRenderInfo|SENSOR_COLORS' src/pages/RoomBuilderPage.tsx` | 0 | ✅ pass (3 references) | 50ms |
| 3 | `grep 'sensorPlacements|onSensorChange|onSensorSelect' src/pages/RoomBuilderPage.tsx | wc -l` | 0 | ✅ pass (10 references) | 50ms |


## Deviations

None.

## Known Issues

125 pre-existing TypeScript errors in frontend from prior milestones.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`


## Deviations
None.

## Known Issues
125 pre-existing TypeScript errors in frontend from prior milestones.
