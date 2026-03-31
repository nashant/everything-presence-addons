# S02: Frontend data model + RoomCanvas multi-sensor rendering — UAT

**Milestone:** M003
**Written:** 2026-03-31T05:19:26.861Z

# S02 UAT: Frontend data model + RoomCanvas multi-sensor rendering

## Preconditions
- Backend running with S01 sensors[] migration applied
- At least one room with 2+ sensors created via API (POST /api/rooms with sensors array)
- At least one room with a single device via legacy deviceId field
- Frontend dev server running

## Test Cases

### TC1: Multi-sensor room renders multiple colored radar cones
1. Navigate to Dashboard → click on the multi-sensor room
2. Room Builder opens with the room's walls/doors/furniture visible
3. **Expected:** Two radar cones render on the canvas — first sensor in green (#22c55e), second in amber (#f59e0b)
4. Each cone has the correct FOV angle and range from its device profile
5. Cones are semi-transparent (fill opacity via hex alpha `22`)

### TC2: Single-device room renders normally via fallback
1. Navigate to Dashboard → click on a room with only a legacy deviceId (no sensors[])
2. **Expected:** One green radar cone renders at the device placement position
3. No errors in browser console
4. The rendering is identical to pre-S02 behavior

### TC3: Devices sidebar badge shows correct sensor count
1. Open a multi-sensor room in Room Builder
2. Look at the Devices section in the left sidebar
3. **Expected:** Badge shows "2" (or whatever the actual sensor count is), not hardcoded "1"

### TC4: TypeScript compilation
1. Run `cd everything-presence-mmwave-configurator/frontend && npx tsc --noEmit`
2. **Expected:** No new errors beyond the 124 pre-existing ones
3. Specifically verify: no errors in api/types.ts, canvas/types.ts, DeviceItemRenderer.tsx, RoomCanvas.tsx, RoomBuilderPage.tsx, api/rooms.ts

### TC5: showDevice handles sensor-only rooms
1. Create a room via API with sensors[] but NO top-level deviceId
2. Open that room in Room Builder with the device icon toggle enabled
3. **Expected:** Radar cones render (showDevice evaluates to true from sensors[].length)
4. **Regression check:** If toggle is off, no cones render regardless of sensors

### TC6: Existing callers compile without changes
1. Open ZoneEditorPage.tsx, WizardPage.tsx, LiveTrackingPage.tsx in editor
2. These files do NOT pass sensorPlacements to RoomCanvas
3. **Expected:** They still compile — RoomCanvas falls back to single-device rendering when sensorPlacements is undefined

## Edge Cases

### EC1: Room with empty sensors array
1. Create a room with `sensors: []` via API
2. Open in Room Builder
3. **Expected:** No radar cones render, no console errors. sensorPlacements memo returns undefined (not empty array), triggering fallback path.

### EC2: Room with >5 sensors (color cycling)
1. Create a room with 6+ sensors via API
2. Open in Room Builder
3. **Expected:** Colors cycle through SENSOR_COLORS palette. Sensor 6 gets the same color as sensor 1 (index % 5). No crash or missing cones.

### EC3: Sensor without profile match
1. Create a sensor with a profileId that doesn't match any loaded profile
2. Open room in Room Builder
3. **Expected:** Sensor renders with default FOV/range values (from SensorRenderInfo defaults). No crash.
