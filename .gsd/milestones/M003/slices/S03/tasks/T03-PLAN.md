---
estimated_steps: 18
estimated_files: 4
skills_used: []
---

# T03: Browser verification of complete multi-sensor device management flow

## Description

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

## Inputs

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — T02 output with complete multi-sensor device management`
- ``everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — T02 output with sensor-aware props`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — T02 output with active selectedSensorId`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — T02 output with selection ring`

## Expected Output

- ``everything-presence-mmwave-configurator/frontend/src/pages/RoomBuilderPage.tsx` — potentially patched if browser testing reveals issues`
- ``everything-presence-mmwave-configurator/frontend/src/components/DeviceEditor.tsx` — potentially patched`
- ``everything-presence-mmwave-configurator/frontend/src/components/RoomCanvas.tsx` — potentially patched`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/DeviceItemRenderer.tsx` — potentially patched`

## Verification

cd everything-presence-mmwave-configurator && npx tsc --noEmit 2>&1 | grep -E '(RoomBuilderPage|DeviceEditor|RoomCanvas|DeviceItemRenderer)\.tsx' | wc -l | grep -q '^0$' && echo 'PASS' || echo 'FAIL'
