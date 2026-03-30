# M002: RoomCanvas Generic Item System — Research

**Date:** 2026-03-30

## Summary

RoomCanvas.tsx is a 1988-line component that handles rendering and interaction for 4 item types (device, door, furniture, zone) plus wall editing and pan/zoom. Each item type has its own drag state (`furnitureDrag`, `zoneDrag`, `dragDevice`, etc.), its own block in `handleMouseMove` (203 lines of cascading if/else), its own finalization in `handleMouseUp` (85 lines), and its own rendering block (148–369 lines each).

The core insight: all draggable items share the same interaction lifecycle — mousedown captures start position + base state → mousemove computes delta + constrains → mouseup finalizes. The differences are in what state is captured, how constraints apply, and what SVG is rendered. This maps cleanly to a strategy pattern.

## Recommendation

Extract a generic `CanvasItemInteraction` interface with `onDragStart`, `onDragMove`, `onDragEnd`, and `render` methods. Each item type implements this interface. RoomCanvas orchestrates a single drag state machine that delegates to the active item's handler. Rendering delegates to per-type renderer components.

Do this incrementally — one item type at a time — to maintain a working app at each step.

## Existing Code and Patterns

### Current drag state (6 separate variables)

```
dragIdx (wall vertex) — number | null
dragDevice — boolean
furnitureDrag — { id, start, basePos, currentPos? } | null
furnitureResize — { id, start, baseSize, basePos, corner, currentSize?, currentPos? } | null
furnitureRotate — { id, centerPos, baseRotation, currentRotation? } | null
zoneDrag — { id, start, basePos, vertexIndex?, baseVertices? } | null
zoneResize — { id, start, baseSize, basePos, corner } | null
```

### handleMouseMove structure (lines 612–815)

```
panDrag?          → compute pan offset, return
furnitureDrag?    → compute delta, snap, constrain to polygon, return
furnitureResize?  → compute new size per corner, constrain, return
furnitureRotate?  → compute angle, snap to 15°, return
zoneDrag?         → compute delta (vertex or body), return
zoneResize?       → compute new size per corner, return
dragIdx (wall)?   → snap + update points
dragDevice?       → snap + constrain to polygon
```

### handleMouseUp structure (lines 526–611)

```
furnitureDrag?    → apply final position via onFurnitureChange
furnitureResize?  → apply final size via onFurnitureChange
furnitureRotate?  → apply final rotation + constrain via onFurnitureChange
zoneDrag?         → clear state
zoneResize?       → clear state
always:           → clear dragIdx, dragDevice, panDrag
```

### Rendering blocks

| Block | Lines | SVG elements |
|-------|-------|-------------|
| Doors | 1146–1310 (164 lines) | rect + line per door, hit area, drag handles |
| Furniture | 1310–1471 (161 lines) | rotated rect + icon, resize handles, rotation handle |
| Zones | 1471–1620 (149 lines) | polygon or rect, vertex handles, resize handles |
| Device (non-interactive) | 1620–1808 (188 lines) | radar arc with wall clipping, icon/circle |
| Device (interactive) | 1808–1988 (180 lines) | same radar + draggable icon/circle |

### Item-specific props on RoomCanvas (could be unified)

```
// Furniture: 3 props
furniture, selectedFurnitureId, onFurnitureChange

// Doors: 7 props
doors, selectedDoorId, onDoorChange, isDoorPlacementMode, onDoorDragStart/Move/End

// Zones: 4 props
zones, selectedZoneId, onZoneChange, showZones

// Device: 7 props
devicePlacement, onDeviceChange, fieldOfViewDeg, maxRangeMeters, deviceIconUrl, clipRadarToWalls, showRadar
```

## Constraints

- SVG z-order is DOM order — rendering blocks must maintain relative ordering
- Device radar rendering is fundamentally different from other items (arc geometry, wall clipping)
- Furniture has 3 interaction modes (drag, resize, rotate) — most complex
- Zone has 2 shape variants (rect, polygon) with different vertex semantics
- Door drag has a special "already selected" gate before starting drag
- Wall vertex editing is separate from item system (different selection model)

## Common Pitfalls

- **Over-abstracting device rendering** — The radar arc, FOV cone, and wall-clipping geometry are device-specific. Trying to make them generic would add complexity. Keep device rendering as a specialized renderer.
- **Breaking SVG z-order** — Items must render in a specific order (walls → doors → furniture → zones → device). The generic system must preserve this.
- **Losing snap/constrain behavior** — Each item type has slightly different constraint logic. The generic interface must allow per-type constraint functions.

## Open Risks

- ZoneCanvas wraps RoomCanvas with its own overlay rendering — needs to work with the new renderer system
- WizardPage passes different subsets of props to different RoomCanvas instances — the generic interface must handle partial item sets gracefully
