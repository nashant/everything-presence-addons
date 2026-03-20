# S03: Room Editor Navigation & Panel Rework

**Goal:** Replace the old hamburger menu and flat left toolbar in RoomBuilderPage with a context-switching left panel (Walls, Devices, Zones, Doors, Furniture, Settings). Each section opens a pop-out panel (styled like the Zone Slots panel). Save Room returns to the dashboard. Dashboard renamed from "Rooms" to "Dashboard".
**Demo:** User creates a room from Dashboard → draws walls → clicks Devices in left panel → adds a device → clicks Zones → configures zones — all from the same canvas page with pop-out panels. Save returns to Dashboard.

## Must-Haves

- Left panel is a vertical list of section buttons: Walls, Devices, Zones, Doors, Furniture, Settings
- Clicking a section opens a pop-out panel (right-side or adjacent, styled like Zone Slots) with that section's tools
- Only one section pop-out is open at a time (clicking another collapses the current)
- "← Back" button at top of left panel navigates to Dashboard
- **Walls panel**: Add Wall, Finish, Undo, Clear (Finish/Undo/Clear only visible while drawing)
- **Devices panel**: lists linked devices, Add Device button, device placement controls (X/Y, rotation, center/reset) when a device is selected
- **Zones panel**: zone editing tools embedded inline (zone slots list, +Zone/+Exclusion/+Entry, zone selection, polygon/rect mode toggle). Only functional when a device is linked.
- **Doors panel**: Add Door, door list
- **Furniture panel**: Add Furniture, furniture library
- **Settings panel**: canvas snap/units, floor material, room element visibility toggles (walls, furniture, doors, device icon, live tracking)
- Save Room navigates back to Dashboard
- Menu button replaced with "← Back" button
- Main page heading renamed from "Rooms" to "Dashboard"
- Device placement section removed from Room Settings — it lives in Devices panel only

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: yes

## Verification

- `cd everything-presence-mmwave-configurator && npm run build` — 0 backend TS errors, ≤107 frontend TS errors
- `cd everything-presence-mmwave-configurator/backend && npx vitest run` — all tests pass
- Browser: Dashboard loads, create room → Room Builder shows left panel sections
- Browser: Click Walls → pop-out shows wall tools, draw walls, click Finish → collapses
- Browser: Click Devices → pop-out shows Add Device (or device list if linked)
- Browser: Click Zones → pop-out shows zone slots (disabled state if no device)
- Browser: Click Settings → pop-out shows room settings (no device placement controls)
- Browser: Save Room → returns to Dashboard
- Browser: ← Back → returns to Dashboard

## Observability / Diagnostics

- Runtime signals: none (frontend-only changes)
- Inspection surfaces: browser console, React devtools
- Failure visibility: console errors in browser
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `RoomBuilderPage.tsx` (existing left toolbar, menu, settings panel), `ZoneEditorPage.tsx` (Zone Slots panel pattern + zone editing logic), `DashboardPage.tsx` (heading rename), `App.tsx` (save-and-return navigation)
- New wiring introduced in this slice: pop-out panel component system, section state management in RoomBuilderPage, zone editor tools embedded in RoomBuilderPage
- What remains before the milestone is truly usable end-to-end: nothing — this completes the room-first UX

## Tasks

- [ ] **T01: Extract reusable PopOutPanel component** `est:30m`
  - Why: The Zone Slots panel pattern (header, subtitle, action buttons, scrollable content, close button) needs to be reusable for all 6 sections. Extract it as a shared component before building the sections.
  - Files: `frontend/src/components/PopOutPanel.tsx`
  - Do: Create a `PopOutPanel` component with props: title, subtitle, onClose, children. Style matches the existing Zone Slots panel (semi-transparent backdrop, rounded corners, shadow, header bar with close button). Position is controlled by parent.
  - Verify: Component renders in isolation (used by subsequent tasks)
  - Done when: PopOutPanel component exists and builds without errors

- [ ] **T02: Build left panel section switcher** `est:45m`
  - Why: The vertical list of section buttons (Walls, Devices, Zones, Doors, Furniture, Settings) replaces the current flat toolbar. Only one section is active at a time.
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`, `frontend/src/components/EditorSidebar.tsx`
  - Do: Create `EditorSidebar` component with section buttons. Each button has an icon + label. Clicking a button sets `activeSection` state and opens the corresponding PopOutPanel. Clicking the active button closes it. Include "← Back" at top. Replace the existing left toolbar and hamburger menu in RoomBuilderPage with EditorSidebar.
  - Verify: `npm run build` succeeds, browser shows left panel with section buttons
  - Done when: Left panel renders with all 6 sections, clicking toggles pop-out area, ← Back navigates to dashboard

- [ ] **T03: Walls panel** `est:30m`
  - Why: Move wall drawing tools (Add Wall, Finish, Undo, Clear) into a Walls pop-out panel
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`
  - Do: When Walls section is active, PopOutPanel shows Add Wall button. While drawing: Finish, Undo, Clear appear. On Finish: wall drawing completes (existing logic). Wire existing wall drawing state/handlers into the panel.
  - Verify: Browser: click Walls → draw walls → Finish → walls saved
  - Done when: Wall drawing works through the new panel exactly as before

- [ ] **T04: Doors and Furniture panels** `est:30m`
  - Why: Move Add Door and Add Furniture into their respective pop-out panels
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`
  - Do: Doors panel: Add Door button + door placement mode (existing logic). Furniture panel: Add Furniture button + furniture library (existing). Wire existing state/handlers.
  - Verify: Browser: Add a door via Doors panel, add furniture via Furniture panel
  - Done when: Door and furniture workflows work through new panels

- [ ] **T05: Devices panel with placement controls** `est:1h`
  - Why: Device placement (X/Y, rotation, center/reset) moves from Room Settings to the Devices panel. Add Device button triggers the device attachment flow.
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`
  - Do: Devices panel shows: if no device linked → "No device" message + "Add Device" button. If device linked → device name/icon, placement X/Y inputs, rotation slider, Center/Reset buttons, installation angle suggestion. "Add Device" triggers existing `onAddDevice` flow. Move device placement JSX from Settings panel to Devices panel. Remove device placement section from Settings panel. Hide device icon on canvas when no device (existing fix).
  - Verify: Browser: Devices panel shows Add Device for deviceless room, shows placement controls when device exists
  - Done when: Device placement controls live exclusively in Devices panel, Settings panel has no device controls

- [ ] **T06: Zones panel (embedded zone editor)** `est:2h`
  - Why: Zone editing needs to be accessible from the left panel without navigating to a separate page. This is the most complex panel — it embeds the zone slot management, zone creation, selection, and push-to-device functionality.
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`, possibly extract `frontend/src/components/ZonePanel.tsx`
  - Do: Extract zone management logic from ZoneEditorPage into a reusable panel or embed key zone UI. Zones panel shows: zone slots list (count active/total), +Zone/+Exclusion/+Entry buttons, zone list with enable/disable, polygon/rect mode toggle (if supported). Zone selection highlights on canvas. Push zones to device. Needs device to be linked — show "Add a device first" if no device.
  - Verify: Browser: Zones panel shows zone slots, can add/remove zones, zones render on canvas
  - Done when: Zone editing works from the Zones panel within the Room Builder canvas

- [ ] **T07: Settings panel (room-only) + Save → Dashboard** `est:30m`
  - Why: Settings panel should only contain room-level settings (canvas, floor material, visibility). Save Room should navigate back to Dashboard. Dashboard heading renamed.
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/App.tsx`
  - Do: Settings panel contains: canvas snap/units, floor material, room element visibility. No device placement controls. Save Room callback navigates to dashboard view. Rename DashboardPage heading from "Rooms" to "Dashboard". Update subtitle.
  - Verify: Browser: Settings panel has no device controls, Save Room returns to Dashboard, heading says "Dashboard"
  - Done when: Settings panel is room-only, save navigates back, dashboard renamed

- [ ] **T08: Docker e2e verification + cleanup** `est:30m`
  - Why: Full flow verification in Docker dev stack, remove dead code from old menu/toolbar
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`, Docker
  - Do: Rebuild Docker, run full flow: Dashboard → create room → draw walls (Walls panel) → add furniture (Furniture panel) → add door (Doors panel) → Save → Dashboard. Verify Settings panel. Clean up any dead code from old hamburger menu, old left toolbar.
  - Verify: Docker e2e flow works end-to-end, `npm run build` clean, no console errors
  - Done when: Full flow verified in Docker, old menu/toolbar code removed

## Files Likely Touched

- `frontend/src/components/PopOutPanel.tsx` (new)
- `frontend/src/components/EditorSidebar.tsx` (new)
- `frontend/src/components/ZonePanel.tsx` (possibly new)
- `frontend/src/pages/RoomBuilderPage.tsx` (major rework of left panel + settings)
- `frontend/src/pages/DashboardPage.tsx` (heading rename)
- `frontend/src/App.tsx` (save-and-return navigation)
