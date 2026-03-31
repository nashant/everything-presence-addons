---
estimated_steps: 39
estimated_files: 2
skills_used: []
---

# T01: Implement room-space → device-space coordinate transform with unit tests

Build `coordinateTransform.ts` in `backend/src/domain/` with pure functions that translate zone coordinates from room-space to device-space.

## Context

The frontend uses center-based ZoneRect (x,y = center, width/height = extents) and ZonePolygon (vertices array). Sensors have a DevicePlacement with x, y, rotationDeg. The transform must:
1. Translate zone coordinates relative to the sensor position (subtract sensor x,y)
2. Rotate by negative sensor angle to undo the sensor's orientation
3. Use the +90° rotation offset convention: `effectiveAngleRad = (rotationDeg + 90) * π / 180` — this matches `buildRadarPath` in `frontend/src/components/canvas/geometry.ts` where 0° means sensor forward is +Y
4. Output device-space coordinates in begin/end format (beginX, endX, beginY, endY) for ZoneRect, suitable for the downstream zoneWriter

## Key type info from `backend/src/domain/types.ts`
- `ZoneRect`: `{ id, type, x, y, width, height, enabled?, label? }` — x,y is CENTER
- `ZonePolygon`: `{ id, type, vertices: Point[], enabled?, label? }` — vertices in room-space
- `Point`: `{ x: number, y: number }`
- `DevicePlacement`: `{ x, y, rotationDeg? }`
- `isZoneRect(zone)` / `isZonePolygon(zone)` — type guards
- All coordinates are in mm

## Important: rectToPolygon convention mismatch
`polygonUtils.ts:rectToPolygon()` treats ZoneRect x,y as top-left corner. The frontend treats x,y as center. The transform must use the CENTER convention (matching frontend) — do NOT use rectToPolygon for ZoneRect corner computation.

## Steps
1. Create `backend/src/domain/coordinateTransform.ts`
2. Define output types: `DeviceZoneRect { beginX, endX, beginY, endY, type, id, enabled?, label? }` and `DeviceZonePolygon { vertices: Point[], type, id, enabled?, label? }`
3. Implement `transformPoint(point: Point, sensorPlacement: DevicePlacement): Point` — translate then rotate
4. Implement `transformZoneToDeviceSpace(zone: Zone, sensorPlacement: DevicePlacement): DeviceZoneRect | DeviceZonePolygon`
5. Implement `transformZoneToRoomSpace(deviceZone, sensorPlacement)` — inverse transform for S05 use
6. Implement batch helper: `transformZonesToDeviceSpace(zones: Zone[], sensorPlacement: DevicePlacement)`
7. Create `backend/src/__tests__/unit/coordinateTransform.test.ts` with tests:
   - Identity transform: sensor at origin with 0° rotation → output matches input (with center→begin/end conversion for rect)
   - 90° rotation: verify coordinates rotate correctly
   - 180° rotation: verify sign flip
   - 270° rotation: verify
   - Arbitrary angle (e.g., 45°): verify trigonometry
   - Sensor at offset position (not origin): verify translation
   - ZonePolygon transform: all vertices transform correctly
   - Inverse transform round-trips: transform → inverse → original (within floating point tolerance)
   - Edge case: rotationDeg undefined defaults to 0°

## Must-Haves
- [ ] `transformPoint` correctly applies translate-then-rotate with +90° offset
- [ ] Rotation direction is NEGATIVE sensor angle (room→device undoes sensor rotation)
- [ ] ZoneRect center-based input → begin/end output conversion is correct
- [ ] Inverse transform round-trips to within 0.01mm tolerance
- [ ] All unit tests pass

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — Zone, ZoneRect, ZonePolygon, Point, DevicePlacement, isZoneRect, isZonePolygon type definitions`
- ``everything-presence-mmwave-configurator/frontend/src/components/canvas/geometry.ts` — reference for +90° rotation convention in buildRadarPath (line: `(rotationDeg + 90) * Math.PI / 180`)`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/domain/coordinateTransform.ts` — pure transform functions: transformPoint, transformZoneToDeviceSpace, transformZoneToRoomSpace, transformZonesToDeviceSpace`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/coordinateTransform.test.ts` — unit tests covering identity, 4 rotation quadrants, offset sensor, polygon, inverse round-trip`

## Verification

cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/coordinateTransform.test.ts
