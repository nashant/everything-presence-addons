# S01: Generic drag state machine + furniture/zone extraction

**Goal:** Replace 7 separate drag state variables with a single discriminated union, extract furniture and zone rendering/interaction into separate files, and simplify RoomCanvas's handleMouseMove/handleMouseUp from cascading if/else to mode dispatch.

**Demo:** Furniture drag/resize/rotate and zone drag/resize/vertex-drag all work identically to before in the browser, but the code lives in dedicated renderer files instead of inline in RoomCanvas.

## Must-Haves

- Single `ActiveDrag` discriminated union replacing furnitureDrag, furnitureResize, furnitureRotate, zoneDrag, zoneResize
- `FurnitureItemRenderer` in its own file handling rendering + drag/resize/rotate
- `ZoneItemRenderer` in its own file handling rendering + drag/resize/vertex-drag
- handleMouseMove/handleMouseUp dispatch to renderer methods instead of inline if/else
- Zero regressions — identical behavior in the browser

## Proof Level

- This slice proves: integration (all furniture/zone interactions work in the live app)
- Real runtime required: yes (browser verification)
- Human/UAT required: yes (visual + interaction check)

## Verification

- Browser: furniture can be dragged, resized, rotated within room walls
- Browser: zones (rect and polygon) can be dragged, resized, vertex-dragged
- Browser: selecting furniture/zone opens the correct sidebar panel
- Browser: snap-to-grid works for all item movements
- Browser: wall vertex drag still works (not broken by state unification)
- Browser: device drag still works (not broken by state unification)

## Observability / Diagnostics

- Runtime signals: none (pure UI refactor)
- Inspection surfaces: browser dev tools React component tree
- Failure visibility: visual — items don't render, drag doesn't work, or constraints fail
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `RoomCanvas.tsx` internal state and handlers, `api/types.ts` for FurnitureInstance/Zone types
- New wiring introduced: CanvasContext type, ItemRenderer interface, FurnitureItemRenderer, ZoneItemRenderer
- What remains before the milestone is truly usable end-to-end: S02 (device + door extraction, props cleanup)

## Tasks

- [x] **T01: Define CanvasContext, ActiveDrag union, and ItemRenderer interface** `est:30m`
  - Why: Establish the type contracts before extracting any code
  - Files: `src/components/canvas/types.ts`
  - Do: Create `canvas/` directory. Define `CanvasContext` (toCanvasCoord, fromCanvasCoord, snapPoint, safePoints, scale, onItemSelect, onDragStateChange, suppressClickRef). Define `ActiveDrag` discriminated union covering all current drag modes. Define `ItemRenderer` interface with `render()`, `onDragMove()`, `onDragEnd()` methods. Export shared geometry helpers (isPointInPolygon, constrainPointToPolygon, constrainFurnitureToPolygon, etc.) from a `canvas/geometry.ts` file.
  - Verify: TypeScript compiles with no errors related to new files
  - Done when: types.ts and geometry.ts exist, export cleanly, and cover all current drag state shapes

- [x] **T02: Extract FurnitureItemRenderer** `est:1h`
  - Why: Furniture is the most complex item (3 interaction modes) — proving it works proves the pattern
  - Files: `src/components/canvas/FurnitureItemRenderer.tsx`, `src/components/RoomCanvas.tsx`
  - Do: Move furniture rendering block (lines 1310-1471) into `FurnitureItemRenderer.render()`. Move furniture drag/resize/rotate logic from handleMouseMove into `onDragMove()`. Move furniture finalization from handleMouseUp into `onDragEnd()`. The renderer receives items, selectedId, activeDrag, and CanvasContext. RoomCanvas calls the renderer instead of inline code.
  - Verify: Browser — drag, resize (all 4 corners), and rotate furniture; constrain to room walls; snap to grid
  - Done when: No furniture-specific drag state or rendering code remains inline in RoomCanvas

- [x] **T03: Extract ZoneItemRenderer** `est:45m`
  - Why: Zones have two shape variants (rect + polygon) with different vertex semantics — second hardest case
  - Files: `src/components/canvas/ZoneItemRenderer.tsx`, `src/components/RoomCanvas.tsx`
  - Do: Move zone rendering block (lines 1471-1620) into `ZoneItemRenderer.render()`. Move zone drag/resize logic from handleMouseMove into `onDragMove()`. Move zone finalization from handleMouseUp into `onDragEnd()`. Handle both rect move/resize and polygon body-drag/vertex-drag.
  - Verify: Browser — drag rect zones, resize rect zones, drag polygon zones, drag polygon vertices; zone selection opens Zones panel
  - Done when: No zone-specific drag state or rendering code remains inline in RoomCanvas

- [x] **T04: Wire unified ActiveDrag state into RoomCanvas** `est:45m`
  - Why: Replace the 5 separate useState calls with a single `activeDrag` state, make handleMouseMove/handleMouseUp dispatch by mode
  - Files: `src/components/RoomCanvas.tsx`
  - Do: Replace `furnitureDrag`, `furnitureResize`, `furnitureRotate`, `zoneDrag`, `zoneResize` with single `const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null)`. Update handleMouseMove to check `activeDrag?.mode` and dispatch to the correct renderer's `onDragMove`. Update handleMouseUp to dispatch to `onDragEnd`. Update mousedown handlers in furniture/zone renderers to call `setActiveDrag()`. Keep `dragIdx`, `dragDevice`, `panDrag` for now (S02 scope).
  - Verify: Browser — all furniture and zone interactions work identically; device drag and wall vertex drag still work
  - Done when: RoomCanvas has 1 drag state variable for furniture/zones instead of 5; handleMouseMove has no furniture/zone-specific if/else blocks

## Files Likely Touched

- `src/components/canvas/types.ts` (new)
- `src/components/canvas/geometry.ts` (new)
- `src/components/canvas/FurnitureItemRenderer.tsx` (new)
- `src/components/canvas/ZoneItemRenderer.tsx` (new)
- `src/components/RoomCanvas.tsx` (major reduction)
