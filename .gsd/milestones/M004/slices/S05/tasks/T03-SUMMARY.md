---
id: T03
parent: S05
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx", "everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx", "everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx"]
key_decisions: ["Rendered per-sensor dots as React.Fragment siblings to zone elements rather than threading data through polygon/rect renderers", "Used getZoneCanvasBounds helper to compute dot placement for both rect and polygon zones consistently"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "npx tsc --noEmit — no new errors in modified files. npx vitest run — 76/76 tests pass across 4 suites."
completed_at: 2026-03-31T16:28:54.800Z
blocker_discovered: false
---

# T03: Added coverage badges to zone list panel, uncovered-zone warning banner, and per-sensor indicator dots on canvas zones

> Added coverage badges to zone list panel, uncovered-zone warning banner, and per-sensor indicator dots on canvas zones

## What Happened
---
id: T03
parent: S05
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx
  - everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx
key_decisions:
  - Rendered per-sensor dots as React.Fragment siblings to zone elements rather than threading data through polygon/rect renderers
  - Used getZoneCanvasBounds helper to compute dot placement for both rect and polygon zones consistently
duration: ""
verification_result: passed
completed_at: 2026-03-31T16:28:54.800Z
blocker_discovered: false
---

# T03: Added coverage badges to zone list panel, uncovered-zone warning banner, and per-sensor indicator dots on canvas zones

**Added coverage badges to zone list panel, uncovered-zone warning banner, and per-sensor indicator dots on canvas zones**

## What Happened

Three areas of work: (1) RoomBuilderPage zone list panel — added zoneCoverageMap and allZonesPerSensorCoverageMap useMemo computations, zone list items now show colored coverage badges and an uncovered-zones warning banner. (2) ZoneItemRenderer — extended renderZones with optional perSensorCoverageMap parameter, added per-sensor colored dots at zone top-right corners and ⚠ icon for uncovered zones, plus getZoneCanvasBounds helper. (3) RoomCanvas — added perSensorCoverageMap prop and threaded it to zoneRenderer.render().

## Verification

npx tsc --noEmit — no new errors in modified files. npx vitest run — 76/76 tests pass across 4 suites.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd frontend && npx tsc --noEmit | grep -E '(ZoneItemRenderer|RoomCanvas|RoomBuilderPage|zoneCoverageUtils)'` | 0 | ✅ pass | 3700ms |
| 2 | `cd frontend && npx vitest run` | 0 | ✅ pass | 874ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx`
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx`
- `everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx`


## Deviations
None.

## Known Issues
None.
