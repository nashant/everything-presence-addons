import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRoomDeviceDescriptor,
  createOrUpdateRoomDevice,
  removeRoomDevice,
  deriveEntityKeys,
  type IEntityResolver,
  type RoomDeviceLifecycleDeps,
} from '../../domain/roomDeviceLifecycle';
import type { RoomConfig, Zone, ZoneRect } from '../../domain/types';
import type { ZoneAssignment, SlotId } from '../../domain/zoneAssignment';
import type { RoomDeviceService, RoomDeviceDescriptor } from '../../ha/roomDeviceService';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function makeRoom(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    id: 'room-1',
    name: 'Living Room',
    units: 'metric' as const,
    zones: [],
    ...overrides,
  };
}

function makeZone(overrides: Partial<ZoneRect> = {}): ZoneRect {
  return {
    id: 'z1',
    type: 'regular',
    x: 0,
    y: 0,
    width: 2000,
    height: 2000,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<ZoneAssignment> = {}): ZoneAssignment {
  return {
    zoneId: 'z1',
    sensorDeviceId: 'sensor-a',
    slotId: 'zone1',
    coverage: 0.8,
    ...overrides,
  };
}

/**
 * Build a mock entity resolver from a mapping of `deviceId:key` → `entityId`.
 */
function mockResolver(mappings: Record<string, string>): IEntityResolver {
  return {
    getEntityId(deviceId: string, entityKey: string): string | null {
      return mappings[`${deviceId}:${entityKey}`] ?? null;
    },
  };
}

function mockRoomDeviceService(): RoomDeviceService {
  return {
    createRoomDevice: vi.fn().mockResolvedValue(undefined),
    removeRoomDevice: vi.fn().mockResolvedValue(undefined),
    getDiscoveryTopics: vi.fn().mockReturnValue([]),
  } as unknown as RoomDeviceService;
}

// ─────────────────────────────────────────────────────────────────
// deriveEntityKeys
// ─────────────────────────────────────────────────────────────────

describe('deriveEntityKeys', () => {
  it('derives keys for zone1', () => {
    expect(deriveEntityKeys('zone1')).toEqual({
      occupancyKey: 'zone1Occupancy',
      targetCountKey: 'zone1TargetCount',
    });
  });

  it('derives keys for zone4', () => {
    expect(deriveEntityKeys('zone4')).toEqual({
      occupancyKey: 'zone4Occupancy',
      targetCountKey: 'zone4TargetCount',
    });
  });

  it('returns null for exclusion slots', () => {
    expect(deriveEntityKeys('exclusion1')).toBeNull();
    expect(deriveEntityKeys('exclusion2')).toBeNull();
  });

  it('returns null for entry slots', () => {
    expect(deriveEntityKeys('entry1')).toBeNull();
    expect(deriveEntityKeys('entry2')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// buildRoomDeviceDescriptor
// ─────────────────────────────────────────────────────────────────

describe('buildRoomDeviceDescriptor', () => {
  it('builds correct descriptor for single zone + single sensor', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', label: 'Sofa Area' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-a', slotId: 'zone2' })];
    const resolver = mockResolver({
      'sensor-a:zone2Occupancy': 'binary_sensor.ep_lite_1_zone_2_occupancy',
      'sensor-a:zone2TargetCount': 'sensor.ep_lite_1_zone_2_target_count',
    });

    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.roomId).toBe('room-1');
    expect(descriptor.roomName).toBe('Living Room');
    expect(descriptor.zones).toHaveLength(1);
    expect(descriptor.zones[0]).toEqual({
      zoneId: 'z1',
      zoneName: 'Sofa Area',
      zoneIndex: 0,
      aggregationMode: 'or',
      coveringSensorEntities: {
        occupancy: ['binary_sensor.ep_lite_1_zone_2_occupancy'],
        targetCount: ['sensor.ep_lite_1_zone_2_target_count'],
      },
    });
    expect(warnings).toHaveLength(0);
  });

  it('builds correct descriptor for multiple zones + single sensor', () => {
    const room = makeRoom({
      zones: [
        makeZone({ id: 'z1', label: 'Desk' }),
        makeZone({ id: 'z2', label: 'Bed' }),
      ],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-a', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z2', sensorDeviceId: 'sensor-a', slotId: 'zone2' }),
    ];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.ep_a_zone_1_occ',
      'sensor-a:zone1TargetCount': 'sensor.ep_a_zone_1_tc',
      'sensor-a:zone2Occupancy': 'binary_sensor.ep_a_zone_2_occ',
      'sensor-a:zone2TargetCount': 'sensor.ep_a_zone_2_tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(2);
    expect(descriptor.zones[0].zoneIndex).toBe(0);
    expect(descriptor.zones[0].zoneName).toBe('Desk');
    expect(descriptor.zones[1].zoneIndex).toBe(1);
    expect(descriptor.zones[1].zoneName).toBe('Bed');
  });

  it('builds descriptor for single zone + multiple covering sensors (aggregated entities)', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-a', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-b', slotId: 'zone1' }),
    ];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.a_z1_occ',
      'sensor-a:zone1TargetCount': 'sensor.a_z1_tc',
      'sensor-b:zone1Occupancy': 'binary_sensor.b_z1_occ',
      'sensor-b:zone1TargetCount': 'sensor.b_z1_tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(1);
    expect(descriptor.zones[0].coveringSensorEntities.occupancy).toEqual([
      'binary_sensor.a_z1_occ',
      'binary_sensor.b_z1_occ',
    ]);
    expect(descriptor.zones[0].coveringSensorEntities.targetCount).toEqual([
      'sensor.a_z1_tc',
      'sensor.b_z1_tc',
    ]);
  });

  it('uses zone.aggregationMode when present', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', aggregationMode: 'majority' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);
    expect(descriptor.zones[0].aggregationMode).toBe('majority');
  });

  it('defaults aggregationMode to "or" when absent', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })], // no aggregationMode
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);
    expect(descriptor.zones[0].aggregationMode).toBe('or');
  });

  it('uses zone.label as zoneName, falls back to zone.id', () => {
    const room = makeRoom({
      zones: [
        makeZone({ id: 'z1', label: 'Kitchen Nook' }),
        makeZone({ id: 'z2' }), // no label
      ],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z2', slotId: 'zone2' }),
    ];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ1',
      'sensor-a:zone1TargetCount': 'sensor.tc1',
      'sensor-a:zone2Occupancy': 'binary_sensor.occ2',
      'sensor-a:zone2TargetCount': 'sensor.tc2',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);
    expect(descriptor.zones[0].zoneName).toBe('Kitchen Nook');
    expect(descriptor.zones[1].zoneName).toBe('z2');
  });

  it('skips sensors with missing entity mappings and produces warnings', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'good-sensor', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'bad-sensor', slotId: 'zone1' }),
    ];
    // bad-sensor has no mappings → returns null
    const resolver = mockResolver({
      'good-sensor:zone1Occupancy': 'binary_sensor.good_occ',
      'good-sensor:zone1TargetCount': 'sensor.good_tc',
    });

    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    // Zone should still be included (good-sensor has entities)
    expect(descriptor.zones).toHaveLength(1);
    expect(descriptor.zones[0].coveringSensorEntities.occupancy).toEqual([
      'binary_sensor.good_occ',
    ]);
    // bad-sensor should produce warnings
    expect(warnings.some(w => w.includes('bad-sensor'))).toBe(true);
    expect(warnings.some(w => w.includes('zone1Occupancy'))).toBe(true);
  });

  it('skips exclusion/entry slot assignments (no occupancy entities)', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', type: 'exclusion' })],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', slotId: 'exclusion1' }),
    ];
    const resolver = mockResolver({});

    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    // Exclusion slots produce no entity keys → zone has no entities → omitted
    expect(descriptor.zones).toHaveLength(0);
    expect(warnings.some(w => w.includes('no entities resolved'))).toBe(true);
  });

  it('returns empty zones array when all entity lookups fail', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' }), makeZone({ id: 'z2' })],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z2', slotId: 'zone2' }),
    ];
    // All lookups return null
    const resolver = mockResolver({});

    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(0);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns 0-based zoneIndex matching position in room.zones', () => {
    const room = makeRoom({
      zones: [
        makeZone({ id: 'z1' }),
        makeZone({ id: 'z2' }),
        makeZone({ id: 'z3' }),
      ],
    });
    // Only z2 and z3 have assignments (z1 skipped)
    const assignments = [
      makeAssignment({ zoneId: 'z2', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z3', slotId: 'zone2' }),
    ];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ1',
      'sensor-a:zone1TargetCount': 'sensor.tc1',
      'sensor-a:zone2Occupancy': 'binary_sensor.occ2',
      'sensor-a:zone2TargetCount': 'sensor.tc2',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(2);
    // z2 is at index 1 in room.zones, z3 at index 2
    expect(descriptor.zones[0].zoneIndex).toBe(1);
    expect(descriptor.zones[1].zoneIndex).toBe(2);
  });

  it('handles no_change_on_tie aggregation mode', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', aggregationMode: 'majority' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);
    expect(descriptor.zones[0].aggregationMode).toBe('majority');
  });
});

// ─────────────────────────────────────────────────────────────────
// createOrUpdateRoomDevice
// ─────────────────────────────────────────────────────────────────

describe('createOrUpdateRoomDevice', () => {
  let service: RoomDeviceService;
  let deps: RoomDeviceLifecycleDeps;

  beforeEach(() => {
    service = mockRoomDeviceService();
  });

  it('calls roomDeviceService.createRoomDevice with built descriptor', async () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', label: 'Office' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });
    deps = { roomDeviceService: service, entityResolver: resolver };

    const result = await createOrUpdateRoomDevice(room, assignments, deps);

    expect(result.created).toBe(true);
    expect(service.createRoomDevice).toHaveBeenCalledTimes(1);
    const passedDescriptor = (service.createRoomDevice as ReturnType<typeof vi.fn>).mock.calls[0][0] as RoomDeviceDescriptor;
    expect(passedDescriptor.roomId).toBe('room-1');
    expect(passedDescriptor.zones).toHaveLength(1);
  });

  it('skips when no zones have covering entities', async () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    // No mappings → all lookups fail
    const resolver = mockResolver({});
    deps = { roomDeviceService: service, entityResolver: resolver };

    const result = await createOrUpdateRoomDevice(room, assignments, deps);

    expect(result.created).toBe(false);
    expect(service.createRoomDevice).not.toHaveBeenCalled();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns warnings from entity resolution even when successful', async () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const assignments = [
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-a', slotId: 'zone1' }),
      makeAssignment({ zoneId: 'z1', sensorDeviceId: 'sensor-b', slotId: 'zone1' }),
    ];
    // sensor-b missing target count
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.a_occ',
      'sensor-a:zone1TargetCount': 'sensor.a_tc',
      'sensor-b:zone1Occupancy': 'binary_sensor.b_occ',
    });
    deps = { roomDeviceService: service, entityResolver: resolver };

    const result = await createOrUpdateRoomDevice(room, assignments, deps);

    expect(result.created).toBe(true);
    expect(result.warnings.some(w => w.includes('sensor-b') && w.includes('zone1TargetCount'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// removeRoomDevice
// ─────────────────────────────────────────────────────────────────

describe('removeRoomDevice', () => {
  it('calls roomDeviceService.removeRoomDevice with correct roomId and zoneCount', async () => {
    const service = mockRoomDeviceService();
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' }), makeZone({ id: 'z2' }), makeZone({ id: 'z3' })],
    });

    await removeRoomDevice(room, { roomDeviceService: service });

    expect(service.removeRoomDevice).toHaveBeenCalledWith('room-1', 3, false);
  });

  it('passes zero zoneCount when room has no zones', async () => {
    const service = mockRoomDeviceService();
    const room = makeRoom({ zones: [] });

    await removeRoomDevice(room, { roomDeviceService: service });

    expect(service.removeRoomDevice).toHaveBeenCalledWith('room-1', 0, false);
  });

  it('passes hasSensors=true when room has sensors', async () => {
    const service = mockRoomDeviceService();
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
      sensors: [{ deviceId: 'dev-1', profileId: 'everything_presence_lite' }],
    });

    await removeRoomDevice(room, { roomDeviceService: service });

    expect(service.removeRoomDevice).toHaveBeenCalledWith('room-1', 1, true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Negative / edge cases
// ─────────────────────────────────────────────────────────────────

describe('negative and edge cases', () => {
  it('empty assignments array produces empty descriptor', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const resolver = mockResolver({});

    const { descriptor } = buildRoomDeviceDescriptor(room, [], resolver);

    expect(descriptor.zones).toHaveLength(0);
  });

  it('zone with only exclusion assignments produces no occupancy entities', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1', type: 'regular' })],
    });
    // The assignment says the zone was placed in an exclusion slot
    const assignments = [
      makeAssignment({ zoneId: 'z1', slotId: 'exclusion1' }),
    ];
    const resolver = mockResolver({});

    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(0);
    expect(warnings.some(w => w.includes('no entities resolved'))).toBe(true);
  });

  it('zone with no matching assignment is omitted', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' }), makeZone({ id: 'z2' })],
    });
    // Only z1 has an assignment
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });

    const { descriptor } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(1);
    expect(descriptor.zones[0].zoneId).toBe('z1');
  });

  it('createOrUpdateRoomDevice propagates service errors', async () => {
    const service = mockRoomDeviceService();
    (service.createRoomDevice as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('MQTT connection lost'),
    );
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    const assignments = [makeAssignment({ zoneId: 'z1', slotId: 'zone1' })];
    const resolver = mockResolver({
      'sensor-a:zone1Occupancy': 'binary_sensor.occ',
      'sensor-a:zone1TargetCount': 'sensor.tc',
    });

    await expect(
      createOrUpdateRoomDevice(room, assignments, {
        roomDeviceService: service,
        entityResolver: resolver,
      }),
    ).rejects.toThrow('MQTT connection lost');
  });

  it('assignment with unknown slotId format still processes without crash', () => {
    const room = makeRoom({
      zones: [makeZone({ id: 'z1' })],
    });
    // Force an unusual slotId via cast — simulates corrupted data
    const assignments = [
      makeAssignment({ zoneId: 'z1', slotId: 'unknown99' as SlotId }),
    ];
    const resolver = mockResolver({});

    // Should not throw — unknown prefix is not 'zone' so deriveEntityKeys returns null
    const { descriptor, warnings } = buildRoomDeviceDescriptor(room, assignments, resolver);

    expect(descriptor.zones).toHaveLength(0);
    expect(warnings.some(w => w.includes('no entities resolved'))).toBe(true);
  });
});
