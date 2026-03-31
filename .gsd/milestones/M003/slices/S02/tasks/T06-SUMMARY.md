---
id: T06
parent: S02
milestone: M003
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/frontend/src/api/rooms.ts", "everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx"]
key_decisions: ["showDevice prop now true when room has sensors[] even without deviceId — multi-sensor rooms don't require legacy deviceId field"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "npx tsc --noEmit: S02 files clean (124 pre-existing errors in unrelated files). Browser: two colored SVG paths (green #22c55e, amber #f59e0b) in multi-sensor room. Single device room: one green cone via fallback. Zero console errors."
completed_at: 2026-03-31T05:17:23.360Z
blocker_discovered: false
---

# T06: Fixed showDevice condition and api/rooms import path, verified two colored radar cones render in multi-sensor room with no regression in single-device rooms

> Fixed showDevice condition and api/rooms import path, verified two colored radar cones render in multi-sensor room with no regression in single-device rooms

## What Happened
---
id: T06
parent: S02
milestone: M003
key_files:
  - everything-presence-mmwave-configurator/frontend/src/api/rooms.ts
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
key_decisions:
  - showDevice prop now true when room has sensors[] even without deviceId — multi-sensor rooms don't require legacy deviceId field
duration: ""
verification_result: passed
completed_at: 2026-03-31T05:17:23.360Z
blocker_discovered: false
---

# T06: Fixed showDevice condition and api/rooms import path, verified two colored radar cones render in multi-sensor room with no regression in single-device rooms

**Fixed showDevice condition and api/rooms import path, verified two colored radar cones render in multi-sensor room with no regression in single-device rooms**

## What Happened

The verification gate failed due to an em-dash in the tsc command. The real tsc check revealed one S02-related error: api/rooms.ts imported RoomConfig from ../types instead of ./types. Fixed that. During browser verification, the multi-sensor room showed walls but no radar cones because showDevice required selectedRoom.deviceId, which sensor-only rooms don't have. Fixed the condition to also check sensors[].length. After the fix, two distinct-colored cones (green + amber) render in the multi-sensor room and the single-device room continues working via the fallback path.

## Verification

npx tsc --noEmit: S02 files clean (124 pre-existing errors in unrelated files). Browser: two colored SVG paths (green #22c55e, amber #f59e0b) in multi-sensor room. Single device room: one green cone via fallback. Zero console errors.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd frontend && npx tsc --noEmit (S02 files)` | 0 | ✅ pass | 8000ms |
| 2 | `Browser: two colored cones in Multi-Sensor room` | 0 | ✅ pass | 0ms |
| 3 | `Browser: single cone in Single Device room` | 0 | ✅ pass | 0ms |
| 4 | `Browser console errors check` | 0 | ✅ pass | 0ms |


## Deviations

Fixed api/rooms.ts import path and showDevice condition — neither was in the task plan but both were required for rendering to work.

## Known Issues

124 pre-existing TypeScript errors in files outside S02 scope. Drag persistence not tested.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/api/rooms.ts`
- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`


## Deviations
Fixed api/rooms.ts import path and showDevice condition — neither was in the task plan but both were required for rendering to work.

## Known Issues
124 pre-existing TypeScript errors in files outside S02 scope. Drag persistence not tested.
