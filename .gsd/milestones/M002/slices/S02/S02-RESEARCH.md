# S02: Device + door extraction and props cleanup — Research

**Date:** 2026-03-30

## Summary

S01 established the generic canvas item system on branch `feat/room-first-ux`: geometry helpers in `canvas/geometry.ts`, shared types (`ItemRenderer`, `ActiveDrag`, `CanvasContext`) in `canvas/types.ts`, and two extracted renderers (`FurnitureItemRenderer.tsx`, `ZoneItemRenderer.tsx`) with tests. RoomCanvas is down from 2008 → 1487 lines, with furniture and zone rendering/drag delegated to the extracted renderers via the `ItemRenderer` interface.

S02 needs to extract the remaining two item types — **doors** (163 lines of inline SVG, lines 926–1089) and **devices** (368 lines of inline rendering, lines 1119–1487) — then clean up the props interface. The device rendering is the higher-risk extraction because: (a) it has two modes (non-interactive passed through `renderOverlay.deviceElement`, and interactive with drag), (b) the radar wall-clipping geometry is duplicated inline in both modes (~80 lines each) instead of using a shared helper, and (c) device icon sizing is zoom-aware.

Door extraction is lower risk — it's purely rendering with no drag state in RoomCanvas (drag is managed by parent components via `onDoorDragStart/Move/End` callbacks).

After both extractions plus props cleanup, RoomCanvas should drop to ~950 lines (wall drawing, pan/zoom, grid rendering, coordinate helpers, and orchestration).

## Recommendation

Extract incrementally, one item type at a time, verifying the app after each:

1. **Extract `DeviceItemRenderer.tsx`** (~250 lines target after dedup) — consolidate the duplicated radar wall-clipping code into a `buildRadarPath` helper in `canvas/geometry.ts`, then extract both non-interactive and interactive device rendering. Device doesn't fit the full `ItemRenderer` interface (no `onDragMove`/`onDragEnd` — device drag is trivial snap+constrain inline in handleMouseMove), so implement it as a render-only module with exported functions rather than forcing the interface.

2. **Extract `DoorItemRenderer.tsx`** (~170 lines) — purely rendering. Door drag is owned by parent components (RoomBuilderPage/WizardPage), so like device, this is a render-only extraction. Consider whether to implement the `ItemRenderer` interface or keep it as exported render functions.

3. **Props cleanup** — group door-specific props (7 props) and device-specific props (~8 props) into typed config objects, reducing the top-level props count. Consider whether to introduce `DoorConfig` and `DeviceConfig` wrapper types or just leave individual props (lower churn on consumers).

4. **Fold `dragDevice` into `ActiveDrag`** — replace the separate `useState<boolean>` with a new `DeviceDragState` variant in the discriminated union, unifying all item drag under one state. The device drag logic in handleMouseMove (snap + constrain) would then move to the device renderer's `onDragMove`.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Polygon point-in-polygon | `geometry.ts: isPointInPolygon()` | Already extracted and tested in S01 |
| Line-segment intersection | `geometry.ts: lineIntersection()` | Used by radar wall clipping — already extracted |
| Point constrain to polygon | `geometry.ts: constrainPointToPolygon()` | Used by device drag — already extracted |
| Item renderer interface | `canvas/types.ts: ItemRenderer<TItem, TDrag>` | Pattern established by FurnitureItemRenderer and ZoneItemRenderer |
| Drag state machine | `canvas/types.ts: ActiveDrag` union | Existing discriminated union — just add DeviceDragState variant |

## Existing Code and Patterns

### S01 established infrastructure (canvas/ directory)

- `canvas/types.ts` (153 lines) — `ItemRenderer<TItem, TDrag>` interface with `render`, `onDragMove`, `onDragEnd`; `ActiveDrag` discriminated union (furniture-move/resize/rotate + zone-move/vertex/resize); `CanvasContext` shared utilities; `ItemDragHandlers` for starting drags
- `canvas/geometry.ts` (190 lines) — `isPointInPolygon`, `constrainFurnitureToPolygon`, `constrainPointToPolygon`, `lineIntersection`, `getRotatedRectCorners`, `closestPointOnSegment`, `findClosestPointOnPolygon`
- `canvas/FurnitureItemRenderer.tsx` (365 lines) — full implementation of furniture render + drag/resize/rotate via `ItemRenderer` interface. Tests in `__tests__/FurnitureItemRenderer.test.ts` (340 lines)
- `canvas/ZoneItemRenderer.tsx` (392 lines) — zone render + drag/vertex/resize, with rect and polygon variants. Tests in `__tests__/ZoneItemRenderer.test.ts` (278 lines)
- `canvas/__tests__/geometry.test.ts` (230 lines) — tests for geometry helpers
- `canvas/index.ts` (4 lines) — barrel export

### What remains in RoomCanvas.tsx (1487 lines)

- **Props interface** (lines 32–100, ~68 props) — still has 7 door-specific + 8 device-specific individual props
- **Drag state** (lines 397–400) — `dragIdx` (wall vertex), `dragDevice` (boolean), `panDrag`, `activeDrag` (furniture/zone via union)
- **handleMouseUp** (lines 526–548) — delegates to `furnitureRenderer.onDragEnd` / `zoneRenderer.onDragEnd` for the `activeDrag` union, then clears `dragIdx`/`dragDevice`/`panDrag`
- **handleMouseMove** (lines 550–591) — delegates furniture/zone drag via renderers, handles device drag inline (snap + `constrainPointToPolygon` + `onDeviceChange`)
- **Door rendering** (lines 926–1089, 163 lines) — self-contained SVG: calculates door position on wall segment, computes swing arc geometry (hinge, inward sign, sweep direction), renders frame + arc + panel + hinge + selection highlight + hit area
- **Device non-interactive** (lines 1119–1306, 187 lines) — passed through `renderOverlay.deviceElement`. Inline radar wall-clipping code (~80 lines duplicated from interactive section). Renders radar polygon + device icon (image or circle+direction).
- **Device interactive** (lines 1307–1487, 180 lines) — identical radar wall-clipping code (~80 lines, duplicated). Adds draggable `onMouseDown` handlers that set `dragDevice = true`. Has zoom-aware icon sizing.

### Door drag architecture (managed OUTSIDE RoomCanvas)

RoomCanvas renders doors and dispatches `onDoorDragStart(doorId, x, y)` on mousedown. The parent (RoomBuilderPage/WizardPage) tracks `doorDrag` state:
- `handleDoorDragStart` — stores `{ doorId, startX, startY, segmentIndex, positionOnSegment }`
- `handleDoorDragMove` — finds nearest wall segment, recomputes `positionOnSegment`, calls `handleDoorChange`
- `handleDoorDragEnd` — clears state
- The parent forwards mouse events via `onCanvasMove` → `handleDoorDragMove` in its own handler

This means door extraction is rendering-only from RoomCanvas's perspective. The drag interaction callbacks just pass through.

### Device drag architecture (inline in RoomCanvas)

- `setDragDevice(true)` on mousedown (2 places: icon image and circle fallback, lines ~1453 and ~1467)
- `handleMouseMove` checks `dragDevice`, snaps point, constrains to polygon, calls `onDeviceChange`
- `handleMouseUp` clears `setDragDevice(false)`

Simple enough to fold into the `ActiveDrag` union with a new `DeviceDragState` variant, or keep as-is if the overhead isn't worth it.

### Consumer patterns (on `feat/room-first-ux`)

- **RoomBuilderPage** (2269 lines, 1 RoomCanvas at line 1282) — passes all props. Uses unified `onItemSelect` (S01 addition). Door drag managed externally with `handleDoorDragStart/Move/End`.
- **WizardPage** (3319 lines, 6 RoomCanvas instances) — different prop subsets per wizard step:
  - `outline`: no items
  - `doors`: doors + device (read-only) + `onDoorDragStart/Move/End`
  - `furniture`: doors (read-only) + furniture
  - `placement`: device + furniture (read-only) + doors (read-only)
  - Two more placement variants with similar patterns
- **ZoneCanvas** (677 lines, wraps RoomCanvas) — passes `deviceInteractive={false}`, renders device via `renderOverlay.deviceElement`. Renders furniture/zones in its own overlay. No door interaction.

### Radar wall-clipping duplication

The exact same wall-clipping algorithm appears twice inline:
- Lines 1155–1230 (non-interactive device, inside `renderOverlay`)
- Lines 1334–1410 (interactive device, standalone)

Both iterate wall segments, compute `lineIntersection` for each ray step, and clip to nearest wall. This should become a shared `buildRadarPath()` in `geometry.ts`, taking `(placement, fov, maxRange, wallPoints, clipToWalls)` and returning a path string.

## Constraints

- **SVG z-order = DOM order.** Current order: walls → doors → furniture → zones → renderOverlay (with deviceElement) → interactive device. Extraction must preserve this.
- **`renderOverlay` receives `deviceElement`** — ZoneCanvas depends on this for z-order control. The non-interactive device renderer must produce a `React.ReactNode` that's passed through this callback.
- **Zoom-aware device icon sizing** — Interactive device uses `baseIconSize / effectiveZoom` for constant screen-size icons. Non-interactive path uses fixed sizes. Extraction must handle this difference.
- **`onItemSelect` unification** — S01 replaced `onFurnitureSelect`/`onDoorSelect` with a unified `onItemSelect(type, id)` callback. Door and device renderers must use this pattern.
- **TypeScript** — `tsc --noEmit` must pass. The `ItemRenderer` interface has strict generics.

## Common Pitfalls

- **Breaking `renderOverlay.deviceElement` contract** — ZoneCanvas renders device at a specific z-order within its overlay. The extracted non-interactive device renderer must return JSX that's passed as `deviceElement` prop, not mount as a standalone component.

- **Radar geometry duplication** — The non-interactive and interactive paths have ~80 lines of identical wall-clipping code. Extracting rendering without consolidating this would carry forward the duplication. Extract `buildRadarPath` to geometry.ts first.

- **Device drag simplicity vs interface conformance** — Device drag is just `boolean → snap → constrain → onDeviceChange`. Forcing it into the full `ItemRenderer` interface (with complex `TDrag` state) adds overhead for no benefit. Consider a lightweight `DeviceRenderer` that exports render functions but doesn't implement `onDragMove`/`onDragEnd`.

- **Door drag callback passthrough** — Door drag is managed by parents via 3 callbacks (`onDoorDragStart/Move/End`). Extracting door rendering must preserve these as passthrough props. Don't try to internalize door drag into RoomCanvas.

- **Consumer prop churn** — 8 total RoomCanvas call sites (1 in RoomBuilderPage, 6 in WizardPage, 1 in ZoneCanvas). Any props interface change must update all 8. If props cleanup is too aggressive, the consumer diff explodes.

## Open Risks

- **Props cleanup scope** — Grouping door/device props into config objects reduces RoomCanvas prop count but increases consumer boilerplate (each call site must construct the config object). The tradeoff may not be worth it for 8 call sites. Consider deferring props grouping or keeping it minimal.

- **S01 summary is a placeholder** — The doctor-created S01 summary has no useful forward intelligence. The patterns are discoverable from the extracted files, but there may be gotchas that weren't documented.

- **`buildRadarPath` depends on wall points** — Currently reads `safePoints` from component scope. Extracting to geometry.ts means threading wall points through the call. The `lineIntersection` helper is already in geometry.ts, so this is straightforward but touches every radar rendering path.

- **Icon sizing divergence** — Non-interactive device uses fixed sizes (via `CANVAS_SIZE` constants), interactive uses zoom-aware sizes. Unifying these in a single renderer requires knowing whether the device is interactive or not.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| React + Vite | `asyrafhussin/agent-skills@react-vite-best-practices` (741 installs) | available — not critical for this refactor |

No directly relevant skills found. This is a straightforward React component extraction following the patterns established in S01.

## Sources

- `RoomCanvas.tsx` (1487 lines) — primary source on `feat/room-first-ux` branch
- `canvas/types.ts` — `ItemRenderer` interface and `ActiveDrag` union from S01
- `canvas/geometry.ts` — extracted geometry helpers from S01
- `canvas/FurnitureItemRenderer.tsx` — reference implementation for the extraction pattern
- `canvas/ZoneItemRenderer.tsx` — reference implementation with multiple shape variants
- `RoomBuilderPage.tsx` (2269 lines) — primary consumer with door drag management
- `WizardPage.tsx` (3319 lines) — 6 RoomCanvas usages with different prop subsets
- `ZoneCanvas.tsx` (677 lines) — wraps RoomCanvas with `renderOverlay` + `deviceElement`
