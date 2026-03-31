---
estimated_steps: 15
estimated_files: 2
skills_used: []
---

# T02: Aggregation mode selector + overlap threshold control in ZoneEditorPanel

Add aggregation mode and overlap threshold configuration UI to the zone editor panel. This delivers R007 frontend support (aggregation strategy per zone) and R002 frontend support (configurable threshold per zone).

In `ZoneEditorPanel.tsx`:
1. Add a 3-button toggle for aggregation mode below the Zone Type section, following the same pattern as the zone type buttons. Labels: 'Any (OR)', 'Majority', 'Hold on Tie'. Values: 'or', 'majority', 'no_change_on_tie'. Default visual state: 'or' when `zone.aggregationMode` is undefined.
2. Add an overlap threshold slider below aggregation mode. Range 0-100 (displayed as percentage). Maps to 0.0-1.0 on the zone's `overlapThreshold` field. Default visual state: 10% when undefined. Use a native `<input type="range">` styled with Tailwind.
3. Add a 'Per-Sensor Coverage' section that displays per-sensor coverage breakdown when the `perSensorCoverage` prop is provided. Each sensor shown as a row with its color dot + name + coverage badge (Full/Partial/None with green/amber/red coloring).

Update `ZoneEditorPanelProps` to accept:
- `perSensorCoverage?: Array<{ id: string; color: string; label: string; coverage: 'full' | 'partial' | 'none' }>` 

The existing `coverage` prop stays for the aggregate warning banner. The new `perSensorCoverage` prop adds the per-sensor breakdown detail.

In `RoomBuilderPage.tsx`:
1. Import `getPerSensorCoverage` and `getAggregateCoverage` from the new utility
2. Replace the inline `selectedZoneCoverage` useMemo (lines 512-540) with one that uses the utility functions
3. Compute `selectedZonePerSensorCoverage` from `getPerSensorCoverage` using `sensorPlacements`
4. Pass per-sensor coverage data to `ZoneEditorPanel`

Use the `frontend-design` skill for the UI component styling.

Colors for coverage badges: green=#22c55e (full), amber=#f59e0b (partial), red=#ef4444 (none) — matching existing ZoneItemRenderer convention. Sensor color dots use the sensor's color from SENSOR_COLORS.

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/utils/zoneCoverageUtils.ts` — per-sensor coverage utility from T01`
- ``everything-presence-mmwave-configurator/frontend/src/components/ZoneEditorPanel.tsx` — existing zone editor to extend`
- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — orchestrator to wire new data flow`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — zone types with aggregationMode and overlapThreshold`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/components/ZoneEditorPanel.tsx` — aggregation mode selector, threshold slider, per-sensor coverage breakdown`
- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — utility-based coverage computation, per-sensor data passed to editor`

## Verification

cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit && npx vitest run
