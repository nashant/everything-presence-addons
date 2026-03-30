# S02: Frontend data model + RoomCanvas multi-sensor rendering

**Goal:** Frontend types match backend `sensors[]`. RoomCanvas renders N colored radar cones with independent drag. All existing single-device callers remain unbroken.
**Demo:** Open Room Builder with a room that has 2 sensors (seeded via API). See two distinct-colored radar cones. Drag each independently. TypeScript compiles clean.

## Must-Haves

- `SensorAttachment` type + `sensors?: SensorAttachment[]` on frontend `RoomConfig`
- `SensorRenderInfo` type with per-sensor color for canvas rendering
- `DeviceItemRenderer` accepts color parameter (no more hardcoded green/blue)
- `RoomCanvas` accepts `sensorPlacements?: SensorRenderInfo[]` prop, renders N sensors
- `RoomCanvas` falls back to singular `devicePlacement` prop when `sensorPlacements` not provided (backward compat)
- `DeviceDragState` extended with `sensorId` for per-sensor drag isolation
- `RoomBuilderPage` builds `sensorPlacements[]` from `room.sensors[]` + profile lookup
- `RoomBuilderPage` drag handler updates `sensors[i].placement` and includes `sensors[]` in PUT payload

## Proof Level

- This slice proves: integration (frontend renders real backend data with multi-sensor array)
- Real runtime required: yes (TypeScript compilation + browser verification with dev server)
- Human/UAT required: yes (visual check that two radar cones render distinctly)

## Verification

- `cd everything-presence-mmwave-configurator && npx tsc --noEmit` — TypeScript compiles clean with new types
- Start dev server, POST a 2-sensor room via API, open Room Builder, visually confirm:
  - Two distinct-colored radar cones render
  - Each sensor icon is visible
  - Dragging one sensor moves only that sensor's cone
  - Existing single-device rooms continue rendering normally
- All existing callers (`ZoneEditorPage`, `WizardPage`, `LiveTrackingPage`, `App.tsx`) still compile and render device — they use the singular `devicePlacement` fallback path

## Observability / Diagnostics

- Runtime signals: Console warnings if `sensorPlacements` contains entries with invalid placement (NaN coords)
- Inspection surfaces: Browser DevTools → React component props on `RoomCanvas` show `sensorPlacements` array
- Failure visibility: TypeScript compiler errors surface any missed type updates immediately
- Redaction constraints: none (no secrets involved)

## Integration Closure

- Upstream surfaces consumed: Backend `GET /api/rooms` returning `sensors[]` (S01), `DeviceItemRenderer` + `canvas/geometry.ts` (M002/S02)
- New wiring introduced in this slice: `RoomBuilderPage` reads `room.sensors[]` → builds `SensorRenderInfo[]` → passes to `RoomCanvas` → renders via `DeviceItemRenderer` with per-sensor color
- What remains before the milestone is truly usable end-to-end: S03 — device management UI (add/remove/select sensors from Devices panel)

## Tasks

- [ ] **T01: Add SensorAttachment type + sensors[] to frontend RoomConfig** `est:20m`
  - Why: Frontend types must match the backend `sensors[]` contract from S01 so the API response is properly typed. This is the foundation for all subsequent rendering work.
  - Files: `frontend/src/api/types.ts`
  - Do:
    - Add `SensorAttachment` interface: `{ deviceId: string; profileId?: string; placement?: DevicePlacement; }`
    - Add `sensors?: SensorAttachment[]` to `RoomConfig` interface
    - Keep existing `deviceId?`, `profileId?`, `devicePlacement?` fields unchanged (backend backfills them)
  - Verify: `npx tsc --noEmit` passes — no existing code breaks since `sensors` is optional
  - Done when: `SensorAttachment` exported from `api/types.ts`, `RoomConfig.sensors` typed, clean compile

- [ ] **T02: Parameterize DeviceItemRenderer colors + add SensorRenderInfo type** `est:30m`
  - Why: The renderer hardcodes `#22c55e` (radar) and `#3b82f6` (icon). Multi-sensor rendering requires each sensor to have a distinct color. The `SensorRenderInfo` type provides the rendering contract between RoomCanvas and its callers.
  - Files: `frontend/src/components/canvas/DeviceItemRenderer.tsx`, `frontend/src/components/canvas/types.ts`
  - Do:
    - Add `color?: string` to `DeviceRenderParams` (defaults to `#22c55e` if not provided — backward compat)
    - In `renderDeviceNonInteractive`: use `color` param for radar fill (`${color}22` for alpha) and stroke, use a derived darker shade or keep icon color as secondary
    - In `renderDeviceInteractive`: same color parameterization + add `sensorId?: string` to `DeviceInteractiveParams`
    - Add `SensorRenderInfo` interface to `canvas/types.ts`: `{ id: string; placement: DevicePlacement; fovDeg: number; maxRangeMeters: number; iconUrl?: string; color: string; }`
    - Add `SENSOR_COLORS` constant array: `['#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']` (green, amber, purple, pink, cyan)
    - Extend `DeviceDragState` with `sensorId: string` field
  - Verify: `npx tsc --noEmit` passes. Existing calls to `renderDeviceNonInteractive`/`renderDeviceInteractive` still work (color is optional).
  - Done when: Both render functions accept `color`, `SensorRenderInfo` + `SENSOR_COLORS` exported, `DeviceDragState` has `sensorId`

- [ ] **T03: RoomCanvas multi-sensor rendering with per-sensor drag** `est:1h`
  - Why: This is the core rendering change — RoomCanvas must loop over an array of sensors and render each with its own colored radar cone and draggable icon, while preserving the singular-device fallback for all existing callers.
  - Files: `frontend/src/components/RoomCanvas.tsx`
  - Do:
    - Add new props: `sensorPlacements?: SensorRenderInfo[]`, `selectedSensorId?: string`, `onSensorChange?: (sensorId: string, placement: DevicePlacement) => void`, `onSensorSelect?: (sensorId: string) => void`
    - In the interactive device rendering section (~line 871): if `sensorPlacements` is provided, iterate and call `renderDeviceInteractive` for each, passing sensor-specific color/placement/fov/range. Render all cones first (as a group), then all icons (z-order: cones below icons).
    - In the non-interactive device rendering section (renderOverlay `deviceElement`): if `sensorPlacements` is provided, produce an array of `renderDeviceNonInteractive` elements.
    - Update device drag handling in `handleMouseMove` (~line 450): when `activeDrag.mode === 'device-drag'`, read `activeDrag.sensorId` to find the correct sensor placement from `sensorPlacements`, apply snap + constrain, call `onSensorChange(sensorId, newPlacement)`.
    - Update drag start: `setActiveDrag({ mode: 'device-drag', sensorId })` with the sensor's id.
    - Fallback: when `sensorPlacements` is not provided, use existing singular `devicePlacement`/`onDeviceChange` path unchanged (if block, not rewrite).
    - Update `isPointInSensorRange` to check against all sensors when `sensorPlacements` provided (zone coverage shows "full" if ANY sensor covers the zone).
  - Verify: `npx tsc --noEmit` passes. Existing callers (ZoneEditorPage, WizardPage, etc.) that don't pass `sensorPlacements` still render their single device correctly.
  - Done when: RoomCanvas renders N sensors when `sensorPlacements` provided, falls back to single device when not, drag moves only the targeted sensor

- [ ] **T04: Wire RoomBuilderPage to build sensorPlacements from room.sensors[]** `est:45m`
  - Why: This connects the backend data model to the canvas rendering. RoomBuilderPage must read `sensors[]` from the room, resolve each sensor's profile limits, build `SensorRenderInfo[]`, and handle drag updates that write back to `sensors[]`.
  - Files: `frontend/src/pages/RoomBuilderPage.tsx`
  - Do:
    - Add a `useMemo` that builds `SensorRenderInfo[]` from `selectedRoom.sensors`: for each sensor, look up its profile from the `profiles` array via `sensor.profileId`, extract `limits.fieldOfViewDegrees`, `limits.maxRangeMeters`, `iconUrl`. Assign color from `SENSOR_COLORS[index % SENSOR_COLORS.length]`. Compute safe placement (default to room centroid if `sensor.placement` is undefined).
    - Pass `sensorPlacements` to `RoomCanvas` when `selectedRoom.sensors?.length > 0`.
    - Implement `onSensorChange` callback: find the sensor in `selectedRoom.sensors` by id, update its `placement`, also sync `devicePlacement` from `sensors[0].placement` for backward compat, call `setRooms()` with updated room.
    - Implement `onSensorSelect` callback: set `selectedItem` to `{ type: 'device', id: sensorId }`.
    - Update the existing `onDeviceChange` handler: when `sensorPlacements` is used, delegate to `onSensorChange` instead.
    - In the Devices panel badge: show sensor count from `selectedRoom.sensors?.length` instead of hardcoded `'1'`.
  - Verify: Start dev server + backend. POST a room with 2 sensors via curl. Open Room Builder. Two colored radar cones visible. Drag each independently. Room auto-saves with `sensors[]` in the PUT payload.
  - Done when: RoomBuilderPage renders multi-sensor rooms from backend data, drag updates persist to `sensors[]`, backward compat with single-device rooms maintained

- [ ] **T05: Browser verification — multi-sensor rendering end-to-end** `est:30m`
  - Why: Final integration proof that the full stack works: backend serves `sensors[]`, frontend renders N sensors, drag works, existing single-device rooms unaffected.
  - Files: none (verification only)
  - Do:
    - Start backend + frontend dev servers
    - Use API to create a room with 2 sensors (different profiles if available, else same profile at different positions)
    - Open Room Builder in browser, navigate to the multi-sensor room
    - Verify: two distinct-colored radar cones render
    - Verify: each sensor can be selected and dragged independently
    - Verify: after drag, reload page — positions persist
    - Navigate to a single-device room — verify it still renders normally
    - Run `npx tsc --noEmit` one final time to confirm clean compile
    - Check browser console for errors/warnings
  - Verify: All checks pass in browser + TypeScript clean
  - Done when: Multi-sensor rendering demonstrated end-to-end, no regressions in single-device rooms, clean compile

## Files Likely Touched

- `frontend/src/api/types.ts` — `SensorAttachment` + `sensors[]` on `RoomConfig`
- `frontend/src/components/canvas/types.ts` — `SensorRenderInfo`, `SENSOR_COLORS`, `DeviceDragState.sensorId`
- `frontend/src/components/canvas/DeviceItemRenderer.tsx` — `color` param on render functions
- `frontend/src/components/RoomCanvas.tsx` — `sensorPlacements` prop, multi-sensor render loop, drag handling
- `frontend/src/pages/RoomBuilderPage.tsx` — build `sensorPlacements[]`, `onSensorChange`, Devices panel badge
