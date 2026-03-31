---
estimated_steps: 25
estimated_files: 4
skills_used: []
---

# T02: Wire per-sensor selection, DeviceEditor sensor context, remove, and canvas highlighting

## Description

T01 delivered the Devices panel with sensor cards and Add Device flow. This task wires the remaining interactions: clicking a sensor card opens DeviceEditor for that specific sensor, tapping a sensor on canvas highlights it, DeviceEditor shows sensor-specific placement data, per-sensor remove works, and the canvas renders a selection ring around the active sensor.

## Steps

1. **Per-sensor card click → DeviceEditor**: In the sensor card's `onClick` handler (from T01), set `setSelectedItem({ type: 'device', id: sensor.deviceId })` and `setShowDeviceEditor(true)`. The `handleSensorSelect` callback already does this for canvas taps — sensor card clicks should mirror the same behavior.

2. **Update DeviceEditor props for sensor context**: Add a `sensorId` prop to the `DeviceEditorProps` interface in DeviceEditor.tsx. Also add an optional `color` prop (string) for visual identification. In the header, render the color dot next to the device name. The calling code in RoomBuilderPage.tsx must look up the active sensor from `selectedRoom.sensors` using `selectedItem?.id`, find its index for SENSOR_COLORS, find its placement, and pass sensor-specific props to DeviceEditor.

3. **Wire DeviceEditor `onPlacementChange` for sensors**: Currently updates `selectedRoom.devicePlacement`. For sensor mode, it must update the specific sensor's placement in `sensors[]` (same pattern as `handleSensorChange`). The `onPlacementChange` callback should update `sensors[sensorIndex].placement` and sync `devicePlacement` from `sensors[0]` for backward compat.

4. **Wire DeviceEditor `onUnlink` for sensors**: Currently clears singular `deviceId/profileId/entityMappings/entityNamePrefix`. For sensor mode, splice the sensor from `sensors[]`. If it was the last sensor, also clear singular legacy fields. If it was `sensors[0]`, sync the new `sensors[0]` to singular fields.

5. **Per-sensor remove via trash icon on card**: Wire the trash button on each sensor card (rendered in T01) to splice that sensor from `sensors[]`. Same logic as step 4's `onUnlink` — can share a `removeSensor(sensorId)` helper function.

6. **Pass `selectedSensorId` to RoomCanvas**: In RoomBuilderPage.tsx where `<RoomCanvas>` is rendered (~line 1340), pass `selectedSensorId={selectedItem?.type === 'device' ? selectedItem.id : undefined}`. Currently it's not passed at all.

7. **Add selection ring in RoomCanvas rendering**: In RoomCanvas.tsx, rename `_selectedSensorId` to `selectedSensorId` (remove the underscore prefix). In the multi-sensor `renderDeviceInteractive` loop (~line 937), pass `selected={sensor.id === selectedSensorId}` to the render call. In `DeviceItemRenderer.tsx`, add a `selected?: boolean` to `DeviceInteractiveParams`. When `selected` is true, render an additional circle (or ring) around the device icon — e.g., a dashed stroke circle with the sensor's color at slightly larger radius than the icon.

8. **Update `showDeviceEditor` gating**: The DeviceEditor render block (~line 2266) currently checks `hasDevice` (which T01 replaced). Update it to check whether a sensor is selected: `showDeviceEditor && selectedSensor && selectedRoom`. Where `selectedSensor` is derived from `selectedRoom.sensors?.find(s => s.deviceId === selectedItem?.id)`.

## Must-Haves

- [ ] Sensor card click opens DeviceEditor for that specific sensor
- [ ] Canvas tap on sensor (handleSensorSelect) opens DeviceEditor + highlights sensor
- [ ] DeviceEditor shows correct placement for the selected sensor
- [ ] DeviceEditor onPlacementChange updates the specific sensor's placement in sensors[]
- [ ] DeviceEditor onUnlink removes the specific sensor from sensors[]
- [ ] Trash icon on sensor card removes that sensor
- [ ] selectedSensorId passed to RoomCanvas and used for visual selection ring
- [ ] Removing last sensor clears singular legacy fields
- [ ] TypeScript compiles with zero new errors

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | head -10` — zero errors from S03 files
- `grep -q 'selectedSensorId' everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx && ! grep -q '_selectedSensorId' everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx && echo 'OK'` — underscore prefix removed
- `grep -q 'selected.*boolean' everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx && echo 'OK'` — selected prop added

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — T01 output with multi-sensor Devices panel and Add Device flow`
- ``everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — current singular-device DeviceEditor`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — has selectedSensorId prop but prefixed with underscore`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — renderDeviceInteractive function`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — per-sensor selection, remove, DeviceEditor wiring, selectedSensorId prop passed to RoomCanvas`
- ``everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — sensorId and color props added, sensor-aware header`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — selectedSensorId active (no underscore), passed to render loop`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — selected prop with visual selection ring`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | head -10; echo '---'; grep -c '_selectedSensorId' frontend/src/components/RoomCanvas.tsx; echo '(should be 0)'
