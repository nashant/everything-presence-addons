# S03: Room builder device management UI

**Goal:** Devices panel lists all sensors with colored cards, "Add Device" appends new sensors to the sensors[] array, each sensor can be selected (with canvas highlighting), edited via DeviceEditor, and removed individually. Full multi-device room management works end-to-end.
**Demo:** After this: Devices panel lists all sensors, "Add Device" links a new sensor, each sensor can be selected/dragged/removed. Full demo: add 2 devices to a room, place both, see overlapping radar coverage.

## Tasks
- [x] **T01: Replaced single-device hasDevice gating with sensorCount, rewrote Devices panel to render per-sensor colored cards from sensors[], and updated EntityDiscovery onComplete to append new SensorAttachment to the array** — ## Description

The Devices panel is still entirely single-device: `linkedDeviceIds` only checks `r.deviceId`, `hasDevice` gates on singular `deviceId` (disabling Add Device after one device), only one device card renders, and EntityDiscovery's `onComplete` sets singular fields (would overwrite first device). This task fixes all of these to work with the `sensors[]` array.

## Steps

1. **Fix `linkedDeviceIds`** (line ~1107 of RoomBuilderPage.tsx): Update the `useMemo` to collect device IDs from both `r.deviceId` AND `r.sensors?.map(s => s.deviceId)`. Use a `Set` that merges both sources. This prevents a device already in `sensors[]` from appearing as available.

2. **Replace `hasDevice` gating**: Replace `const hasDevice = !!selectedRoom?.deviceId` with `const sensorCount = (selectedRoom?.sensors?.length ?? 0) + (selectedRoom?.deviceId && !selectedRoom?.sensors?.some(s => s.deviceId === selectedRoom.deviceId) ? 1 : 0)` — or simpler: check `selectedRoom?.sensors?.length ?? (selectedRoom?.deviceId ? 1 : 0)`. The key constraint: "Add Device" button must be enabled whenever `availableDevices.length > 0` AND `selectedRoom` exists — no longer gated by a boolean hasDevice. Disable only when `!selectedRoom || availableDevices.length === 0`.

3. **Rewrite Devices panel default state** (line ~1625–1675): Replace the single-device card block with a loop over `selectedRoom.sensors ?? []`. Each sensor card shows:
   - A SENSOR_COLORS dot (import from `canvas/types.ts`, use `SENSOR_COLORS[index % SENSOR_COLORS.length]`)
   - Device name (look up from `devices` array by `sensor.deviceId`)
   - Profile label (look up from `profiles` by `sensor.profileId`)
   - Hover-visible trash icon for remove (wire remove in T02)
   - Click handler opens DeviceEditor for that sensor (wire in T02 — for now, just `console.log` or noop)
   Also handle the legacy fallback: if `selectedRoom.deviceId` exists but `sensors[]` is empty, render one card for the legacy device.

4. **Update sidebar subtitle**: Change `subtitle={hasDevice ? '1 device' : 'Add a device to this room'}` to use `sensorCount` — e.g., `subtitle={sensorCount > 0 ? \`${sensorCount} device${sensorCount !== 1 ? 's' : ''}\` : 'Add a device to this room'}`.

5. **Update EntityDiscovery `onComplete`** (line ~1556): Instead of setting singular `deviceId/profileId/entityMappings/entityNamePrefix/devicePlacement`, append a new `SensorAttachment` to `sensors[]`:
   ```
   const newSensor: SensorAttachment = {
     deviceId: pendingDevice.id,
     profileId: pendingProfile.id,
     placement: selectedRoom.devicePlacement ?? centroidDefault,
   };
   const nextSensors = [...(selectedRoom.sensors ?? []), newSensor];
   ```
   Also set singular fields from `nextSensors[0]` for backward compat (same pattern as `handleSensorChange`). Store `entityMappings` and `entityNamePrefix` at the room level (they're room-level concepts, not per-sensor).

6. **Verify**: Run `npx tsc --noEmit` and confirm zero new errors from RoomBuilderPage.tsx. Grep for the old `hasDevice` variable to confirm it's fully replaced.

## Must-Haves

- [ ] `linkedDeviceIds` collects from both `r.deviceId` and `r.sensors[].deviceId`
- [ ] "Add Device" button enabled when available devices exist, regardless of current sensor count
- [ ] Devices panel renders a card per sensor from `sensors[]` with colored dot, name, and profile
- [ ] EntityDiscovery onComplete appends to `sensors[]` not singular fields
- [ ] Backward compat: singular `deviceId/profileId/devicePlacement` synced from `sensors[0]`
- [ ] TypeScript compiles with zero new errors from S03 files

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -c 'RoomBuilderPage'` returns 0 (no new TS errors in this file)
- `grep -c 'hasDevice' everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` returns 0 (old guard fully replaced)
- `grep -q 'SENSOR_COLORS' everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx && echo 'OK'` confirms sensor colors imported and used
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E 'RoomBuilderPage\.tsx' | head -5; echo "---"; grep -c 'hasDevice' frontend/src/pages/RoomBuilderPage.tsx; echo '(should be 0)'
- [ ] **T02: Wire per-sensor selection, DeviceEditor sensor context, remove, and canvas highlighting** — ## Description

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
  - Estimate: 1h
  - Files: everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx, everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx, everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx, everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | head -10; echo '---'; grep -c '_selectedSensorId' frontend/src/components/RoomCanvas.tsx; echo '(should be 0)'
- [ ] **T03: Browser verification of complete multi-sensor device management flow** — ## Description

T01 and T02 implemented the full multi-sensor device management UI. This task verifies everything works end-to-end in a running browser, fixing any issues discovered.

## Steps

1. **Start the dev stack**: Run `cd dev && docker compose -f docker-compose.dev.yaml up -d --build` to start the full stack. Wait for the frontend at localhost:5173 (or the configured port) to be accessible.

2. **Verify Devices panel renders sensor cards**: Navigate to a room that has 2+ sensors (created during S02 testing, or create one via API). Open the Devices panel. Confirm each sensor has a colored dot matching SENSOR_COLORS, shows the device name, and shows the profile label.

3. **Verify Add Device flow**: Click "Add Device". Confirm the device picker shows only devices not already linked to any room. Select a device → EntityDiscovery completes → new sensor appears in the panel → additional radar cone renders on canvas.

4. **Verify per-sensor selection**: Click a sensor card → DeviceEditor opens with that sensor's placement. Click a different sensor on the canvas → that sensor highlights (selection ring visible) and DeviceEditor switches to show its placement.

5. **Verify per-sensor remove**: Click the trash icon on a sensor card → that sensor disappears from the panel and its radar cone disappears from the canvas. Remaining sensors are unaffected.

6. **Verify persistence**: Save the room (click Save button). Reload the page. Confirm all sensors are still present with correct placements.

7. **Fix any issues found**: If any verification step fails, diagnose and fix the issue in the relevant source file, then re-verify.

8. **Verify TypeScript still clean**: Run `cd everything-presence-mmwave-configurator && npx tsc --noEmit` and confirm zero new errors from S03 files.

## Must-Haves

- [ ] All 6 verification scenarios pass in browser
- [ ] Zero new TypeScript errors
- [ ] No browser console errors during the verification flow

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | wc -l` returns 0
- Browser verification: all 6 scenarios pass (documented in task summary)
  - Estimate: 45m
  - Files: everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx, everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx, everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx, everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | wc -l | grep -q '^0$' && echo 'PASS' || echo 'FAIL'
