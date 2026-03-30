# GSD State

**Active Milestone:** M002 — RoomCanvas Generic Item System
**Active Slice:** S01 — Generic drag state machine + furniture/zone extraction
**Phase:** executing (all tasks complete, needs browser verification)

## Milestone Registry
- ✅ **M001:** Room-First Configurator Rewrite (all 3 slices complete)
- 🔄 **M002:** RoomCanvas Generic Item System

## Recent Decisions
- D001–D006: Branch strategy, npm/Docker fixes, test infra porting
- Unified `onItemSelect` callback replacing 4 individual `on<Type>Select` callbacks
- Unified `ActiveDrag` discriminated union replacing 5 separate drag state variables
- Furniture/zone renderers extracted to `canvas/FurnitureItemRenderer.tsx` and `canvas/ZoneItemRenderer.tsx`

## Blockers
- None

## Next Action
Verify furniture drag/resize/rotate and zone drag/resize/vertex-drag in browser. Then complete S01 and move to S02.
