# S04: Room device lifecycle + aggregation config — UAT

**Milestone:** M004
**Written:** 2026-03-31T15:48:02.362Z

## UAT: S04 — Room device lifecycle + aggregation config

### Preconditions
- Backend running with Docker (HA + MQTT broker available)
- At least one room with zones and attached EP Lite/Pro sensors configured

---

### Test 1: Zone save creates virtual room device
1. Create a room with 2 rectangular zones and 1 attached EP Lite sensor
2. POST to `/api/rooms/:id/apply-zones`
3. **Expected**: Response includes `roomDevice: { created: true, warnings: [] }`
4. Check HA device registry — a virtual device named after the room should exist
5. Check HA entity registry — binary_sensor entities for each zone occupancy and sensor entities for target count should exist

### Test 2: Aggregation mode defaults to OR
1. Create a room with 1 zone (no aggregationMode set) covered by 2 sensors
2. Apply zones
3. **Expected**: The generated template binary sensor uses OR logic (`{{ is_state('...', 'on') or is_state('...', 'on') }}`)

### Test 3: Aggregation mode configurable per zone
1. Create a room with 2 zones:
   - Zone A: `aggregationMode: 'majority'`
   - Zone B: `aggregationMode: 'no_change_on_tie'`
2. Apply zones with 2 covering sensors
3. **Expected**: Zone A template uses majority logic. Zone B template uses no-change-on-tie with self-reference fallback.

### Test 4: Target count uses max
1. Create a room with 1 zone covered by 2 EP Lite sensors
2. Apply zones
3. **Expected**: Target count template sensor uses `| max` across both sensors' zone target count entities

### Test 5: Room delete cleans up HA entities
1. Create a room with zones, apply zones (room device created)
2. DELETE `/api/rooms/:id`
3. **Expected**: Room deleted from storage. MQTT empty payloads published to discovery topics (entities removed from HA). 204 response.

### Test 6: Cleanup failure doesn't block deletion
1. Create a room with zones, apply zones
2. Disconnect MQTT broker
3. DELETE `/api/rooms/:id`
4. **Expected**: Room still deleted from storage (204 response). Warning logged about MQTT cleanup failure.

### Test 7: Invalid aggregationMode rejected
1. POST/PUT a room with a zone containing `aggregationMode: 'invalid_mode'`
2. **Expected**: The invalid mode is silently omitted — zone saved without aggregationMode field. Default 'or' used at template generation time.

### Test 8: Server starts without MQTT config
1. Start backend with no `config.mqtt` section
2. **Expected**: Server starts normally. Info log about MQTT not configured. All zone write operations work. Apply-zones response has `roomDevice: null`.

### Test 9: Missing entity mappings produce warnings
1. Create a room with zones covered by a sensor that has incomplete entity mappings
2. Apply zones
3. **Expected**: Response includes `roomDevice.warnings` array listing which sensors had missing entity mappings. Room device still created for zones that had at least one valid sensor.

### Test 10: EP One excluded from lifecycle
1. Create a room with zones covered only by EP One sensor (maxZones=0)
2. Apply zones
3. **Expected**: No room device created (no valid zone assignments). Response indicates no room device.

---

### Edge Cases

- Room with 0 zones: apply-zones should not create a room device
- Room with zones but 0 attached sensors: no assignments, no room device
- Multiple apply-zones calls: room device updated (re-published), not duplicated
