import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoomConfig, Zone, ZoneRect, ZonePolygon, ZoneEntitySet, SensorAttachment } from '../../domain/types';
import type { IHaWriteClient } from '../../ha/writeClient';
import type { DeviceMapping } from '../../config/deviceMappingStorage';
import type { DeviceProfile } from '../../domain/deviceProfiles';
import type {
  IDeviceEntityService,
  IDeviceMappingStorage,
  IProfileLoader,
} from '../../domain/roomZoneOrchestrator';

// ─────────────────────────────────────────────────────────────────
// Module mock: replace the deviceEntityService singleton
// ─────────────────────────────────────────────────────────────────

const mockGetZoneEntitySet = vi.fn<(deviceId: string, slotType: 'regular' | 'exclusion' | 'entry', slotIndex: number) => ZoneEntitySet | null>();
const mockGetPolygonZoneEntity = vi.fn<(deviceId: string, slotType: 'polygon' | 'polygonExclusion' | 'polygonEntry', slotIndex: number) => string | null>();

vi.mock('../../domain/deviceEntityService', () => ({
  deviceEntityService: {
    getZoneEntitySet: (...args: any[]) => mockGetZoneEntitySet(...(args as [string, 'regular' | 'exclusion' | 'entry', number])),
    getPolygonZoneEntity: (...args: any[]) => mockGetPolygonZoneEntity(...(args as [string, 'polygon' | 'polygonExclusion' | 'polygonEntry', number])),
  },
}));

// Import AFTER mock is established
import {
  ZoneWriter,
  type TranslatedZoneAssignment,
  type TranslatedZoneWriteConfig,
} from '../../ha/zoneWriter';
import { RoomZoneOrchestrator } from '../../domain/roomZoneOrchestrator';

// ─────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────

function makeWriteClient(): IHaWriteClient {
  return {
    callService: vi.fn().mockResolvedValue(undefined),
    setNumberEntity: vi.fn().mockResolvedValue(undefined),
    setSelectEntity: vi.fn().mockResolvedValue(undefined),
    setSwitchEntity: vi.fn().mockResolvedValue(undefined),
    setInputBooleanEntity: vi.fn().mockResolvedValue(undefined),
    setTextEntity: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Configure the mock entity service to resolve zone entities
 * via a predictable naming pattern: `number.{deviceId}_{type}{index}_{coord}`
 */
function setupDefaultEntityMocks() {
  mockGetZoneEntitySet.mockImplementation(
    (deviceId: string, zoneType: 'regular' | 'exclusion' | 'entry', zoneIndex: number): ZoneEntitySet | null => {
      const prefix = zoneType === 'regular' ? 'zone' : zoneType;
      return {
        beginX: `number.${deviceId}_${prefix}${zoneIndex}_begin_x`,
        endX: `number.${deviceId}_${prefix}${zoneIndex}_end_x`,
        beginY: `number.${deviceId}_${prefix}${zoneIndex}_begin_y`,
        endY: `number.${deviceId}_${prefix}${zoneIndex}_end_y`,
      };
    },
  );
  mockGetPolygonZoneEntity.mockImplementation(
    (deviceId: string, zoneType: 'polygon' | 'polygonExclusion' | 'polygonEntry', zoneIndex: number): string | null => {
      return `text.${deviceId}_${zoneType}${zoneIndex}`;
    },
  );
}

/** EP Lite profile with zone limits. */
function makeLiteProfile(): DeviceProfile {
  return {
    id: 'everything_presence_lite',
    label: 'EP Lite',
    manufacturer: 'Everything Smart Technology',
    capabilities: {},
    limits: {
      maxZones: 4,
      maxExclusionZones: 2,
      maxEntryZones: 2,
      maxTargets: 3,
      maxRangeMeters: 6,
      fieldOfViewDegrees: 120,
    },
    entityMap: {},
  };
}

/** EP One profile with all-zero caps. */
function makeOneProfile(): DeviceProfile {
  return {
    id: 'everything_presence_one',
    label: 'EP One',
    manufacturer: 'Everything Smart Technology',
    capabilities: {},
    limits: {
      maxZones: 0,
      maxExclusionZones: 0,
      maxEntryZones: 0,
      maxTargets: 0,
      maxRangeMeters: 25,
      fieldOfViewDegrees: 120,
    },
    entityMap: {},
  };
}

function makeMapping(deviceId: string, profileId: string): DeviceMapping {
  return {
    deviceId,
    profileId,
    deviceName: `Test ${deviceId}`,
    discoveredAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    confirmedByUser: false,
    autoMatchedCount: 0,
    manuallyMappedCount: 0,
    mappings: {},
    unmappedEntities: [],
  };
}

function makeRect(id: string, type: Zone['type'] = 'regular', x = 1000, y = 1000, w = 500, h = 500): ZoneRect {
  return { id, type, x, y, width: w, height: h };
}

function makePolygon(id: string, type: Zone['type'] = 'regular'): ZonePolygon {
  return {
    id,
    type,
    vertices: [
      { x: 500, y: 500 },
      { x: 1500, y: 500 },
      { x: 1500, y: 1500 },
      { x: 500, y: 1500 },
    ],
  };
}

function makeSensor(deviceId: string, x = 0, y = 0, rotationDeg = 0): SensorAttachment {
  return {
    deviceId,
    placement: { x, y, rotationDeg },
  };
}

// ─────────────────────────────────────────────────────────────────
// applyTranslatedZones (ZoneWriter)
// ─────────────────────────────────────────────────────────────────

describe('ZoneWriter.applyTranslatedZones', () => {
  let writeClient: IHaWriteClient;

  beforeEach(() => {
    writeClient = makeWriteClient();
    mockGetZoneEntitySet.mockReset();
    mockGetPolygonZoneEntity.mockReset();
    setupDefaultEntityMocks();
  });

  it('writes rect zone beginX/endX/beginY/endY directly (no x+width conversion)', async () => {
    const writer = new ZoneWriter(writeClient);
    const assignments: TranslatedZoneAssignment[] = [
      {
        zone: { id: 'Zone 1', type: 'regular', beginX: 100, endX: 600, beginY: 200, endY: 700 },
        slotIndex: 1,
        slotType: 'regular',
      },
    ];
    const config: TranslatedZoneWriteConfig = { maxRegularSlots: 4, maxExclusionSlots: 2, maxEntrySlots: 2 };

    const result = await writer.applyTranslatedZones('device-a', assignments, config);

    expect(result.ok).toBe(true);
    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const calls = setNumber.mock.calls;
    const beginXCall = calls.find((c: any[]) => c[0].includes('zone1_begin_x'));
    const endXCall = calls.find((c: any[]) => c[0].includes('zone1_end_x'));
    const beginYCall = calls.find((c: any[]) => c[0].includes('zone1_begin_y'));
    const endYCall = calls.find((c: any[]) => c[0].includes('zone1_end_y'));

    expect(beginXCall).toBeDefined();
    expect(beginXCall![1]).toBe(100);
    expect(endXCall![1]).toBe(600);
    expect(beginYCall![1]).toBe(200);
    expect(endYCall![1]).toBe(700);
  });

  it('writes polygon zone via polygonToText()', async () => {
    const writer = new ZoneWriter(writeClient);
    const assignments: TranslatedZoneAssignment[] = [
      {
        zone: {
          id: 'Zone 1',
          type: 'regular',
          vertices: [
            { x: 100, y: 200 },
            { x: 300, y: 200 },
            { x: 300, y: 400 },
          ],
        },
        slotIndex: 1,
        slotType: 'regular',
      },
    ];
    const config: TranslatedZoneWriteConfig = { maxRegularSlots: 4, maxExclusionSlots: 2, maxEntrySlots: 2 };

    const result = await writer.applyTranslatedZones('device-a', assignments, config);

    expect(result.ok).toBe(true);
    const setText = writeClient.setTextEntity as ReturnType<typeof vi.fn>;
    const polyCall = setText.mock.calls.find((c: any[]) => c[0].includes('polygon1'));
    expect(polyCall).toBeDefined();
    expect(polyCall![1]).toBe('100:200;300:200;300:400');
  });

  it('clears unused slots to 0 / empty string', async () => {
    const writer = new ZoneWriter(writeClient);
    const assignments: TranslatedZoneAssignment[] = [
      {
        zone: { id: 'Zone 1', type: 'regular', beginX: 10, endX: 20, beginY: 30, endY: 40 },
        slotIndex: 1,
        slotType: 'regular',
      },
    ];
    const config: TranslatedZoneWriteConfig = { maxRegularSlots: 2, maxExclusionSlots: 1, maxEntrySlots: 1 };

    await writer.applyTranslatedZones('device-a', assignments, config);

    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const setText = writeClient.setTextEntity as ReturnType<typeof vi.fn>;

    // Slot 2 regular should be cleared to 0
    const clearBeginX = setNumber.mock.calls.find((c: any[]) => c[0].includes('zone2_begin_x') && c[1] === 0);
    expect(clearBeginX).toBeDefined();

    // Slot 1 exclusion should be cleared to 0
    const clearExcl = setNumber.mock.calls.find((c: any[]) => c[0].includes('exclusion1_begin_x') && c[1] === 0);
    expect(clearExcl).toBeDefined();

    // Polygon entities should be cleared to ''
    const clearPoly = setText.mock.calls.find((c: any[]) => c[0].includes('polygon2') && c[1] === '');
    expect(clearPoly).toBeDefined();
  });

  it('skips zone when entity resolution returns null (no crash)', async () => {
    mockGetZoneEntitySet.mockReturnValue(null);
    mockGetPolygonZoneEntity.mockReturnValue(null);

    const writer = new ZoneWriter(writeClient);
    const assignments: TranslatedZoneAssignment[] = [
      {
        zone: { id: 'Zone 1', type: 'regular', beginX: 10, endX: 20, beginY: 30, endY: 40 },
        slotIndex: 1,
        slotType: 'regular',
      },
    ];
    const config: TranslatedZoneWriteConfig = { maxRegularSlots: 0, maxExclusionSlots: 0, maxEntrySlots: 0 };

    const result = await writer.applyTranslatedZones('device-a', assignments, config);

    expect(result.ok).toBe(true);
    expect((writeClient.setNumberEntity as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('rounds coordinate values to integers', async () => {
    const writer = new ZoneWriter(writeClient);
    const assignments: TranslatedZoneAssignment[] = [
      {
        zone: { id: 'Zone 1', type: 'regular', beginX: 100.7, endX: 600.3, beginY: 200.5, endY: 700.9 },
        slotIndex: 1,
        slotType: 'regular',
      },
    ];
    const config: TranslatedZoneWriteConfig = { maxRegularSlots: 1, maxExclusionSlots: 0, maxEntrySlots: 0 };

    await writer.applyTranslatedZones('device-a', assignments, config);

    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const beginXCall = setNumber.mock.calls.find((c: any[]) => c[0].includes('zone1_begin_x'));
    expect(beginXCall![1]).toBe(101);
    const endXCall = setNumber.mock.calls.find((c: any[]) => c[0].includes('zone1_end_x'));
    expect(endXCall![1]).toBe(600);
  });
});

// ─────────────────────────────────────────────────────────────────
// RoomZoneOrchestrator
// ─────────────────────────────────────────────────────────────────

describe('RoomZoneOrchestrator', () => {
  let writeClient: IHaWriteClient;
  let entityService: IDeviceEntityService;
  let mappingStorage: IDeviceMappingStorage;
  let profileLoader: IProfileLoader;

  beforeEach(() => {
    writeClient = makeWriteClient();
    mockGetZoneEntitySet.mockReset();
    mockGetPolygonZoneEntity.mockReset();
    setupDefaultEntityMocks();

    entityService = {
      getZoneEntitySet: mockGetZoneEntitySet as any,
      getPolygonZoneEntity: mockGetPolygonZoneEntity as any,
    };
    mappingStorage = {
      getMapping: vi.fn().mockReturnValue(null),
    };
    profileLoader = {
      getProfileById: vi.fn().mockReturnValue(undefined),
    };
  });

  function makeOrchestrator() {
    return new RoomZoneOrchestrator({
      writeClient,
      deviceEntityService: entityService,
      deviceMappingStorage: mappingStorage,
      profileLoader,
    });
  }

  function makeRoom(overrides: Partial<RoomConfig> = {}): RoomConfig {
    return {
      id: 'room-1',
      name: 'Test Room',
      units: 'metric',
      zones: [],
      sensors: [],
      ...overrides,
    };
  }

  // --- Empty room / sensor cases ---

  it('room with no zones → empty result, no writes', async () => {
    const orch = makeOrchestrator();
    const result = await orch.applyRoomZones(makeRoom({ zones: [], sensors: [makeSensor('d1')] }));

    expect(result.results).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect((writeClient.setNumberEntity as any).mock.calls.length).toBe(0);
  });

  it('room with no sensors → all zones unassigned', async () => {
    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1'), makeRect('Zone 2')];
    const result = await orch.applyRoomZones(makeRoom({ zones, sensors: [] }));

    expect(result.results).toEqual([]);
    expect(result.unassigned).toHaveLength(2);
    expect(result.unassigned[0].reason).toBe('No sensors available');
    expect(result.warnings).toEqual([]);
  });

  // --- Sensor with no mapping ---

  it('sensor without mapping → warning, not crash', async () => {
    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1')];
    const sensors = [makeSensor('unmapped-device')];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    expect(result.warnings.some(w => w.includes('unmapped-device') && w.includes('no device mapping'))).toBe(true);
    expect(result.unassigned).toHaveLength(1);
  });

  // --- EP One excluded ---

  it('EP One sensor (all-zero caps) excluded from assignment', async () => {
    (mappingStorage.getMapping as any).mockImplementation((id: string) => {
      if (id === 'one-1') return makeMapping('one-1', 'everything_presence_one');
      return null;
    });
    (profileLoader.getProfileById as any).mockImplementation((id: string) => {
      if (id === 'everything_presence_one') return makeOneProfile();
      return undefined;
    });

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 1000, 1000, 500, 500)];
    const sensors = [makeSensor('one-1')];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    // EP One gets resolved but has 0 caps — zone goes unassigned
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0].zoneId).toBe('Zone 1');
  });

  // --- 2 sensors covering 3 zones ---

  it('2 sensors covering 3 zones → correct slot assignments per device', async () => {
    const liteSensors = [
      makeSensor('lite-1', 0, 0, 0),
      makeSensor('lite-2', 3000, 0, 0),
    ];

    (mappingStorage.getMapping as any).mockImplementation((id: string) => {
      if (id === 'lite-1') return makeMapping('lite-1', 'everything_presence_lite');
      if (id === 'lite-2') return makeMapping('lite-2', 'everything_presence_lite');
      return null;
    });
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones: Zone[] = [
      makeRect('Zone 1', 'regular', 500, 2000, 500, 500),   // Near sensor 1
      makeRect('Zone 2', 'regular', 2500, 2000, 500, 500),  // Near sensor 2
      makeRect('Zone 3', 'regular', 1500, 2000, 500, 500),  // Between both
    ];
    const room = makeRoom({ zones, sensors: liteSensors });

    const result = await orch.applyRoomZones(room);

    // Should have assignments for both devices
    expect(result.results.length).toBeGreaterThanOrEqual(1);

    // At least some zones should be assigned
    const totalAssigned = result.results.reduce((sum, r) => sum + r.assignedZoneIds.length, 0);
    expect(totalAssigned).toBeGreaterThanOrEqual(2);

    // All writes should succeed
    for (const r of result.results) {
      expect(r.writeResult.ok).toBe(true);
    }
  });

  // --- Zone below coverage threshold ---

  it('zone below coverage threshold → appears in unassigned', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 50000, 50000, 500, 500)];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0].zoneId).toBe('Zone 1');
  });

  // --- Polygon zone transforms + writes ---

  it('polygon zone transforms and writes correctly', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones: Zone[] = [makePolygon('Zone 1', 'regular')];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    const setText = writeClient.setTextEntity as ReturnType<typeof vi.fn>;
    const polyCalls = setText.mock.calls.filter((c: any[]) => c[0].includes('polygon'));
    // At least one polygon write
    expect(polyCalls.length).toBeGreaterThanOrEqual(1);
    // The written text should be in x:y;x:y format
    const writtenText = polyCalls.find((c: any[]) => c[1] !== '');
    if (writtenText) {
      expect(writtenText[1]).toMatch(/^-?\d+:-?\d+(;-?\d+:-?\d+)*$/);
    }
  });

  // --- Mixed rect + polygon zones ---

  it('mixed rect + polygon zones both get assigned and written', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones: Zone[] = [
      makeRect('Zone 1', 'regular', 1000, 2000, 500, 500),
      makePolygon('Zone 2', 'regular'),
    ];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    const totalAssigned = result.results.reduce((sum, r) => sum + r.assignedZoneIds.length, 0);
    expect(totalAssigned).toBe(2);

    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const setText = writeClient.setTextEntity as ReturnType<typeof vi.fn>;
    expect(setNumber.mock.calls.length).toBeGreaterThan(0);
    expect(setText.mock.calls.length).toBeGreaterThan(0);
  });

  // --- Coordinates are device-space (transformed) not room-space ---

  it('coordinates written are device-space (transformed), not room-space', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    // Zone at center (1000, 2000) with 500x500
    // Sensor at (1000, 0) with 0° rotation (forward = +Y)
    const zones = [makeRect('Zone 1', 'regular', 1000, 2000, 500, 500)];
    const sensors = [makeSensor('lite-1', 1000, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    expect(result.results).toHaveLength(1);
    expect(result.results[0].writeResult.ok).toBe(true);

    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const zone1Calls = setNumber.mock.calls.filter((c: any[]) => c[0].includes('zone1'));

    const beginXCall = zone1Calls.find((c: any[]) => c[0].includes('begin_x'));
    const endXCall = zone1Calls.find((c: any[]) => c[0].includes('end_x'));
    const beginYCall = zone1Calls.find((c: any[]) => c[0].includes('begin_y'));
    const endYCall = zone1Calls.find((c: any[]) => c[0].includes('end_y'));

    expect(beginXCall).toBeDefined();
    expect(endXCall).toBeDefined();
    expect(beginYCall).toBeDefined();
    expect(endYCall).toBeDefined();

    // Room-space rect: center (1000,2000), half-width 250 → corners 750..1250 x 1750..2250
    // Sensor at (1000,0), rotation 0° → effective angle 90°
    // cos(-90°)=0, sin(-90°)=-1
    // Point (750, 1750): dx=-250, dy=1750 → device x=1750, y=250
    // Point (1250, 2250): dx=250, dy=2250 → device x=2250, y=-250
    // AABB: beginX=1750, endX=2250, beginY=-250, endY=250
    expect(beginXCall![1]).toBeCloseTo(1750, -1);
    expect(endXCall![1]).toBeCloseTo(2250, -1);
    expect(beginYCall![1]).toBeCloseTo(-250, -1);
    expect(endYCall![1]).toBeCloseTo(250, -1);
  });

  // --- Exclusion and entry zones ---

  it('exclusion and entry zones assign to correct slot types', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones: Zone[] = [
      makeRect('Zone 1', 'regular', 1000, 2000, 500, 500),
      makeRect('Exclusion 1', 'exclusion', 1000, 2000, 300, 300),
      makeRect('Entry 1', 'entry', 1000, 2000, 400, 400),
    ];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const calls = setNumber.mock.calls.map((c: any[]) => c[0]);

    expect(calls.some((c: string) => c.includes('_zone1_'))).toBe(true);
    expect(calls.some((c: string) => c.includes('_exclusion1_'))).toBe(true);
    expect(calls.some((c: string) => c.includes('_entry1_'))).toBe(true);
  });

  // --- One sensor without mapping, others proceed ---

  it('one sensor without mapping produces warning, others proceed', async () => {
    (mappingStorage.getMapping as any).mockImplementation((id: string) => {
      if (id === 'lite-1') return makeMapping('lite-1', 'everything_presence_lite');
      return null;
    });
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 1000, 2000, 500, 500)];
    const sensors = [makeSensor('lite-1', 0, 0, 0), makeSensor('unmapped-1', 3000, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    expect(result.warnings.some(w => w.includes('unmapped-1'))).toBe(true);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  // --- Write failure handling ---

  it('write failure captured in result, does not throw', async () => {
    // Use a minimal profile (1 zone slot, 0 exclusion/entry) to keep retry-backoff
    // time low — the full EP Lite profile (4+2+2 slots) causes 39 retried writes
    // that exceed the default 5s test timeout.
    const minimalProfile: DeviceProfile = {
      ...makeLiteProfile(),
      limits: { maxZones: 1, maxExclusionZones: 0, maxEntryZones: 0, maxTargets: 0, maxRangeMeters: 6, fieldOfViewDegrees: 120 },
    };
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(minimalProfile);
    (writeClient.setNumberEntity as any).mockRejectedValue(new Error('HA unavailable'));

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 1000, 2000, 500, 500)];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    expect(result.results).toHaveLength(1);
    expect(result.results[0].writeResult.ok).toBe(false);
    expect(result.results[0].writeResult.failures.length).toBeGreaterThan(0);
    expect(result.results[0].writeResult.failures[0].error).toContain('HA unavailable');
  });

  // --- EP One + EP Lite mix ---

  it('EP One + EP Lite: zones only assigned to Lite, One excluded', async () => {
    (mappingStorage.getMapping as any).mockImplementation((id: string) => {
      if (id === 'lite-1') return makeMapping('lite-1', 'everything_presence_lite');
      if (id === 'one-1') return makeMapping('one-1', 'everything_presence_one');
      return null;
    });
    (profileLoader.getProfileById as any).mockImplementation((id: string) => {
      if (id === 'everything_presence_lite') return makeLiteProfile();
      if (id === 'everything_presence_one') return makeOneProfile();
      return undefined;
    });

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 1000, 2000, 500, 500)];
    const sensors = [makeSensor('lite-1', 0, 0, 0), makeSensor('one-1', 3000, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    const liteResult = result.results.find(r => r.deviceId === 'lite-1');
    expect(liteResult).toBeDefined();
    expect(liteResult!.assignedZoneIds).toContain('Zone 1');

    // EP One should NOT have zone assignments
    const oneResult = result.results.find(r => r.deviceId === 'one-1');
    if (oneResult) {
      expect(oneResult.assignedZoneIds).toEqual([]);
    }
  });

  // --- Sensor with no assignments gets slots cleared ---

  it('sensor with no assigned zones gets all slots cleared', async () => {
    (mappingStorage.getMapping as any).mockImplementation((id: string) => {
      if (id === 'lite-1') return makeMapping('lite-1', 'everything_presence_lite');
      if (id === 'lite-2') return makeMapping('lite-2', 'everything_presence_lite');
      return null;
    });
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1', 'regular', 1000, 2000, 500, 500)];
    const sensors = [makeSensor('lite-1', 0, 0, 0), makeSensor('lite-2', 50000, 50000, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    const lite2Result = result.results.find(r => r.deviceId === 'lite-2');
    expect(lite2Result).toBeDefined();
    expect(lite2Result!.assignedZoneIds).toEqual([]);
    const setNumber = writeClient.setNumberEntity as ReturnType<typeof vi.fn>;
    const lite2Writes = setNumber.mock.calls.filter((c: any[]) => c[0].includes('lite-2'));
    expect(lite2Writes.length).toBeGreaterThan(0);
  });

  // --- Slot capacity overflow ---

  it('device at full slot capacity → overflow warning per zoneAssignment behavior', async () => {
    // Create a profile with only 1 regular slot to force overflow
    const tinyProfile: DeviceProfile = {
      ...makeLiteProfile(),
      limits: {
        maxZones: 1,
        maxExclusionZones: 0,
        maxEntryZones: 0,
        maxTargets: 0,
        maxRangeMeters: 6,
        fieldOfViewDegrees: 120,
      },
    };
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(tinyProfile);

    const orch = makeOrchestrator();
    // Two zones near the sensor — both should have coverage, but only 1 slot
    const zones: Zone[] = [
      makeRect('Zone 1', 'regular', 1000, 2000, 500, 500),
      makeRect('Zone 2', 'regular', 1000, 3000, 500, 500),
    ];
    const sensors = [makeSensor('lite-1', 0, 0, 0)];

    const result = await orch.applyRoomZones(makeRoom({ zones, sensors }));

    // One zone should be assigned, the other unassigned due to pool full
    const totalAssigned = result.results.reduce((sum, r) => sum + r.assignedZoneIds.length, 0);
    expect(totalAssigned).toBe(1);
    expect(result.unassigned.length + result.warnings.filter(w => w.includes('pool full')).length).toBeGreaterThanOrEqual(1);
  });

  // --- Empty zones array ---

  it('empty zones array → empty result, no writes (negative test)', async () => {
    (mappingStorage.getMapping as any).mockReturnValue(makeMapping('lite-1', 'everything_presence_lite'));
    (profileLoader.getProfileById as any).mockReturnValue(makeLiteProfile());

    const orch = makeOrchestrator();
    const result = await orch.applyRoomZones(makeRoom({ zones: [], sensors: [makeSensor('lite-1')] }));

    expect(result.results).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect((writeClient.setNumberEntity as any).mock.calls.length).toBe(0);
  });

  // --- Empty sensors array ---

  it('empty sensors array → empty result with all zones unassigned (negative test)', async () => {
    const orch = makeOrchestrator();
    const zones = [makeRect('Zone 1'), makeRect('Zone 2'), makeRect('Zone 3')];
    const result = await orch.applyRoomZones(makeRoom({ zones, sensors: [] }));

    expect(result.results).toEqual([]);
    expect(result.unassigned).toHaveLength(3);
    expect((writeClient.setNumberEntity as any).mock.calls.length).toBe(0);
  });
});
