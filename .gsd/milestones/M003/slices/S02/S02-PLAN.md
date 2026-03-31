# S02: Frontend data model + RoomCanvas multi-sensor rendering

**Goal:** Frontend types match backend `sensors[]`. RoomCanvas renders N colored radar cones with independent drag. All existing single-device callers remain unbroken.
**Demo:** After this: Frontend types match backend `sensors[]`. RoomCanvas renders N colored radar cones. Room builder shows all sensors but device management UI is not yet wired — this proves rendering works.

## Tasks
- [x] **T01: Deleted bad S02 branch (forked from main) and recreated from feat/multi-device-rooms with all M001/M002/S01 room-first work present** — The current `feat/multi-device-rooms--M003-S02` branch was forked from `main` (commit 2f097aa), missing all M001+M002+M003/S01 work. Must delete the bad branch, create a new one from `feat/multi-device-rooms`, and verify the room-first codebase is present.

Steps:
1. Ensure we're on `feat/multi-device-rooms` (the integration branch)
2. Delete the bad branch: `git branch -D feat/multi-device-rooms--M003-S02`
3. Create new branch: `git checkout -b feat/multi-device-rooms--M003-S02`
4. Verify room-first files exist: `frontend/src/components/canvas/types.ts` has `ActiveDrag` union, `RoomCanvas.tsx` imports from generic item system, `backend/src/` has sensors migration from S01
5. Verify `npx tsc --noEmit` baseline (note any pre-existing errors but confirm S01 backend sensors types exist)
  - Estimate: 10m
  - Verify: git log --oneline -5 shows feat/multi-device-rooms history (M001/M002/S01 commits present). `git show feat/multi-device-rooms--M003-S02:everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` contains ActiveDrag union type.
- [ ] **T02: Add SensorAttachment type, sensors[] on RoomConfig, SensorRenderInfo, and SENSOR_COLORS** — Add all new types needed for multi-sensor support to the correct room-first codebase. This includes the API type, canvas rendering type, color constants, and DeviceDragState extension.

Steps:
1. In `frontend/src/api/types.ts`:
   - Add `SensorAttachment` interface: `{ deviceId: string; profileId?: string; placement?: DevicePlacement; }`
   - Add `sensors?: SensorAttachment[]` to `RoomConfig` interface (keep existing `deviceId?`, `profileId?`, `devicePlacement?` unchanged)
2. In `frontend/src/components/canvas/types.ts`:
   - Add `SensorRenderInfo` interface: `{ id: string; placement: DevicePlacement; fovDeg: number; maxRangeMeters: number; iconUrl?: string; color: string; }`
   - Import `DevicePlacement` from `DeviceItemRenderer` (or from api/types if re-exported)
   - Add `SENSOR_COLORS` constant: `['#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']`
   - Extend existing `DeviceDragState` (currently `{ mode: 'device-drag' }`) with `sensorId?: string` field for per-sensor drag isolation
  - Estimate: 20m
  - Files: frontend/src/api/types.ts, frontend/src/components/canvas/types.ts
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit — no new errors introduced. SensorAttachment and SensorRenderInfo properly exported.
- [ ] **T03: Parameterize DeviceItemRenderer colors + RoomCanvas multi-sensor rendering** — Make DeviceItemRenderer accept a color parameter (replacing hardcoded #22c55e/#3b82f6), then update RoomCanvas to accept and render an array of sensor placements with per-sensor drag.

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
  - Estimate: 1h 15m
  - Files: frontend/src/components/canvas/DeviceItemRenderer.tsx, frontend/src/components/RoomCanvas.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit — no new errors. Existing callers (ZoneEditorPage, WizardPage, LiveTrackingPage) that don't pass sensorPlacements still compile.
- [ ] **T04: Wire RoomBuilderPage to build sensorPlacements from room.sensors[]** — Connect backend sensors[] data to RoomCanvas multi-sensor rendering in RoomBuilderPage. Build SensorRenderInfo array from room config, handle drag updates, update Devices panel badge.

Steps:
1. In `frontend/src/pages/RoomBuilderPage.tsx`:
   - Add `useMemo` that builds `SensorRenderInfo[]` from `selectedRoom.sensors`: for each sensor, look up profile from `profiles` array via `sensor.profileId`, extract `limits.fieldOfViewDegrees`, `limits.maxRangeMeters`, `iconUrl`. Assign color from `SENSOR_COLORS[index % SENSOR_COLORS.length]`. Default placement to room centroid if undefined.
   - Pass `sensorPlacements` to `RoomCanvas` when `selectedRoom.sensors?.length > 0`
   - Implement `onSensorChange` callback: find sensor in `selectedRoom.sensors` by id, update its placement, sync `devicePlacement` from `sensors[0].placement` for backward compat, call room update
   - Implement `onSensorSelect` callback: set selectedItem to `{ type: 'device', id: sensorId }`
   - Update existing `onDeviceChange` handler: when sensorPlacements is used, delegate to `onSensorChange`
   - In Devices panel badge: show `selectedRoom.sensors?.length` instead of hardcoded '1'
  - Estimate: 45m
  - Files: frontend/src/pages/RoomBuilderPage.tsx
  - Verify: cd everything-presence-mmwave-configurator && npx tsc --noEmit — clean compile. RoomBuilderPage imports SensorRenderInfo and SENSOR_COLORS from canvas/types.
- [x] **T05: Browser verification — multi-sensor rendering end-to-end** — 
  - Files: none (verification only)
  - Verify: All checks pass in browser + TypeScript clean
- [ ] **T06: Browser verification — multi-sensor rendering on correct codebase** — Full end-to-end verification that multi-sensor rendering works on the correct room-first codebase with M003/S01 backend sensors support.

Steps:
1. Start backend + frontend dev servers (using dev docker compose or direct npm run dev)
2. Verify backend has sensors[] support: GET /api/rooms should return rooms with sensors[] array (from S01 migration)
3. Use API to create/update a room with 2 sensors (different profiles if available, else same profile at different positions)
4. Open Room Builder in browser, navigate to the multi-sensor room
5. Verify: two distinct-colored radar cones render (green + amber)
6. Verify: each sensor can be selected and dragged independently
7. Verify: after drag, reload page — positions persist via PUT /api/rooms with sensors[]
8. Navigate to a single-device room — verify it still renders normally via devicePlacement fallback
9. Run `npx tsc --noEmit` final time to confirm clean compile
10. Check browser console for errors/warnings
11. Verify room-first UI design is correct (walls, doors, furniture all present from M001/M002)
  - Estimate: 30m
  - Verify: All browser checks pass: two colored cones render, drag works per-sensor, positions persist, single-device rooms unaffected, TypeScript clean, no console errors.
