---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T04: Wire RoomBuilderPage to build sensorPlacements from room.sensors[]

Connect backend sensors[] data to RoomCanvas multi-sensor rendering in RoomBuilderPage. Build SensorRenderInfo array from room config, handle drag updates, update Devices panel badge.

Steps:
1. In `frontend/src/pages/RoomBuilderPage.tsx`:
   - Add `useMemo` that builds `SensorRenderInfo[]` from `selectedRoom.sensors`: for each sensor, look up profile from `profiles` array via `sensor.profileId`, extract `limits.fieldOfViewDegrees`, `limits.maxRangeMeters`, `iconUrl`. Assign color from `SENSOR_COLORS[index % SENSOR_COLORS.length]`. Default placement to room centroid if undefined.
   - Pass `sensorPlacements` to `RoomCanvas` when `selectedRoom.sensors?.length > 0`
   - Implement `onSensorChange` callback: find sensor in `selectedRoom.sensors` by id, update its placement, sync `devicePlacement` from `sensors[0].placement` for backward compat, call room update
   - Implement `onSensorSelect` callback: set selectedItem to `{ type: 'device', id: sensorId }`
   - Update existing `onDeviceChange` handler: when sensorPlacements is used, delegate to `onSensorChange`
   - In Devices panel badge: show `selectedRoom.sensors?.length` instead of hardcoded '1'

## Inputs

- `T02 types (SensorRenderInfo, SENSOR_COLORS)`
- `T03 RoomCanvas sensorPlacements prop`
- `Backend GET /api/rooms returning sensors[] from S01`

## Expected Output

- `RoomBuilderPage builds sensorPlacements from room.sensors[]`
- `Drag updates write to sensors[i].placement`
- `Devices panel badge shows sensor count`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit — clean compile. RoomBuilderPage imports SensorRenderInfo and SENSOR_COLORS from canvas/types.
