---
estimated_steps: 16
estimated_files: 3
skills_used: []
---

# T03: Zone list coverage badges, uncovered warnings, and canvas per-sensor indicators

Wire coverage visualization into the zones list panel and canvas zone rendering. This delivers R010 (coverage visualization) and R011 (uncovered zone warnings).

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

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/utils/zoneCoverageUtils.ts` — per-sensor coverage utility from T01`
- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — updated in T02 with utility-based coverage`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx` — zone rendering to extend`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — canvas to pass through per-sensor data`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` — SensorRenderInfo type`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — zone list with coverage badges and uncovered warnings, zoneCoverageMap computation`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/ZoneItemRenderer.tsx` — per-sensor indicator dots on zones`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — perSensorCoverageMap prop threaded to zone renderer`

## Verification

cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit && npx vitest run
