# M002: RoomCanvas Generic Item System — Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

## Project Description

The Everything Presence configurator's room editor uses `RoomCanvas.tsx` (1988 lines) as its core canvas component. It renders and handles interaction for four item types — devices, zones, doors, and furniture — but each type has its own bespoke drag state, mouse handlers, constraint logic, and rendering blocks. `RoomBuilderPage.tsx` (2269 lines) mirrors this with item-specific handler proliferation.

## Why This Milestone

Every new item type or interaction change requires touching 5+ places across cascading if/else chains. The recent `onItemSelect` unification proved the pattern works — the remaining item-specific code is the bulk of the complexity. Cleaning this up now prevents the canvas from becoming unmaintainable as more item types or interactions are added.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Use the room editor with identical behavior to today (no user-visible changes)
- (Developer) Add a new canvas item type by implementing a single interface rather than editing 6+ locations

### Entry point / environment

- Entry point: http://localhost:5173 → Dashboard → Room Editor
- Environment: local dev (Vite + backend)
- Live dependencies involved: none (purely frontend refactor)

## Completion Class

- Contract complete means: all existing canvas interactions (drag, resize, rotate, select, constrain) work identically for all item types
- Integration complete means: RoomBuilderPage, WizardPage, and ZoneCanvas all work with the refactored RoomCanvas
- Operational complete means: none (no services)

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- All item types (device, zone, door, furniture) can be selected, dragged, and constrained within the room editor
- The WizardPage's door/furniture steps still function correctly
- ZoneCanvas still renders and allows furniture selection
- No regressions in drag, resize, rotate, snap, or constraint behavior

## Risks and Unknowns

- Device rendering is special (radar overlay, FOV arc, wall clipping) — may resist full generalization
- Zone has two shapes (rect + polygon) with different vertex drag semantics
- Furniture has three interaction modes (drag, resize, rotate) — most complex item type

## Existing Codebase / Prior Art

- `frontend/src/components/RoomCanvas.tsx` — the 1988-line monolith being refactored
- `frontend/src/pages/RoomBuilderPage.tsx` — primary consumer, 2269 lines with item-specific handlers
- `frontend/src/components/ZoneCanvas.tsx` — wraps RoomCanvas for the zone editor view
- `frontend/src/pages/WizardPage.tsx` — secondary consumer, uses RoomCanvas for door/furniture steps
- `frontend/src/components/DeviceEditor.tsx` — device placement editor panel
- `frontend/src/components/FurnitureEditor.tsx` — furniture property editor panel
- `frontend/src/components/DoorEditor.tsx` — door property editor panel

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions.

## Scope

### In Scope

- Unified drag state machine replacing 6 separate useState variables
- Generic item renderer interface with per-type implementations
- Extract door/furniture/zone/device rendering into separate files
- Simplify handleMouseMove/handleMouseUp from cascading if/else to dispatch
- Reduce RoomCanvas props interface from ~80 item-specific props to generic item collections

### Out of Scope / Non-Goals

- Changing any user-visible behavior or styling
- Refactoring the wall drawing/editing system (separate concern)
- Refactoring RoomBuilderPage's panel/sidebar logic
- Changing the data model or API

## Technical Constraints

- Must remain compatible with RoomCanvas consumers: RoomBuilderPage, WizardPage, ZoneCanvas
- SVG rendering order matters (z-index via DOM order)
- Device radar overlay has unique rendering needs that may need a special path
- Snap-to-grid and constrain-to-polygon must continue working per item type

## Integration Points

- `RoomBuilderPage` — passes item arrays + callbacks, must continue working
- `WizardPage` — passes doors/furniture to RoomCanvas, must continue working
- `ZoneCanvas` — wraps RoomCanvas with renderOverlay, must continue working

## Open Questions

- Should device radar rendering stay inside RoomCanvas or become a separate overlay component? — Leaning toward keeping it as a device-specific renderer since it's tightly coupled to device placement
