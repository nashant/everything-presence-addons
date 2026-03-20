"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const migrationService_1 = require("../../domain/migrationService");
const storage_1 = require("../../config/storage");
const mockReadTransport_1 = require("../helpers/mockReadTransport");
const tempStorage_1 = require("../helpers/tempStorage");
// ── Helpers ──────────────────────────────────────────────────────
/** Build a minimal RoomConfig with overrides. */
function makeRoom(overrides = {}) {
    return {
        id: 'room-1',
        name: 'Test Room',
        units: 'metric',
        zones: [],
        ...overrides,
    };
}
/** Build a minimal ZoneRect. */
function makeZone(overrides = {}) {
    return {
        id: 'zone-1',
        type: 'regular',
        x: 0,
        y: 0,
        width: 100,
        height: 200,
        ...overrides,
    };
}
/** Assert a zone's geometry is close (handles floating-point imprecision). */
function expectZoneClose(actual, expected, precision = 5) {
    (0, vitest_1.expect)(actual.x).toBeCloseTo(expected.x, precision);
    (0, vitest_1.expect)(actual.y).toBeCloseTo(expected.y, precision);
    (0, vitest_1.expect)(actual.width).toBeCloseTo(expected.width, precision);
    (0, vitest_1.expect)(actual.height).toBeCloseTo(expected.height, precision);
}
// ── needsMigration ───────────────────────────────────────────────
(0, vitest_1.describe)('needsMigration', () => {
    (0, vitest_1.it)('returns true when entityMappings is present', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 5,
                manuallyMappedCount: 0,
                presenceEntity: 'binary_sensor.ep_presence',
            },
        });
        (0, vitest_1.expect)(migrationService_1.migrationService.needsMigration(room)).toBe(true);
    });
    (0, vitest_1.it)('returns true when entityNamePrefix is present', () => {
        const room = makeRoom({ entityNamePrefix: 'ep_lite_abc123' });
        (0, vitest_1.expect)(migrationService_1.migrationService.needsMigration(room)).toBe(true);
    });
    (0, vitest_1.it)('returns true when both entityMappings and entityNamePrefix are present', () => {
        const room = makeRoom({
            entityNamePrefix: 'ep_lite_abc123',
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 1,
                manuallyMappedCount: 0,
            },
        });
        (0, vitest_1.expect)(migrationService_1.migrationService.needsMigration(room)).toBe(true);
    });
    (0, vitest_1.it)('returns false when neither entityMappings nor entityNamePrefix is present', () => {
        const room = makeRoom();
        (0, vitest_1.expect)(migrationService_1.migrationService.needsMigration(room)).toBe(false);
    });
});
// ── convertRoomMappings ──────────────────────────────────────────
(0, vitest_1.describe)('convertRoomMappings', () => {
    (0, vitest_1.it)('returns empty object when no entityMappings', () => {
        const room = makeRoom();
        (0, vitest_1.expect)(migrationService_1.migrationService.convertRoomMappings(room)).toEqual({});
    });
    (0, vitest_1.it)('returns empty object when entityMappings has no entity fields', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
            },
        });
        (0, vitest_1.expect)(migrationService_1.migrationService.convertRoomMappings(room)).toEqual({});
    });
    (0, vitest_1.it)('maps core entities correctly', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 3,
                manuallyMappedCount: 0,
                presenceEntity: 'binary_sensor.ep_presence',
                mmwaveEntity: 'binary_sensor.ep_mmwave',
                temperatureEntity: 'sensor.ep_temperature',
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['presence']).toBe('binary_sensor.ep_presence');
        (0, vitest_1.expect)(result['mmwave']).toBe('binary_sensor.ep_mmwave');
        (0, vitest_1.expect)(result['temperature']).toBe('sensor.ep_temperature');
    });
    (0, vitest_1.it)('maps EP1-specific entities', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                distanceEntity: 'sensor.ep_distance',
                speedEntity: 'sensor.ep_speed',
                targetCountEntity: 'sensor.ep_target_count',
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['distance']).toBe('sensor.ep_distance');
        (0, vitest_1.expect)(result['speed']).toBe('sensor.ep_speed');
        (0, vitest_1.expect)(result['targetCount']).toBe('sensor.ep_target_count');
    });
    (0, vitest_1.it)('maps configuration entities', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                installationAngleEntity: 'number.ep_install_angle',
                maxDistanceEntity: 'number.ep_max_distance',
                firmwareUpdateEntity: 'update.ep_firmware',
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['installationAngle']).toBe('number.ep_install_angle');
        (0, vitest_1.expect)(result['maxDistance']).toBe('number.ep_max_distance');
        (0, vitest_1.expect)(result['firmwareUpdate']).toBe('update.ep_firmware');
    });
    (0, vitest_1.it)('flattens zone config entities with correct prefix and index', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                zoneConfigEntities: {
                    zone1: {
                        beginX: 'number.ep_zone1_begin_x',
                        endX: 'number.ep_zone1_end_x',
                        beginY: 'number.ep_zone1_begin_y',
                        endY: 'number.ep_zone1_end_y',
                        offDelay: 'number.ep_zone1_off_delay',
                    },
                    zone2: {
                        beginX: 'number.ep_zone2_begin_x',
                        endX: 'number.ep_zone2_end_x',
                        beginY: 'number.ep_zone2_begin_y',
                        endY: 'number.ep_zone2_end_y',
                    },
                },
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['zone1BeginX']).toBe('number.ep_zone1_begin_x');
        (0, vitest_1.expect)(result['zone1EndX']).toBe('number.ep_zone1_end_x');
        (0, vitest_1.expect)(result['zone1BeginY']).toBe('number.ep_zone1_begin_y');
        (0, vitest_1.expect)(result['zone1EndY']).toBe('number.ep_zone1_end_y');
        (0, vitest_1.expect)(result['zone1OffDelay']).toBe('number.ep_zone1_off_delay');
        (0, vitest_1.expect)(result['zone2BeginX']).toBe('number.ep_zone2_begin_x');
        (0, vitest_1.expect)(result['zone2EndX']).toBe('number.ep_zone2_end_x');
        (0, vitest_1.expect)(result['zone2BeginY']).toBe('number.ep_zone2_begin_y');
        (0, vitest_1.expect)(result['zone2EndY']).toBe('number.ep_zone2_end_y');
        // zone2 has no offDelay
        (0, vitest_1.expect)(result['zone2OffDelay']).toBeUndefined();
    });
    (0, vitest_1.it)('flattens exclusion zone entities', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                exclusionZoneConfigEntities: {
                    exclusion1: {
                        beginX: 'number.ep_excl1_bx',
                        endX: 'number.ep_excl1_ex',
                        beginY: 'number.ep_excl1_by',
                        endY: 'number.ep_excl1_ey',
                    },
                },
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['exclusion1BeginX']).toBe('number.ep_excl1_bx');
        (0, vitest_1.expect)(result['exclusion1EndX']).toBe('number.ep_excl1_ex');
    });
    (0, vitest_1.it)('flattens polygon zone entities', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                polygonZoneEntities: {
                    zone1: 'text.ep_polygon_zone1',
                    zone2: 'text.ep_polygon_zone2',
                },
                polygonExclusionEntities: {
                    exclusion1: 'text.ep_polygon_excl1',
                },
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['polygonZone1']).toBe('text.ep_polygon_zone1');
        (0, vitest_1.expect)(result['polygonZone2']).toBe('text.ep_polygon_zone2');
        (0, vitest_1.expect)(result['polygonExclusion1']).toBe('text.ep_polygon_excl1');
    });
    (0, vitest_1.it)('flattens tracking targets correctly', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                trackingTargets: {
                    target1: {
                        x: 'sensor.ep_target1_x',
                        y: 'sensor.ep_target1_y',
                        speed: 'sensor.ep_target1_speed',
                        distance: 'sensor.ep_target1_distance',
                        angle: 'sensor.ep_target1_angle',
                        resolution: 'sensor.ep_target1_resolution',
                        active: 'binary_sensor.ep_target1_active',
                    },
                    target2: {
                        x: 'sensor.ep_target2_x',
                        y: 'sensor.ep_target2_y',
                    },
                },
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['target1X']).toBe('sensor.ep_target1_x');
        (0, vitest_1.expect)(result['target1Y']).toBe('sensor.ep_target1_y');
        (0, vitest_1.expect)(result['target1Speed']).toBe('sensor.ep_target1_speed');
        (0, vitest_1.expect)(result['target1Distance']).toBe('sensor.ep_target1_distance');
        (0, vitest_1.expect)(result['target1Angle']).toBe('sensor.ep_target1_angle');
        (0, vitest_1.expect)(result['target1Resolution']).toBe('sensor.ep_target1_resolution');
        (0, vitest_1.expect)(result['target1Active']).toBe('binary_sensor.ep_target1_active');
        (0, vitest_1.expect)(result['target2X']).toBe('sensor.ep_target2_x');
        (0, vitest_1.expect)(result['target2Y']).toBe('sensor.ep_target2_y');
        // target2 has no speed etc.
        (0, vitest_1.expect)(result['target2Speed']).toBeUndefined();
    });
    (0, vitest_1.it)('passes through settings entities', () => {
        const room = makeRoom({
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                settingsEntities: {
                    sensitivity: 'number.ep_sensitivity',
                    ledEnabled: 'switch.ep_led',
                },
            },
        });
        const result = migrationService_1.migrationService.convertRoomMappings(room);
        (0, vitest_1.expect)(result['sensitivity']).toBe('number.ep_sensitivity');
        (0, vitest_1.expect)(result['ledEnabled']).toBe('switch.ep_led');
    });
});
// ── migrateZonesToRoomCoords ─────────────────────────────────────
(0, vitest_1.describe)('migrateZonesToRoomCoords', () => {
    let transport;
    (0, vitest_1.beforeEach)(() => {
        (0, tempStorage_1.resetStorage)();
        transport = new mockReadTransport_1.MockReadTransport();
    });
    (0, vitest_1.it)('skips room already marked zonesInRoomCoords === true', async () => {
        const room = makeRoom({
            zonesInRoomCoords: true,
            devicePlacement: { x: 100, y: 100, rotationDeg: 0 },
            sensors: [{ deviceId: 'dev-1', profileId: '', placement: { x: 100, y: 100, rotationDeg: 0 } }],
            zones: [makeZone()],
        });
        const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(result).toBe(false);
    });
    (0, vitest_1.it)('skips room with no sensors[0].placement', async () => {
        const room = makeRoom({
            zones: [makeZone()],
        });
        const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(result).toBe(false);
    });
    (0, vitest_1.it)('marks empty-zone room as migrated without transforming', async () => {
        const room = makeRoom({
            devicePlacement: { x: 100, y: 200, rotationDeg: 45 },
            sensors: [{ deviceId: 'dev-1', profileId: '', placement: { x: 100, y: 200, rotationDeg: 45 } }],
            zones: [],
        });
        storage_1.storage.saveRoom(room);
        const result = await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(room.zonesInRoomCoords).toBe(true);
        // Verify persisted
        const saved = storage_1.storage.getRoom('room-1');
        (0, vitest_1.expect)(saved?.zonesInRoomCoords).toBe(true);
    });
    (0, vitest_1.it)('transforms zones at 0° rotation (identity plus placement offset)', async () => {
        const placement = { x: 50, y: 100, rotationDeg: 0 };
        const zone = makeZone({ id: 'z1', x: 10, y: 20, width: 30, height: 40 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
        });
        storage_1.storage.saveRoom(room);
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(room.zonesInRoomCoords).toBe(true);
        // At 0° rotation: deviceToRoom just adds placement offset
        // Corner (10,20) → (60, 120)
        // Corner (40,20) → (90, 120)
        // Corner (40,60) → (90, 160)
        // Corner (10,60) → (60, 160)
        // Bounding box: x=60, y=120, w=30, h=40
        expectZoneClose(room.zones[0], { x: 60, y: 120, width: 30, height: 40 });
    });
    (0, vitest_1.it)('transforms zones at 90° rotation (width/height swap)', async () => {
        const placement = { x: 0, y: 0, rotationDeg: 90 };
        const zone = makeZone({ id: 'z1', x: 0, y: 0, width: 100, height: 200 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
        });
        storage_1.storage.saveRoom(room);
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(room.zonesInRoomCoords).toBe(true);
        // At 90° rotation at origin:
        // deviceToRoom(0,0) → (0, 0)
        // deviceToRoom(100,0) → (0, 100)
        // deviceToRoom(100,200) → (-200, 100)
        // deviceToRoom(0,200) → (-200, 0)
        // Bounding box: x=-200, y=0, w=200, h=100
        expectZoneClose(room.zones[0], { x: -200, y: 0, width: 200, height: 100 });
    });
    (0, vitest_1.it)('transforms zones at 180° rotation', async () => {
        const placement = { x: 0, y: 0, rotationDeg: 180 };
        const zone = makeZone({ id: 'z1', x: 10, y: 20, width: 30, height: 40 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
        });
        storage_1.storage.saveRoom(room);
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        // At 180°:
        // deviceToRoom(10,20) → (-10, -20)
        // deviceToRoom(40,20) → (-40, -20)
        // deviceToRoom(40,60) → (-40, -60)
        // deviceToRoom(10,60) → (-10, -60)
        // Bounding box: x=-40, y=-60, w=30, h=40
        expectZoneClose(room.zones[0], { x: -40, y: -60, width: 30, height: 40 });
    });
    (0, vitest_1.it)('resolves installationAngle from HA via MockReadTransport when not on placement', async () => {
        const placement = { x: 0, y: 0, rotationDeg: 0 };
        // installationAngle is NOT set on placement
        const zone = makeZone({ id: 'z1', x: 100, y: 0, width: 100, height: 100 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                installationAngleEntity: 'number.ep_install_angle',
            },
        });
        storage_1.storage.saveRoom(room);
        // Seed HA state: installation angle is 90°
        transport.setState('number.ep_install_angle', {
            entity_id: 'number.ep_install_angle',
            state: '90',
            attributes: {},
            last_changed: '2025-01-01T00:00:00Z',
            last_updated: '2025-01-01T00:00:00Z',
            context: { id: 'ctx', user_id: null, parent_id: null },
        });
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        // installationAngle should be persisted on placement
        (0, vitest_1.expect)(room.devicePlacement.installationAngle).toBe(90);
        // At 90° effective rotation (0° rotationDeg + 90° installationAngle):
        // deviceToRoom(100,0) → (0, 100)
        // deviceToRoom(200,0) → (0, 200)
        // deviceToRoom(200,100) → (-100, 200)
        // deviceToRoom(100,100) → (-100, 100)
        // Bounding box: x=-100, y=100, w=100, h=100
        expectZoneClose(room.zones[0], { x: -100, y: 100, width: 100, height: 100 });
    });
    (0, vitest_1.it)('uses placement.installationAngle when already set (no HA fetch)', async () => {
        const placement = {
            x: 0,
            y: 0,
            rotationDeg: 0,
            installationAngle: 90,
        };
        const zone = makeZone({ id: 'z1', x: 100, y: 0, width: 100, height: 100 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
        });
        storage_1.storage.saveRoom(room);
        // Even though we seed a different angle in HA, placement.installationAngle
        // is already set so resolveInstallationAngle should NOT be called
        // (the code skips when placement.installationAngle != null)
        transport.setState('number.ep_install_angle', {
            entity_id: 'number.ep_install_angle',
            state: '45',
            attributes: {},
            last_changed: '2025-01-01T00:00:00Z',
            last_updated: '2025-01-01T00:00:00Z',
            context: { id: 'ctx', user_id: null, parent_id: null },
        });
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        // installationAngle stays 90 (not overwritten by HA's 45)
        (0, vitest_1.expect)(room.devicePlacement.installationAngle).toBe(90);
        // Same transform as the HA-resolved test: 90° effective rotation
        expectZoneClose(room.zones[0], { x: -100, y: 100, width: 100, height: 100 });
    });
    (0, vitest_1.it)('handles HA fetch failure gracefully (defaults installationAngle to 0°)', async () => {
        const placement = { x: 50, y: 50, rotationDeg: 0 };
        const zone = makeZone({ id: 'z1', x: 10, y: 20, width: 30, height: 40 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
            entityMappings: {
                discoveredAt: '2025-01-01T00:00:00Z',
                autoMatchedCount: 0,
                manuallyMappedCount: 0,
                installationAngleEntity: 'number.ep_install_angle',
            },
        });
        storage_1.storage.saveRoom(room);
        // Do NOT seed any HA state — getState will return null
        // resolveInstallationAngle should default to 0
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        // installationAngle defaults to 0
        (0, vitest_1.expect)(room.devicePlacement.installationAngle).toBe(0);
        // At 0° effective rotation: just adds placement offset
        // Same math as the 0° test but with placement (50,50)
        expectZoneClose(room.zones[0], { x: 60, y: 70, width: 30, height: 40 });
    });
    (0, vitest_1.it)('persists migrated room to storage', async () => {
        const placement = { x: 0, y: 0, rotationDeg: 0 };
        const zone = makeZone({ id: 'z1', x: 10, y: 20, width: 30, height: 40 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone],
        });
        storage_1.storage.saveRoom(room);
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        const saved = storage_1.storage.getRoom('room-1');
        (0, vitest_1.expect)(saved).toBeDefined();
        (0, vitest_1.expect)(saved.zonesInRoomCoords).toBe(true);
        expectZoneClose(saved.zones[0], { x: 10, y: 20, width: 30, height: 40 });
    });
    (0, vitest_1.it)('transforms multiple zones in one room', async () => {
        const placement = { x: 0, y: 0, rotationDeg: 90 };
        const zone1 = makeZone({ id: 'z1', x: 0, y: 0, width: 100, height: 50 });
        const zone2 = makeZone({ id: 'z2', type: 'exclusion', x: 200, y: 100, width: 50, height: 30 });
        const room = makeRoom({
            devicePlacement: placement,
            sensors: [{ deviceId: 'dev-1', profileId: '', placement }],
            zones: [zone1, zone2],
        });
        storage_1.storage.saveRoom(room);
        await migrationService_1.migrationService.migrateZonesToRoomCoords(room, transport);
        (0, vitest_1.expect)(room.zones).toHaveLength(2);
        // zone1 at 90°: (0,0)→(0,0), (100,0)→(0,100), (100,50)→(-50,100), (0,50)→(-50,0)
        // BB: x=-50, y=0, w=50, h=100
        expectZoneClose(room.zones[0], { x: -50, y: 0, width: 50, height: 100 });
        // zone2 at 90°: (200,100)→(-100,200), (250,100)→(-100,250), (250,130)→(-130,250), (200,130)→(-130,200)
        // BB: x=-130, y=200, w=30, h=50
        expectZoneClose(room.zones[1], { x: -130, y: 200, width: 30, height: 50 });
    });
});
