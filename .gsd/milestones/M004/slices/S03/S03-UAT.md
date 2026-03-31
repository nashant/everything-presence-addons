# S03: Zone assignment + per-device translated zone writes — UAT

**Milestone:** M004
**Written:** 2026-03-31T14:29:00.672Z

## UAT: S03 — Zone assignment + per-device translated zone writes

### Preconditions
- Backend running with `npm run dev` inside Docker container
- Frontend accessible at localhost:42069
- At least one room with walls drawn, 2+ sensors attached (e.g., EP Lite devices), and 1+ zones drawn
- HA instance running with device entities discovered for attached sensors

### Test Case 1: Room save triggers zone writes (happy path)
1. Open Room Builder for a room with walls, 2 EP Lite sensors, and 3 zones
2. Click Save
3. **Expected:** Room saves successfully (success modal or confirmation)
4. Open browser console — check for zone apply result log
5. **Expected:** Console shows `applyRoomZones` result with `ok: true`, `results` array with entries for each sensor, `unassigned: []`
6. In HA, navigate to each sensor's zone entities (e.g., `number.lite1_zone1_begin_x`)
7. **Expected:** Zone coordinates are in device-space (transformed from room origin to sensor origin + rotation), not raw room-space values

### Test Case 2: Room with no sensors — no zone writes attempted
1. Open Room Builder for a room with walls and zones but NO sensors
2. Click Save
3. **Expected:** Room saves successfully, no errors
4. **Expected:** No `apply-zones` API call made (check Network tab — should only show room PUT, not POST apply-zones)

### Test Case 3: Room with no zones — no zone writes attempted
1. Open Room Builder for a room with walls and sensors but NO zones
2. Click Save
3. **Expected:** Room saves successfully, no errors
4. **Expected:** No `apply-zones` API call made

### Test Case 4: EP One sensor excluded from zone assignment
1. Create a room with 1 EP One sensor and 1 EP Lite sensor, plus 2 zones
2. Save the room
3. **Expected:** Only EP Lite receives zone writes. EP One (maxZones=0) receives no writes.
4. In HA: EP Lite zone entities updated with coordinates. EP One zone entities unchanged.

### Test Case 5: Zone below coverage threshold appears as unassigned
1. Create a room with a single sensor and a zone placed entirely outside the sensor's FOV
2. Save the room
3. **Expected:** Console log shows `unassigned` array containing the out-of-coverage zone with reason
4. **Expected:** No zone write attempted for the uncovered zone

### Test Case 6: HA unavailable — zone write fails gracefully
1. Stop the HA container (`docker stop homeassistant`)
2. Save a room with sensors and zones
3. **Expected:** Room data persists (room PUT succeeds)
4. **Expected:** Apply-zones returns 503 or write errors — room save still shows success
5. **Expected:** Console logs the zone write failure
6. Restart HA (`docker start homeassistant`)

### Test Case 7: Missing room — apply-zones returns 404
1. Send `POST /api/rooms/nonexistent-id/apply-zones` via curl or API tool
2. **Expected:** 404 response with appropriate error message

### Test Case 8: Polygon zones write correctly
1. Create a room with a polygon zone (not rectangular)
2. Attach an EP Pro sensor (supports polygon zones)
3. Save the room
4. **Expected:** Polygon zone written via polygonToText() format to the sensor's polygon entity
5. **Expected:** Device-space transformed vertices (rotated + translated to sensor origin)

### Test Case 9: Multiple sensors covering same zone
1. Create a room with 2 EP Lite sensors whose FOVs overlap on a single zone
2. Save the room
3. **Expected:** Both sensors receive the zone in their respective slot assignments
4. **Expected:** Each sensor gets device-space coordinates relative to its own position/rotation (different values per sensor)

### Edge Cases
- Room with maximum zones (4 regular + 2 exclusion + 2 entry for EP Lite) — all slots written, verify coordinates
- Sensor with entity resolution failure (entity not discovered) — warning in result, other zones still written
- Rapid re-saves — each save overwrites previous zone writes cleanly
