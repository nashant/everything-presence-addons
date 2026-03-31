---
estimated_steps: 35
estimated_files: 1
skills_used: []
---

# T01: Fix multi-device guards and rewrite Devices panel with Add Device flow

## Description

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

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — current single-device Devices panel, linkedDeviceIds, hasDevice, EntityDiscovery onComplete`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` — SENSOR_COLORS palette to import`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — SensorAttachment interface`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — rewritten Devices panel with multi-sensor cards, fixed linkedDeviceIds, Add Device appends to sensors[]`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E 'RoomBuilderPage\.tsx' | head -5; echo "---"; grep -c 'hasDevice' frontend/src/pages/RoomBuilderPage.tsx; echo '(should be 0)'
