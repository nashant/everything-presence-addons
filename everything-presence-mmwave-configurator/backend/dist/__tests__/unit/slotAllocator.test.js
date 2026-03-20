"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const slotAllocator_1 = require("../../domain/slotAllocator");
// ── Helpers ──────────────────────────────────────────────────────
/** Shorthand to build a RoomZone for tests */
function makeZone(overrides) {
    return {
        type: 'regular',
        sensorParticipation: {},
        geometry: { id: overrides.id, type: overrides.type ?? 'regular', x: 0, y: 0, width: 1000, height: 1000 },
        ...overrides,
    };
}
/** Shorthand to build a SensorAttachment */
function makeSensor(deviceId, profileId) {
    return {
        deviceId,
        profileId,
        placement: { x: 0, y: 0 },
    };
}
// Profile limits keyed by profileId
const PROFILES = {
    'everything_presence_lite': { maxZones: 4, maxExclusionZones: 2, maxEntryZones: 2 },
    'everything_presence_pro': { maxZones: 4, maxExclusionZones: 2, maxEntryZones: 0 },
    'everything_presence_one': { maxZones: 0 },
};
function getProfileLimits(profileId) {
    return PROFILES[profileId];
}
// ── Tests ────────────────────────────────────────────────────────
(0, vitest_1.describe)('allocateSlots', () => {
    (0, vitest_1.it)('basic: 1 regular zone, 1 Lite sensor → slot 1 assigned', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Sofa', type: 'regular', sensorParticipation: { s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.assignments).toHaveLength(1);
        (0, vitest_1.expect)(result.assignments[0]).toEqual({
            deviceId: 's1',
            slotIndex: 1,
            zoneId: 'z1',
            zoneType: 'regular',
        });
    });
    (0, vitest_1.it)('multi-zone: 3 regular zones, 1 Lite sensor → slots 1,2,3 assigned', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Zone A', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z2', name: 'Zone B', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z3', name: 'Zone C', sensorParticipation: { s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.assignments).toHaveLength(3);
        (0, vitest_1.expect)(result.assignments.map((a) => a.slotIndex)).toEqual([1, 2, 3]);
    });
    (0, vitest_1.it)('over-capacity: 5 regular zones, 1 Lite sensor (max 4) → 4 assigned, 1 error', () => {
        const zones = Array.from({ length: 5 }, (_, i) => makeZone({ id: `z${i + 1}`, name: `Zone ${i + 1}`, sensorParticipation: { s1: true } }));
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.assignments).toHaveLength(4);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0]).toMatchObject({
            zoneId: 'z5',
            zoneName: 'Zone 5',
            deviceId: 's1',
        });
        (0, vitest_1.expect)(result.errors[0].reason).toContain('capacity');
    });
    (0, vitest_1.it)('mixed types: 1 regular + 1 exclusion + 1 entry, 1 Lite → correct slot per type', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Regular', type: 'regular', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z2', name: 'Exclusion', type: 'exclusion', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z3', name: 'Entry', type: 'entry', sensorParticipation: { s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.assignments).toHaveLength(3);
        const regular = result.assignments.find((a) => a.zoneType === 'regular');
        const exclusion = result.assignments.find((a) => a.zoneType === 'exclusion');
        const entry = result.assignments.find((a) => a.zoneType === 'entry');
        (0, vitest_1.expect)(regular).toMatchObject({ slotIndex: 1, zoneId: 'z1' });
        (0, vitest_1.expect)(exclusion).toMatchObject({ slotIndex: 1, zoneId: 'z2' });
        (0, vitest_1.expect)(entry).toMatchObject({ slotIndex: 1, zoneId: 'z3' });
    });
    (0, vitest_1.it)('multi-sensor: 2 zones, 2 Lite sensors, both participating → each sensor gets both zones', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'A', sensorParticipation: { s1: true, s2: true } }),
            makeZone({ id: 'z2', name: 'B', sensorParticipation: { s1: true, s2: true } }),
        ];
        const sensors = [
            makeSensor('s1', 'everything_presence_lite'),
            makeSensor('s2', 'everything_presence_lite'),
        ];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.assignments).toHaveLength(4);
        const s1Assignments = result.assignments.filter((a) => a.deviceId === 's1');
        const s2Assignments = result.assignments.filter((a) => a.deviceId === 's2');
        (0, vitest_1.expect)(s1Assignments).toHaveLength(2);
        (0, vitest_1.expect)(s2Assignments).toHaveLength(2);
    });
    (0, vitest_1.it)('partial participation: zone A → sensor 1 only, zone B → sensor 2 only', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'A', sensorParticipation: { s1: true, s2: false } }),
            makeZone({ id: 'z2', name: 'B', sensorParticipation: { s1: false, s2: true } }),
        ];
        const sensors = [
            makeSensor('s1', 'everything_presence_lite'),
            makeSensor('s2', 'everything_presence_lite'),
        ];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.assignments).toHaveLength(2);
        const s1 = result.assignments.filter((a) => a.deviceId === 's1');
        const s2 = result.assignments.filter((a) => a.deviceId === 's2');
        (0, vitest_1.expect)(s1).toHaveLength(1);
        (0, vitest_1.expect)(s1[0].zoneId).toBe('z1');
        (0, vitest_1.expect)(s2).toHaveLength(1);
        (0, vitest_1.expect)(s2[0].zoneId).toBe('z2');
    });
    (0, vitest_1.it)('EP Pro entry rejection: entry zone with Pro participation → error for Pro, ok for Lite', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Doorway', type: 'entry', sensorParticipation: { lite: true, pro: true } }),
        ];
        const sensors = [
            makeSensor('lite', 'everything_presence_lite'),
            makeSensor('pro', 'everything_presence_pro'),
        ];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        // Lite should get it
        const liteAssign = result.assignments.filter((a) => a.deviceId === 'lite');
        (0, vitest_1.expect)(liteAssign).toHaveLength(1);
        (0, vitest_1.expect)(liteAssign[0].zoneType).toBe('entry');
        // Pro should error
        const proErrors = result.errors.filter((e) => e.deviceId === 'pro');
        (0, vitest_1.expect)(proErrors).toHaveLength(1);
        (0, vitest_1.expect)(proErrors[0].reason).toContain('entry');
    });
    (0, vitest_1.it)('EP One exclusion: any zone with EP One sensor → error (0 zone support)', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Regular', type: 'regular', sensorParticipation: { one: true } }),
            makeZone({ id: 'z2', name: 'Exclusion', type: 'exclusion', sensorParticipation: { one: true } }),
        ];
        const sensors = [makeSensor('one', 'everything_presence_one')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.assignments).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(2);
        result.errors.forEach((err) => {
            (0, vitest_1.expect)(err.deviceId).toBe('one');
            (0, vitest_1.expect)(err.reason).toContain('not support');
        });
    });
    (0, vitest_1.it)('all slots full: 4 regular + 2 exclusion + 2 entry on 1 Lite → all assigned; add 1 more regular → error', () => {
        const zones = [
            ...Array.from({ length: 4 }, (_, i) => makeZone({ id: `r${i + 1}`, name: `Reg ${i + 1}`, type: 'regular', sensorParticipation: { s1: true } })),
            ...Array.from({ length: 2 }, (_, i) => makeZone({ id: `e${i + 1}`, name: `Excl ${i + 1}`, type: 'exclusion', sensorParticipation: { s1: true } })),
            ...Array.from({ length: 2 }, (_, i) => makeZone({ id: `n${i + 1}`, name: `Entry ${i + 1}`, type: 'entry', sensorParticipation: { s1: true } })),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const fullResult = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(fullResult.assignments).toHaveLength(8);
        (0, vitest_1.expect)(fullResult.errors).toHaveLength(0);
        // Add one more regular → should error
        const overZones = [
            ...zones,
            makeZone({ id: 'r5', name: 'Reg 5', type: 'regular', sensorParticipation: { s1: true } }),
        ];
        const overResult = (0, slotAllocator_1.allocateSlots)(overZones, sensors, getProfileLimits);
        (0, vitest_1.expect)(overResult.assignments).toHaveLength(8);
        (0, vitest_1.expect)(overResult.errors).toHaveLength(1);
        (0, vitest_1.expect)(overResult.errors[0].zoneId).toBe('r5');
    });
    (0, vitest_1.it)('empty zones array → empty result', () => {
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)([], sensors, getProfileLimits);
        (0, vitest_1.expect)(result.assignments).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)('sensor removal reallocation: after removing a sensor, remaining assignments are still valid', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'A', sensorParticipation: { s1: true, s2: true } }),
            makeZone({ id: 'z2', name: 'B', sensorParticipation: { s1: true, s2: true } }),
        ];
        // First allocation with 2 sensors
        const twoSensors = [
            makeSensor('s1', 'everything_presence_lite'),
            makeSensor('s2', 'everything_presence_lite'),
        ];
        const twoResult = (0, slotAllocator_1.allocateSlots)(zones, twoSensors, getProfileLimits);
        (0, vitest_1.expect)(twoResult.assignments).toHaveLength(4);
        (0, vitest_1.expect)(twoResult.errors).toHaveLength(0);
        // Remove s2 from participation
        const reducedZones = [
            makeZone({ id: 'z1', name: 'A', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z2', name: 'B', sensorParticipation: { s1: true } }),
        ];
        const oneSensor = [makeSensor('s1', 'everything_presence_lite')];
        const oneResult = (0, slotAllocator_1.allocateSlots)(reducedZones, oneSensor, getProfileLimits);
        (0, vitest_1.expect)(oneResult.assignments).toHaveLength(2);
        (0, vitest_1.expect)(oneResult.errors).toHaveLength(0);
        oneResult.assignments.forEach((a) => (0, vitest_1.expect)(a.deviceId).toBe('s1'));
    });
    (0, vitest_1.it)('stable slot assignment: same input produces same output (deterministic)', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'A', type: 'regular', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z2', name: 'B', type: 'exclusion', sensorParticipation: { s1: true } }),
            makeZone({ id: 'z3', name: 'C', type: 'entry', sensorParticipation: { s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result1 = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        const result2 = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result1).toEqual(result2);
    });
    (0, vitest_1.it)('zone with no participating sensors → no assignments, no errors', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Orphan', sensorParticipation: {} }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.assignments).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)('missing profile for sensor → error for that sensor', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Test', sensorParticipation: { s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'unknown_profile')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        (0, vitest_1.expect)(result.assignments).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toContain('profile');
    });
    (0, vitest_1.it)('sensor not in sensors array but in participation → ignored (no assignment, no error)', () => {
        const zones = [
            makeZone({ id: 'z1', name: 'Test', sensorParticipation: { ghost: true, s1: true } }),
        ];
        const sensors = [makeSensor('s1', 'everything_presence_lite')];
        const result = (0, slotAllocator_1.allocateSlots)(zones, sensors, getProfileLimits);
        // s1 should be assigned, ghost should be silently ignored
        (0, vitest_1.expect)(result.assignments).toHaveLength(1);
        (0, vitest_1.expect)(result.assignments[0].deviceId).toBe('s1');
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
});
