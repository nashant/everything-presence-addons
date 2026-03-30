# S02: Device + door extraction and props cleanup

**Goal:** Extract device and door rendering from RoomCanvas.tsx into the canvas/ module, consolidate duplicated radar geometry, fold deviceDrag into the ActiveDrag union, and verify all consumers still work.
**Demo:** RoomCanvas is under 1000 lines. Device radar, door swing, furniture, and zones all render and interact identically to before in the browser.

## Must-Haves

- Device rendering (non-interactive + interactive) extracted to `DeviceItemRenderer.tsx`
- Door rendering extracted to `DoorItemRenderer.tsx`
- Duplicated radar wall-clipping code consolidated into a shared `buildRadarPath` in `geometry.ts`
- `dragDevice` boolean folded into the `ActiveDrag` discriminated union
- All 8 RoomCanvas call sites (1 RoomBuilderPage, 6 WizardPage, 1 ZoneCanvas) still compile and work
- RoomCanvas under 1000 lines

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (browser verification)
- Human/UAT required: no (agent browser verification sufficient)

## Verification

- `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit` — zero new errors
- Browser: navigate to room editor, verify device radar renders, device is draggable, constrained to room
- Browser: verify doors render with swing arcs, door selection works, door drag works
- Browser: verify furniture drag/resize/rotate still works
- Browser: verify zone rendering still works
- `wc -l` RoomCanvas.tsx < 1000

## Observability / Diagnostics

- Runtime signals: none — purely frontend rendering refactor
- Inspection surfaces: browser DevTools console for React errors
- Failure visibility: TypeScript compiler errors surface broken contracts
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `canvas/types.ts` (ItemRenderer, ActiveDrag, CanvasContext), `canvas/geometry.ts` (lineIntersection, constrainPointToPolygon, isPointInPolygon)
- New wiring introduced in this slice: DeviceItemRenderer + DoorItemRenderer imported into RoomCanvas, DeviceDragState added to ActiveDrag union
- What remains before the milestone is truly usable end-to-end: nothing — all four item types will be extracted

## Tasks

- [x] **T01: Extract buildRadarPath to geometry.ts and create DeviceItemRenderer** `est:45m`
  - Why: Device has 367 lines in RoomCanvas with ~80 lines of duplicated radar wall-clipping. Extract shared geometry first, then both rendering modes.
  - Files: `canvas/geometry.ts`, `canvas/DeviceItemRenderer.tsx`, `canvas/types.ts`, `RoomCanvas.tsx`
  - Do:
    1. Add `buildRadarPath(placement, fov, maxRange, wallPoints, clipToWalls)` to geometry.ts — consolidates the duplicated wall-clipping arc code
    2. Add `DeviceDragState` to the `ActiveDrag` union in types.ts
    3. Create `DeviceItemRenderer.tsx` with two exported functions: `renderDeviceNonInteractive(...)` returning ReactNode for the renderOverlay deviceElement, and `renderDeviceInteractive(...)` for the draggable version
    4. Replace both inline device rendering blocks in RoomCanvas with calls to the renderer
    5. Replace `dragDevice` boolean with `ActiveDrag` device-drag variant; update handleMouseMove/handleMouseUp
  - Verify: `npx tsc --noEmit` passes, device renders in browser with radar + drag
  - Done when: No inline device rendering in RoomCanvas, device drag uses ActiveDrag, radar wall-clipping code exists in exactly one place

- [x] **T02: Extract DoorItemRenderer** `est:25m`
  - Why: Door rendering is 163 lines of self-contained SVG with swing arc geometry. Door drag is already external (parent-managed), so this is a pure rendering extraction.
  - Files: `canvas/DoorItemRenderer.tsx`, `RoomCanvas.tsx`
  - Do:
    1. Create `DoorItemRenderer.tsx` with exported `renderDoors(...)` function
    2. Move door swing geometry (hinge, inward sign, arc path) into the renderer
    3. Replace inline door rendering block in RoomCanvas with renderer call
    4. Pass through `onDoorDragStart`, `onItemSelect`, selection state as params
  - Verify: `npx tsc --noEmit` passes, doors render with swing arcs, door selection and drag work in browser
  - Done when: No inline door rendering in RoomCanvas, door rendering + interaction identical to before

- [x] **T03: Final verification and line count check** `est:15m`
  - Why: Verify all interactions work end-to-end and RoomCanvas meets the line count target.
  - Files: `RoomCanvas.tsx` (read-only check)
  - Do:
    1. Check `wc -l RoomCanvas.tsx` < 1000
    2. Browser-verify: device drag + radar in room editor
    3. Browser-verify: door selection + drag
    4. Browser-verify: furniture drag/resize/rotate
    5. Browser-verify: zones render in zone editor
    6. If line count > 1000, identify remaining extraction opportunities
  - Verify: All browser checks pass, line count confirmed
  - Done when: RoomCanvas < 1000 lines, all item interactions verified in browser

## Files Likely Touched

- `everything-presence-mmwave-configurator/frontend/src/components/canvas/geometry.ts`
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts`
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` (new)
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/DoorItemRenderer.tsx` (new)
- `everything-presence-mmwave-configurator/frontend/src/components/canvas/index.ts`
- `everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx`
