# S01: Coordinate transform + zone coverage engine — UAT

**Milestone:** M004
**Written:** 2026-03-31T10:20:27.669Z

## UAT: S01 — Coordinate Transform + Zone Coverage Engine

### Preconditions
- Repository checked out on `feat/multi-device-rooms` branch (or descendant)
- Node.js available, dependencies installed (`cd everything-presence-mmwave-configurator && npm install`)
- No Docker or running services required — all tests are pure-function unit tests

---

### Test 1: Full domain module test suite passes
**Steps:**
1. `cd everything-presence-mmwave-configurator`
2. `npx vitest run src/__tests__/unit/coordinateTransform.test.ts src/__tests__/unit/zoneCoverage.test.ts src/__tests__/unit/zoneAssignment.test.ts`

**Expected:** 89 tests pass (34 + 31 + 24), 0 failures.

---

### Test 2: Coordinate transform — identity at origin
**Steps:**
1. Open `coordinateTransform.test.ts`, find test "sensor at origin with 0° rotation → output matches input geometry"
2. Verify the test creates a ZoneRect at center (500, 500) with width 200, height 100
3. Verify the transform with sensor at (0, 0, 0°) produces beginX/endX/beginY/endY matching center ± half-extents

**Expected:** beginX=400, endX=600, beginY=450, endY=550 (or equivalent center-based calculation with +90° offset applied).

---

### Test 3: Coordinate transform — 90° rotation
**Steps:**
1. Find test for 90° rotation in coordinateTransform.test.ts
2. Verify that X and Y coordinates swap with appropriate sign changes after rotation

**Expected:** Coordinates rotate correctly — point (100, 0) from sensor at origin with 90° rotation maps to a device-space point consistent with the +90° offset convention.

---

### Test 4: Inverse round-trip within tolerance
**Steps:**
1. Find inverse round-trip tests in coordinateTransform.test.ts
2. Verify tests transform a zone to device-space then back to room-space
3. Check tolerance assertion

**Expected:** All inverse round-trips recover original coordinates within 0.01mm for 0°, 90°, 180°, 270°, and arbitrary angles (137°).

---

### Test 5: Zone coverage — fully inside cone
**Steps:**
1. Open `zoneCoverage.test.ts`, find "zone fully inside cone" test
2. Verify a zone positioned entirely within the sensor's FOV and range
3. Check coverage result

**Expected:** Coverage ≈ 1.0 (exact value depends on grid precision, but ≥ 0.9 for a zone well inside the cone).

---

### Test 6: Zone coverage — fully outside cone (behind sensor)
**Steps:**
1. Find "zone behind sensor" test in zoneCoverage.test.ts
2. Verify zone positioned behind the sensor's forward direction

**Expected:** Coverage = 0.0.

---

### Test 7: Zone coverage — beyond max range
**Steps:**
1. Find "zone beyond max range" test
2. Verify zone positioned beyond the sensor's maxRangeMm

**Expected:** Coverage = 0.0.

---

### Test 8: Zone coverage — batch 2×2 matrix
**Steps:**
1. Find "batch 2 zones × 2 sensors" test in zoneCoverage.test.ts
2. Verify computeAllCoverage returns a number[][] with dimensions [2][2]

**Expected:** Matrix has correct per-cell coverage fractions. Fully-covered cells ≈ 1.0, uncovered cells ≈ 0.0.

---

### Test 9: Zone assignment — sequential slot allocation
**Steps:**
1. Open `zoneAssignment.test.ts`, find sequential allocation test
2. Verify 4 regular zones assigned to one sensor

**Expected:** Slots allocated as zone1, zone2, zone3, zone4 in order.

---

### Test 10: Zone assignment — EP One exclusion
**Steps:**
1. Find EP One exclusion test in zoneAssignment.test.ts
2. Verify sensor with maxZones=0, maxExclusionZones=0, maxEntryZones=0

**Expected:** EP One sensor produces zero assignments. Zone goes to unassigned with reason indicating no eligible sensors (or is assigned to another sensor if one exists).

---

### Test 11: Zone assignment — slot overflow
**Steps:**
1. Find slot overflow test (5 regular zones, 4-slot sensor)
2. Verify 5th zone handling

**Expected:** First 4 zones get zone1–zone4 slots. 5th zone appears in unassigned with reason "all zone slots full" (or similar).

---

### Test 12: Zone assignment — zone type routing
**Steps:**
1. Find mixed zone type test (regular + exclusion + entry)
2. Verify each type routes to its own slot pool

**Expected:** Regular zone → zone1, exclusion zone → exclusion1, entry zone → entry1. No cross-pool contamination.

---

### Test 13: Zone assignment — coverage threshold filtering
**Steps:**
1. Find custom threshold test (0.5 threshold)
2. Verify sensor with coverage below threshold is excluded

**Expected:** Sensor with coverage 0.3 (below 0.5 threshold) does not receive the zone assignment. Zone either goes to a higher-coverage sensor or to unassigned.

---

### Edge Cases Verified by Test Suite
- Negative rotation angles (e.g., -90°)
- Rotation > 360° (wraps correctly)
- Zero-dimension zones (width=0 or height=0)
- Large coordinates (100,000mm)
- Empty inputs (no zones, no sensors)
- Undefined rotationDeg defaults to 0°
- Polygon zones with irregular vertex sets
- Zero-distance point (sensor position) treated as inside cone
