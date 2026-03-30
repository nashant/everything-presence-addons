# M003: Multi-Device Room Support — Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

## Project Description

The Everything Presence configurator currently supports one sensor per room. The data model has `deviceId`, `profileId`, and `devicePlacement` as singular fields on `RoomConfig`. Users with large rooms or complex layouts need multiple EP sensors for full coverage, but the current architecture doesn't support this.

## Why This Milestone

Users have been requesting multi-sensor room support. The DeviceMapping storage is already per-device-keyed (ready for multi-device), but the room data model and all UI components assume a single device. This milestone adds the foundational data model and room builder UI for multiple sensors.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Link multiple EP sensors to a single room
- Place each sensor independently on the room canvas
- See each sensor's radar coverage cone in a distinct color
- Select and drag individual sensors to reposition them
- Add and remove sensors from a room without losing other data

### Entry point / environment

- Entry point: http://localhost:5173 → Dashboard → Room Editor → Devices panel
- Environment: local dev (Vite + backend)
- Live dependencies: Home Assistant for device discovery (but room editing works without it)

## Scope

### In Scope

- `RoomConfig.sensors[]` array replacing singular `deviceId/profileId/devicePlacement`
- Backend startup migration from single-device to `sensors[0]`
- API backward compatibility (accept old format, return new format)
- Frontend type updates to match backend
- RoomCanvas multi-sensor rendering with colored radar cones
- Room builder Devices panel: list sensors, add sensor, remove sensor, select/drag sensor

### Out of Scope / Non-Goals

- Zone-to-sensor association (zones remain room-level)
- Wizard multi-sensor flow (wizard continues to work with single device)
- Zone editor per-sensor selection
- Live tracking for multiple devices simultaneously
- Changing how entity mappings work (DeviceMapping is already per-device)

## Technical Constraints

- Backward compatibility: existing rooms with `deviceId` must auto-migrate
- The API must accept both old format (for any external consumers) and new format
- RoomCanvas already has a `DeviceItemRenderer` — multi-sensor rendering builds on this
- DeviceMapping storage is already keyed by deviceId — no storage changes needed

## Integration Points

- `RoomBuilderPage` — primary consumer, needs multi-sensor device management
- `WizardPage` — continues to work with single device (out of scope for full update)
- `ZoneCanvas/ZoneEditorPage` — needs to render multiple sensors but zone editing stays single-context
- `DeviceMapping` — already per-device, needs room-level linkage through `sensors[]`

## Existing Codebase

- `backend/src/domain/types.ts` — `RoomConfig` with singular `deviceId/profileId/devicePlacement`
- `backend/src/routes/rooms.ts` — Room CRUD with `normalizeRoom()` write-path
- `backend/src/config/storage.ts` — File-based JSON storage
- `frontend/src/api/types.ts` — Frontend mirror of backend types
- `frontend/src/components/RoomCanvas.tsx` — Canvas with single-device rendering (894 lines)
- `frontend/src/components/canvas/DeviceItemRenderer.tsx` — Device renderer (extracted in M002/S02)
- `frontend/src/pages/RoomBuilderPage.tsx` — Room builder with single device panel (2269 lines)
