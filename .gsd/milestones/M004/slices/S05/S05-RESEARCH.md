# S05: Frontend Zone Coverage Visualization + Config UI — Research

**Date:** 2026-03-30

## Summary

S05 is straightforward frontend work extending existing patterns. The codebase already has single-sensor zone coverage computation (vertex-based check in `RoomCanvas.tsx`), zone rendering with coverage-based coloring (green/amber/red in `ZoneItemRenderer.tsx`), and a zone editor panel (`ZoneEditorPanel.tsx`) with a coverage warning. What's missing is: (1) per-sensor coverage breakdown in multi-sensor rooms, (2) aggregation mode config UI per zone, (3) overlap threshold control, and (4) uncovered zone warnings in the zones list panel.

The existing `isPointInSensorRange` in RoomCanvas already handles multi-sensor via `sensorPlacements.some(...)` but collapses results into a single boolean — no per-sensor breakdown is surfaced. The `getZoneCoverage` function uses this to produce aggregate 'full'|'partial'|'none'. For S05, this needs to be extended to produce per-sensor results so the UI can show which sensors cover each zone and with what confidence.

The `aggregationMode` field already exists on `ZoneRect` and `ZonePolygon` in both frontend and backend types (added in S04). The frontend just has no UI to set it. Similarly, `overlapThreshold` is a parameter on the backend `assignZonesToDevices()` but there's no corresponding field on the frontend `RoomConfig` or zone types and no UI control.

## Recommendation

Build in three passes: (1) extend coverage computation to produce per-sensor breakdown, (2) add aggregation mode + overlap threshold UI to ZoneEditorPanel, (3) add coverage indicators and uncovered zone warnings to the zones list panel. All work is frontend-only — no backend changes needed since `aggregationMode` is already persisted and `overlapThreshold` can be added as a room-level field.

Client-side per-sensor coverage is sufficient for visualization — no need to call the backend coverage engine. The existing vertex-based approach (check 4 corners of rect or all polygon vertices against each sensor's FOV cone) gives adequate visual feedback. The backend's grid-point sampling is more precise but unnecessary for UI indicators.

## Implementation Landscape

### Key Files

- `frontend/src/components/RoomCanvas.tsx` — `isPointInSensorRange` (line ~296) needs per-sensor variant; `getZoneCoverage` (line ~334) needs per-sensor breakdown. Currently returns aggregate coverage.
- `frontend/src/components/canvas/ZoneItemRenderer.tsx` — Renders zones with coverage-based coloring. Receives `getZoneCoverage` callback. Needs to accept per-sensor coverage data for multi-sensor indicator rendering.
- `frontend/src/components/ZoneEditorPanel.tsx` — Zone property editor. Currently shows coverage warning. Needs aggregation mode selector and per-sensor coverage breakdown display. `aggregationMode` field already exists on zone types.
- `frontend/src/pages/RoomBuilderPage.tsx` — Orchestrates zone panel, zone editor, coverage computation. `selectedZoneCoverage` (line ~512) computes single-sensor coverage for the editor panel. Zones panel section (line ~1794) lists zones without coverage indicators.
- `frontend/src/api/types.ts` — `ZoneRect`/`ZonePolygon` already have `aggregationMode`. `RoomConfig` needs `overlapThreshold?: number` field added. Frontend type unions match backend.
- `frontend/src/components/canvas/types.ts` — `SensorRenderInfo` has `id`, `color`, `fovDeg`, `maxRangeMeters`, `placement`. Perfect for per-sensor coverage computation.

### Build Order

**First: Per-sensor coverage computation + zone list indicators (unblocks everything else)**
Extend `getZoneCoverage` or add a new `getZoneSensorCoverage` function that returns per-sensor results. Use this in the zones list panel to show coverage badges per zone (which sensors cover it, any uncovered). This is the riskiest part — the coverage data flow touches RoomCanvas props, ZoneItemRenderer, and the zones panel. Get it right first.

**Second: Aggregation mode + threshold UI in ZoneEditorPanel**
Add a 3-button selector for aggregation mode (OR / Majority / No-change-on-tie) and a threshold slider. The `aggregationMode` field already round-trips through the backend. Threshold needs a new `overlapThreshold` field on the zone or room level.

**Third: Canvas coverage indicators per sensor**
Enhance ZoneItemRenderer to show per-sensor coverage visually — e.g., small colored dots or a mini-legend on each zone showing which sensors (by color from SENSOR_COLORS) cover it.

### Patterns to Follow

- Zone editor panel follows the same fixed-right-panel pattern as FurnitureEditor and DoorEditor (line ~2350 in RoomBuilderPage.tsx renders it based on selectedZone)
- Coverage colors: green=#22c55e (full), amber=#f59e0b (partial), red=#ef4444 (none) — already established in ZoneItemRenderer
- Sensor colors rotate through SENSOR_COLORS palette (green, amber, violet, pink, cyan) — from `canvas/types.ts`
- Zone type UI buttons pattern: 3-way toggle already exists in ZoneEditorPanel for zone type (regular/exclusion/entry) — reuse same pattern for aggregation mode
- `selectedZoneCoverage` in RoomBuilderPage is computed via `useMemo` and passed as prop to ZoneEditorPanel — extend this pattern for per-sensor data

### Data Flow for Per-Sensor Coverage

Current flow:
```
RoomCanvas.isPointInSensorRange(pt) → boolean (any sensor covers point)
RoomCanvas.getZoneCoverage(zone) → 'full'|'partial'|'none' (aggregate)
→ ZoneItemRenderer.renderZones(..., getZoneCoverage)
→ Colors zone fill/stroke based on aggregate coverage
```

Needed flow:
```
RoomCanvas.getPerSensorCoverage(zone) → Map<sensorId, 'full'|'partial'|'none'>
RoomCanvas.getZoneCoverage(zone) → 'full'|'partial'|'none' (derived from per-sensor — at least one covers = not 'none')
→ ZoneItemRenderer: show per-sensor indicator dots using sensor colors
→ ZoneEditorPanel: show per-sensor coverage breakdown
→ Zones list panel: show uncovered zone warnings
```

### Where Overlap Threshold Lives

The backend's `assignZonesToDevices` takes `overlapThreshold` as a parameter (default 0.1). Options for where to store it:
- **Per-zone** on ZoneRect/ZonePolygon: `overlapThreshold?: number` — most flexible, matches R002's "configurable per zone"
- **Per-room** on RoomConfig: `overlapThreshold?: number` — simpler but less granular

R002 says "user-configurable overlap threshold" and "threshold stored per zone on RoomConfig." The wording is ambiguous — could mean per-zone field on the RoomConfig's zones array, or a room-level field. Per-zone is more powerful and matches the "per zone" phrasing. Add it to `ZoneRect`/`ZonePolygon` types alongside `aggregationMode`.

The backend orchestrator currently doesn't read threshold from zone data — it uses the default 0.1. The backend needs a small change to read it from each zone. But S05 is frontend-only per the roadmap. The backend can use the per-zone threshold in a follow-up or we can thread it through in S05. Given S05's scope is frontend visualization, adding the field to types and UI is sufficient — the backend integration is a small follow-up.

### Verification Strategy

- `npx tsc --noEmit` from `frontend/` — zero new errors
- Existing ZoneItemRenderer tests (278 lines) should still pass
- New unit tests for per-sensor coverage computation (pure function — testable without React)
- Visual verification: multi-sensor room with zones showing per-sensor indicators

### Skill Discovery

No external libraries needed. All work uses React, SVG rendering, and Tailwind CSS already in the project. The `frontend-design` skill should be loaded for the UI work.
