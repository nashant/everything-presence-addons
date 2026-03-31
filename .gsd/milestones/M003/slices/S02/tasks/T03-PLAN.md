---
estimated_steps: 14
estimated_files: 2
skills_used: []
---

# T03: Parameterize DeviceItemRenderer colors + RoomCanvas multi-sensor rendering

Make DeviceItemRenderer accept a color parameter (replacing hardcoded #22c55e/#3b82f6), then update RoomCanvas to accept and render an array of sensor placements with per-sensor drag.

DeviceItemRenderer changes (frontend/src/components/canvas/DeviceItemRenderer.tsx):
1. Add `color?: string` to `DeviceRenderParams` (default: '#22c55e')
2. Add `sensorId?: string` to `DeviceInteractiveParams`
3. In `renderDeviceNonInteractive`: replace hardcoded '#22c55e' with `color` param for radar fill/stroke, replace '#3b82f6' with a derived icon color or keep as secondary
4. In `renderDeviceInteractive`: same color parameterization

RoomCanvas changes (frontend/src/components/RoomCanvas.tsx):
1. Add new props: `sensorPlacements?: SensorRenderInfo[]`, `selectedSensorId?: string`, `onSensorChange?: (sensorId: string, placement: DevicePlacement) => void`, `onSensorSelect?: (sensorId: string) => void`
2. In interactive device rendering: if `sensorPlacements` provided, iterate and call `renderDeviceInteractive` for each with sensor-specific color/placement/fov/range
3. In non-interactive rendering (renderOverlay): if `sensorPlacements` provided, render array of `renderDeviceNonInteractive` elements
4. Update device drag handling: when `activeDrag.mode === 'device-drag'`, read `activeDrag.sensorId` to find correct sensor, call `onSensorChange(sensorId, newPlacement)`
5. Update drag start to set `sensorId` on the drag state
6. Fallback: when `sensorPlacements` not provided, use existing singular `devicePlacement`/`onDeviceChange` path unchanged
7. Update `isPointInSensorRange` to check against all sensors when `sensorPlacements` provided

## Inputs

- `T02 types (SensorRenderInfo, SENSOR_COLORS, DeviceDragState.sensorId)`
- `Existing RoomCanvas with generic item system from M002`

## Expected Output

- `DeviceItemRenderer with color param`
- `RoomCanvas with sensorPlacements prop and multi-sensor render loop`
- `Per-sensor drag handling`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit — no new errors. Existing callers (ZoneEditorPage, WizardPage, LiveTrackingPage) that don't pass sensorPlacements still compile.
