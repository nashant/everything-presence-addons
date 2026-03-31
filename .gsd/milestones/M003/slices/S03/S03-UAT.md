# S03: Room builder device management UI — UAT

**Milestone:** M003
**Written:** 2026-03-31T05:46:44.464Z

# S03 UAT: Room Builder Device Management UI

## Preconditions

- Dev stack running (`cd dev && docker compose -f docker-compose.dev.yaml up -d --build`)
- Frontend accessible at localhost:5173
- At least 2 available mock devices (sensor-1, sensor-2) in the MQTT mock
- At least one room exists (can be created from Dashboard)

---

## TC-01: Sensor cards render with colors and metadata

**Steps:**
1. Open a room that has 2+ sensors in the sensors[] array
2. Open the Devices panel in the sidebar

**Expected:**
- Each sensor renders as a card with a colored dot matching SENSOR_COLORS order (first sensor green, second blue, etc.)
- Each card shows the device name (e.g. "EP1 Sensor 1")
- Each card shows the profile label (e.g. "EP1 v1.0")
- Hovering a card reveals a trash icon
- Sidebar subtitle shows "2 devices" (or appropriate count)

---

## TC-02: Add Device flow appends to sensors[]

**Steps:**
1. Open a room with 0 or 1 existing sensors
2. Click "Add Device" button
3. Select an available device from the picker
4. Complete entity discovery

**Expected:**
- Add Device button is enabled whenever unlinked devices exist (not gated by existing sensor count)
- After entity discovery completes, a new sensor card appears in the Devices panel
- The new sensor gets the next SENSOR_COLORS color
- A new radar cone renders on the canvas
- The device no longer appears as available in other rooms' device pickers

---

## TC-03: Per-sensor selection via card click

**Steps:**
1. Open a room with 2+ sensors
2. Click the first sensor card in the Devices panel
3. Observe DeviceEditor opens
4. Click the second sensor card

**Expected:**
- DeviceEditor opens showing the first sensor's placement data and color dot
- Clicking the second sensor switches DeviceEditor to that sensor's data with its color dot
- Canvas shows a dashed selection ring around the active sensor

---

## TC-04: Per-sensor selection via canvas tap

**Steps:**
1. Open a room with 2+ sensors
2. Click a sensor icon directly on the canvas

**Expected:**
- The clicked sensor gets a dashed selection ring in its SENSOR_COLORS color
- DeviceEditor opens for that specific sensor
- The corresponding sensor card in the Devices panel is contextually active

---

## TC-05: Per-sensor removal via trash icon

**Steps:**
1. Open a room with 2 sensors
2. Hover over the first sensor card to reveal the trash icon
3. Click the trash icon

**Expected:**
- The sensor card disappears from the Devices panel
- The sensor's radar cone disappears from the canvas
- The remaining sensor is unaffected (still visible, still has its color)
- Sidebar subtitle updates to "1 device"

---

## TC-06: Removing last sensor clears legacy fields

**Steps:**
1. Open a room with exactly 1 sensor
2. Remove it via trash icon or DeviceEditor unlink

**Expected:**
- Devices panel shows "Add a device to this room" state
- No radar cones on canvas
- Sidebar subtitle shows "Add a device to this room"
- Saving and reloading confirms room has no deviceId, no sensors[]

---

## TC-07: DeviceEditor placement editing is sensor-scoped

**Steps:**
1. Open a room with 2 sensors at different placements
2. Select sensor 1, note its placement in DeviceEditor
3. Change sensor 1's placement
4. Select sensor 2

**Expected:**
- Sensor 2's placement is unchanged (not affected by sensor 1's edit)
- Switching back to sensor 1 shows the updated placement

---

## TC-08: Persistence after save and reload

**Steps:**
1. Open a room, add 2 sensors with different placements
2. Click Save
3. Reload the page (F5)
4. Reopen the same room

**Expected:**
- Both sensors present in the Devices panel with correct colors
- Both radar cones render at their saved positions
- Device names and profile labels are correct

---

## Edge Cases

### EC-01: Legacy room with deviceId but no sensors[]
- Open a room created before multi-sensor support
- It should render one sensor card from the legacy deviceId
- Adding a second device should migrate to sensors[] format

### EC-02: No available devices
- When all devices are linked to rooms, "Add Device" button should be disabled
- The device picker should not show devices already linked to other rooms
