---
estimated_steps: 45
estimated_files: 2
skills_used: []
---

# T03: Implement zone-to-device slot assignment engine with EP One exclusion and unit tests

Build `zoneAssignment.ts` in `backend/src/domain/` with pure functions that map room-level zones to specific device zone slots, respecting profile limits and coverage thresholds.

## Context

Each EP device has fixed slot pools:
- **EP Lite**: 4 regular (zone1-zone4), 2 exclusion (exclusion1-exclusion2), 2 entry (entry1-entry2)
- **EP Pro**: 4 regular, 2 exclusion, 0 entry
- **EP One**: 0 regular, 0 exclusion, 0 entry (EXCLUDED entirely — R012)

Profile data from `config/device-profiles/*.json` — limits are in `profile.limits`: `{ maxZones, maxExclusionZones?, maxEntryZones?, ... }`

The assignment engine takes room zones, sensors with their profiles, and a coverage matrix (from `zoneCoverage.ts`), then assigns each zone to device slots on sensors that cover it above a threshold.

## Zone type → slot pool mapping
- `zone.type === 'regular'` → regular zone slots (zone1, zone2, zone3, zone4) — capped by `maxZones`
- `zone.type === 'exclusion'` → exclusion slots (exclusion1, exclusion2) — capped by `maxExclusionZones` (default 0)
- `zone.type === 'entry'` → entry slots (entry1, entry2) — capped by `maxEntryZones` (default 0)

## Steps
1. Create `backend/src/domain/zoneAssignment.ts`
2. Define types:
   - `SlotId`: `'zone1' | 'zone2' | 'zone3' | 'zone4' | 'exclusion1' | 'exclusion2' | 'entry1' | 'entry2'`
   - `ZoneAssignment`: `{ zoneId: string, sensorDeviceId: string, slotId: SlotId, coverage: number }`
   - `AssignmentResult`: `{ assignments: ZoneAssignment[], unassigned: Array<{ zoneId: string, reason: string }>, warnings: string[] }`
   - `SensorProfile`: `{ deviceId: string, placement: DevicePlacement, maxZones: number, maxExclusionZones: number, maxEntryZones: number, fovDeg: number, maxRangeMm: number }`
3. Implement `assignZonesToDevices(zones: Zone[], sensors: SensorProfile[], coverageMatrix: number[][], overlapThreshold?: number): AssignmentResult`
   - Default overlapThreshold = 0.1 (10% coverage minimum)
   - For each zone: find sensors where coverage >= threshold
   - For each qualifying sensor: allocate the next available slot in the correct pool
   - If no sensor covers a zone above threshold: add to `unassigned` with reason
   - If a sensor's slot pool is full: add warning and skip that sensor for that zone
   - Skip sensors with maxZones=0 entirely (EP One — R012)
4. Implement `getAvailableSlots(zoneType: Zone['type'], profile: SensorProfile, usedSlots: Set<SlotId>): SlotId[]`
5. Create `backend/src/__tests__/unit/zoneAssignment.test.ts` with tests:
   - Single sensor covers all zones → sequential slot allocation (zone1, zone2, zone3, zone4)
   - Multi-sensor overlap: same zone assigned to multiple sensors' slots
   - Zone below coverage threshold → unassigned with reason
   - EP One sensor (maxZones=0) → completely skipped, no error
   - Slot overflow: 5 regular zones with 4 slots → 5th goes to unassigned
   - Exclusion zone → uses exclusion1/exclusion2 slots, not regular slots
   - Entry zone → uses entry1/entry2 slots, not regular slots
   - EP Pro with 0 entry zones → entry zones go to unassigned
   - Mixed zone types: regular + exclusion + entry allocated from separate pools
   - Empty inputs: no zones → empty result; no sensors → all unassigned
   - Custom threshold: 0.5 threshold filters out low-coverage sensors

## Must-Haves
- [ ] Zone types route to correct slot pools (regular/exclusion/entry)
- [ ] EP One devices (maxZones=0) are completely excluded from assignment
- [ ] Slot overflow produces unassigned entries with clear reason, not an error
- [ ] Coverage threshold is configurable with sensible default
- [ ] All unit tests pass

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — Zone, ZoneRect, ZonePolygon, Point, DevicePlacement`
- ``everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts` — computeAllCoverage return type (number[][] coverage matrix)`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts` — pure functions: assignZonesToDevices, getAvailableSlots, types SlotId/ZoneAssignment/AssignmentResult/SensorProfile`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/zoneAssignment.test.ts` — unit tests covering slot allocation, EP One exclusion, overflow, separate slot pools, threshold filtering`

## Verification

cd everything-presence-mmwave-configurator/backend && npx vitest run src/__tests__/unit/zoneAssignment.test.ts
