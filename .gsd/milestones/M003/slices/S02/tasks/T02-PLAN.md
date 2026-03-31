---
estimated_steps: 10
estimated_files: 2
skills_used: []
---

# T02: Add SensorAttachment type, sensors[] on RoomConfig, SensorRenderInfo, and SENSOR_COLORS

Add all new types needed for multi-sensor support to the correct room-first codebase. This includes the API type, canvas rendering type, color constants, and DeviceDragState extension.

Steps:
1. In `frontend/src/api/types.ts`:
   - Add `SensorAttachment` interface: `{ deviceId: string; profileId?: string; placement?: DevicePlacement; }`
   - Add `sensors?: SensorAttachment[]` to `RoomConfig` interface (keep existing `deviceId?`, `profileId?`, `devicePlacement?` unchanged)
2. In `frontend/src/components/canvas/types.ts`:
   - Add `SensorRenderInfo` interface: `{ id: string; placement: DevicePlacement; fovDeg: number; maxRangeMeters: number; iconUrl?: string; color: string; }`
   - Import `DevicePlacement` from `DeviceItemRenderer` (or from api/types if re-exported)
   - Add `SENSOR_COLORS` constant: `['#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']`
   - Extend existing `DeviceDragState` (currently `{ mode: 'device-drag' }`) with `sensorId?: string` field for per-sensor drag isolation

## Inputs

- `feat/multi-device-rooms codebase with existing RoomConfig, DeviceDragState in canvas/types.ts`

## Expected Output

- `SensorAttachment in api/types.ts`
- `sensors? on RoomConfig`
- `SensorRenderInfo + SENSOR_COLORS in canvas/types.ts`
- `DeviceDragState.sensorId`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit — no new errors introduced. SensorAttachment and SensorRenderInfo properly exported.
