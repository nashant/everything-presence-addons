# S05: Frontend zone coverage visualization + config UI

**Goal:** Room builder shows per-sensor zone coverage indicators with overlap percentages, users can set aggregation strategy and overlap threshold per zone, and uncovered zones display warnings.
**Demo:** After this: Room builder shows per-sensor zone coverage indicators with overlap percentages. Users can set aggregation strategy and overlap threshold per zone. Uncovered zones display warnings.

## Tasks
- [x] **T01: Extracted per-sensor zone coverage computation as a pure utility with 24 passing unit tests, plus added overlapThreshold field to ZoneRect and ZonePolygon types** — Extract per-sensor zone coverage computation as a pure utility function with comprehensive unit tests. This is the data foundation — every other task depends on it.

The existing `isPointInSensorRange` in RoomCanvas.tsx checks if a point is in range of ANY sensor (collapses to boolean). The existing `getZoneCoverage` returns aggregate 'full'|'partial'|'none'. We need a new pure function that returns per-sensor coverage results.

Create `frontend/src/utils/zoneCoverageUtils.ts` with:
1. `isPointInSensorCone(pt, sensorPlacement, fovDeg, maxRangeMeters)` — checks a single sensor's cone (extracted from the inline logic in RoomCanvas)
2. `getPerSensorCoverage(zone, sensors)` — returns `Map<string, 'full'|'partial'|'none'>` keyed by sensor ID
3. `getAggregateCoverage(perSensor)` — derives aggregate from per-sensor (full if any sensor has full, partial if any has partial, none if all none)

The point-in-cone math must use the +90° rotation offset convention already established in `isPointInSensorRange` and `selectedZoneCoverage`. For ZoneRect, use center-based vertex expansion (x ± width/2, y ± height/2). For ZonePolygon, use vertices directly.

Sensor input type should be `{ id: string; placement: { x: number; y: number; rotationDeg?: number }; fovDeg: number; maxRangeMeters: number }` — compatible with SensorRenderInfo but not importing it (keeps the utility pure).

Also add `overlapThreshold` to `ZoneRect` and `ZonePolygon` in `frontend/src/api/types.ts` (number, 0-1, optional, defaults to 0.1 when absent).

Write tests in `frontend/src/utils/__tests__/zoneCoverageUtils.test.ts` covering:
- Single sensor full/partial/none coverage for rect and polygon zones
- Multi-sensor with different coverage levels per sensor
- Aggregate derivation from per-sensor map
- Zone entirely outside all sensors → all 'none'
- Sensor with no placement → skipped
- Edge case: zero-area zone (width=0 or polygon with collinear points)
  - Estimate: 45m
  - Files: everything-presence-mmwave-configurator/frontend/src/utils/zoneCoverageUtils.ts, everything-presence-mmwave-configurator/frontend/src/utils/__tests__/zoneCoverageUtils.test.ts, everything-presence-mmwave-configurator/frontend/src/api/types.ts
  - Verify: cd everything-presence-mmwave-configurator/frontend && npx vitest run src/utils/__tests__/zoneCoverageUtils.test.ts && npx tsc --noEmit
- [x] **T02: Added aggregation mode toggle, overlap threshold slider, and per-sensor coverage breakdown to ZoneEditorPanel with utility-based coverage wiring from RoomBuilderPage** — Add aggregation mode and overlap threshold configuration UI to the zone editor panel. This delivers R007 frontend support (aggregation strategy per zone) and R002 frontend support (configurable threshold per zone).

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
  - Estimate: 45m
  - Files: everything-presence-mmwave-configurator/frontend/src/components/ZoneEditorPanel.tsx, everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - Verify: cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit && npx vitest run
- [x] **T03: Added coverage badges to zone list panel, uncovered-zone warning banner, and per-sensor indicator dots on canvas zones** — Wire coverage visualization into the zones list panel and canvas zone rendering. This delivers R010 (coverage visualization) and R011 (uncovered zone warnings).

**Zones list panel** (in `RoomBuilderPage.tsx`, the `activeSection === 'zones'` block starting at line 1794):
1. For each zone in the list, compute aggregate coverage using `getPerSensorCoverage` + `getAggregateCoverage` from the utility
2. Add a coverage badge next to each zone's type badge: green dot for full, amber dot for partial, red dot + '⚠' for none
3. After the zone list, if any zones have 'none' coverage, show a warning banner: 'N zone(s) have no sensor coverage — reposition sensors or adjust zones'
4. The coverage computation for the list needs the `sensorPlacements` array — compute a `zoneCoverageMap` useMemo that maps zone IDs to aggregate coverage for all zones

**Canvas zone indicators** (in `ZoneItemRenderer.tsx`):
1. Extend `renderZones` to accept an optional `perSensorCoverageMap?: Map<string, Array<{ sensorId: string; color: string; coverage: 'full' | 'partial' | 'none' }>>` parameter
2. For each zone, if per-sensor data exists, render small colored dots (one per covering sensor) at the top-right corner of the zone. Dot color = sensor's SENSOR_COLORS entry. Dot has a subtle white border. Only show dots for sensors with 'full' or 'partial' coverage (skip 'none').
3. If zone has zero covering sensors (all 'none'), render a small '⚠' icon in the zone center in red

**RoomCanvas.tsx wiring:**
1. Add a `perSensorCoverageMap` prop to RoomCanvas
2. Pass it through to `zoneRenderer.renderZones()`
3. In `RoomBuilderPage.tsx`, compute the map for all zones and pass it to RoomCanvas

Use the `frontend-design` skill for the UI work.

Verify all existing ZoneItemRenderer tests still pass — the new parameter is optional so existing call sites are unaffected.
  - Estimate: 50m
  - Files: everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx, everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx, everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx
  - Verify: cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit && npx vitest run
