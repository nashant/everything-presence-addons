# M002: RoomCanvas Generic Item System

**Vision:** Replace item-specific drag/render/constraint code in RoomCanvas with a generic item interaction system, reducing the 1988-line monolith to a thin orchestrator with pluggable per-type renderers.

## Success Criteria

- RoomCanvas component is under 600 lines (down from 1988)
- All item interactions (select, drag, resize, rotate, constrain) work identically to before
- Adding a new item type requires implementing one interface, not editing 6+ locations
- RoomBuilderPage, WizardPage, and ZoneCanvas all work without regressions

## Key Risks / Unknowns

- Device radar rendering is deeply special (arc geometry, wall clipping, FOV) — may resist fitting into a clean generic renderer interface
- Furniture has 3 interaction modes (drag, resize, rotate) — the generic drag state machine must handle mode variants cleanly

## Proof Strategy

- Device rendering complexity → retire in S02 by proving the device renderer implements the interface while keeping full radar/arc behavior
- Furniture multi-mode interaction → retire in S01 by proving drag/resize/rotate all work through the generic state machine

## Verification Classes

- Contract verification: manual browser testing of all item interactions in the room editor
- Integration verification: WizardPage door/furniture steps, ZoneCanvas furniture selection
- Operational verification: none
- UAT / human verification: visual check that all items render and interact identically to before

## Milestone Definition of Done

This milestone is complete only when all are true:

- All four item renderers (device, door, furniture, zone) are extracted into separate files
- RoomCanvas uses a single drag state machine instead of 6+ state variables
- handleMouseMove and handleMouseUp delegate to item handlers instead of cascading if/else
- All consumers (RoomBuilderPage, WizardPage, ZoneCanvas) work without changes to their logic
- Every interaction (drag, resize, rotate, select, constrain, snap) is manually verified in the browser

## Slices

- [x] **S01: Generic drag state machine + furniture/zone extraction** `risk:high` `depends:[]`
  > After this: Furniture and zone items render and interact through the generic system; RoomCanvas handleMouseMove/handleMouseUp are simplified; drag/resize/rotate all work in the browser
- [x] **S02: Device + door extraction and props cleanup** `risk:medium` `depends:[S01]`
  > After this: All four item types use the generic system; RoomCanvas is under 600 lines; item-specific props are replaced with generic item collections; WizardPage and ZoneCanvas confirmed working

## Boundary Map

### S01 → S02

Produces:
- `CanvasItemRenderer` interface with `render`, `onDragStart`, `onDragMove`, `onDragEnd` methods
- `useDragStateMachine` hook managing a single `activeDrag` state replacing 6 variables
- `FurnitureRenderer` and `ZoneRenderer` implementations in separate files
- Generic drag dispatch in handleMouseMove/handleMouseUp

Consumes:
- nothing (first slice)
