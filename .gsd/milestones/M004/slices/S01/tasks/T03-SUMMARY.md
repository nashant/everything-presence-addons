---
id: T03
parent: S01
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts", "everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts"]
key_decisions: ["EP One exclusion uses all-zero cap detection (maxZones=0 AND maxExclusionZones=0 AND maxEntryZones=0) rather than hardcoded device name check — profile-driven", "Zones assigned to multiple qualifying sensors independently — each sensor gets its own slot", "Qualifying sensors sorted by coverage descending before allocation"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran vitest on zoneAssignment.test.ts: 24/24 tests pass. Ran full slice verification across all three domain modules (coordinateTransform + zoneCoverage + zoneAssignment): 89/89 tests pass."
completed_at: 2026-03-31T10:18:07.938Z
blocker_discovered: false
---

# T03: Built zoneAssignment.ts with coverage-threshold-gated slot allocation across three zone-type pools — 24 unit tests pass covering slot routing, EP One exclusion, overflow, multi-sensor overlap, and edge cases

> Built zoneAssignment.ts with coverage-threshold-gated slot allocation across three zone-type pools — 24 unit tests pass covering slot routing, EP One exclusion, overflow, multi-sensor overlap, and edge cases

## What Happened
---
id: T03
parent: S01
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts
key_decisions:
  - EP One exclusion uses all-zero cap detection (maxZones=0 AND maxExclusionZones=0 AND maxEntryZones=0) rather than hardcoded device name check — profile-driven
  - Zones assigned to multiple qualifying sensors independently — each sensor gets its own slot
  - Qualifying sensors sorted by coverage descending before allocation
duration: ""
verification_result: passed
completed_at: 2026-03-31T10:18:07.938Z
blocker_discovered: false
---

# T03: Built zoneAssignment.ts with coverage-threshold-gated slot allocation across three zone-type pools — 24 unit tests pass covering slot routing, EP One exclusion, overflow, multi-sensor overlap, and edge cases

**Built zoneAssignment.ts with coverage-threshold-gated slot allocation across three zone-type pools — 24 unit tests pass covering slot routing, EP One exclusion, overflow, multi-sensor overlap, and edge cases**

## What Happened

Created zoneAssignment.ts with two exported pure functions: assignZonesToDevices() maps room zones to device slot IDs by finding eligible sensors above a coverage threshold, sorting by coverage descending, and allocating slots from the correct pool (regular/exclusion/entry). getAvailableSlots() returns available slots for a zone type respecting profile caps and used slots. EP One devices (all-zero caps) are excluded entirely per R012. Zones can be assigned to multiple sensors independently. Unassigned zones get structured reason strings distinguishing no-eligible-sensors, below-threshold, and pool-full scenarios. Fixed a bug where EP One sensor coverage polluted the unassigned-reason logic. Test suite covers 24 scenarios including sequential allocation, multi-sensor overlap, threshold filtering, EP One exclusion, slot overflow, zone-type routing, EP Pro entry exclusion, mixed types, and edge cases.

## Verification

Ran vitest on zoneAssignment.test.ts: 24/24 tests pass. Ran full slice verification across all three domain modules (coordinateTransform + zoneCoverage + zoneAssignment): 89/89 tests pass.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run src/__tests__/unit/zoneAssignment.test.ts` | 0 | ✅ pass | 3000ms |
| 2 | `npx vitest run coordinateTransform + zoneCoverage + zoneAssignment (all 3 domain modules)` | 0 | ✅ pass | 3100ms |


## Deviations

Refined unassigned-reason logic to track eligible coverages separately from excluded sensors — discovered during testing, not a plan change.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts`


## Deviations
Refined unassigned-reason logic to track eligible coverages separately from excluded sensors — discovered during testing, not a plan change.

## Known Issues
None.
