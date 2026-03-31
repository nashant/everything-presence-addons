import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomDeviceService, type RoomDeviceDescriptor } from '../../ha/roomDeviceService';

// ---------------------------------------------------------------------------
// Mock MqttClient — tracks all publish calls
// ---------------------------------------------------------------------------

function createMockMqttClient() {
  const publishes: Array<{ topic: string; payload: string; retain: boolean }> = [];
  return {
    publish: vi.fn(async (topic: string, payload: string | Buffer, retain = true) => {
      publishes.push({ topic, payload: payload.toString(), retain });
    }),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: true,
    publishes,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function twoZoneDescriptor(): RoomDeviceDescriptor {
  return {
    roomId: 'room-1',
    roomName: 'Living Room',
    zones: [
      {
        zoneId: 'z0',
        zoneName: 'Main Area',
        zoneIndex: 0,
        aggregationMode: 'or',
        coveringSensorEntities: {
          occupancy: [
            'binary_sensor.mock_ep_lite_1_zone_0_occupancy',
            'binary_sensor.mock_ep_lite_2_zone_0_occupancy',
          ],
          targetCount: [
            'sensor.mock_ep_lite_1_zone_0_target_count',
            'sensor.mock_ep_lite_2_zone_0_target_count',
          ],
        },
      },
      {
        zoneId: 'z1',
        zoneName: 'Entrance',
        zoneIndex: 1,
        aggregationMode: 'majority',
        coveringSensorEntities: {
          occupancy: [
            'binary_sensor.mock_ep_lite_1_zone_1_occupancy',
            'binary_sensor.mock_ep_lite_2_zone_1_occupancy',
            'binary_sensor.mock_ep_lite_3_zone_1_occupancy',
          ],
          targetCount: [
            'sensor.mock_ep_lite_1_zone_1_target_count',
            'sensor.mock_ep_lite_2_zone_1_target_count',
            'sensor.mock_ep_lite_3_zone_1_target_count',
          ],
        },
      },
    ],
  };
}

function noChangeOnTieDescriptor(): RoomDeviceDescriptor {
  return {
    roomId: 'room-2',
    roomName: 'Bedroom',
    zones: [
      {
        zoneId: 'z0',
        zoneName: 'Bed Area',
        zoneIndex: 0,
        aggregationMode: 'no_change_on_tie',
        coveringSensorEntities: {
          occupancy: [
            'binary_sensor.ep_1_zone_0_occupancy',
            'binary_sensor.ep_2_zone_0_occupancy',
          ],
          targetCount: [
            'sensor.ep_1_zone_0_target_count',
            'sensor.ep_2_zone_0_target_count',
          ],
        },
      },
    ],
  };
}

function emptyZonesDescriptor(): RoomDeviceDescriptor {
  return {
    roomId: 'room-empty',
    roomName: 'Empty Room',
    zones: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoomDeviceService', () => {
  let mockMqtt: ReturnType<typeof createMockMqttClient>;
  let service: RoomDeviceService;

  beforeEach(() => {
    mockMqtt = createMockMqttClient();
    // Cast the mock to satisfy the MqttClient type — tests only use publish()
    service = new RoomDeviceService(mockMqtt as any);
  });

  // ─────────────────────────────────────────────────────────────────
  // createRoomDevice
  // ─────────────────────────────────────────────────────────────────

  describe('createRoomDevice', () => {
    it('publishes correct number of messages for 2-zone room', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      // 1 availability + (1 binary_sensor + 1 sensor) × 2 zones = 5
      expect(mockMqtt.publishes).toHaveLength(5);
    });

    it('publishes availability online as first message', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const first = mockMqtt.publishes[0];
      expect(first.topic).toBe('ep_room/room-1/availability');
      expect(first.payload).toBe('online');
      expect(first.retain).toBe(true);
    });

    it('publishes binary_sensor discovery with correct topic format', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const bsPublish = mockMqtt.publishes[1];
      expect(bsPublish.topic).toBe(
        'homeassistant/binary_sensor/ep_room_room-1/zone_0_occupancy/config',
      );
      expect(bsPublish.retain).toBe(true);
    });

    it('publishes sensor discovery with correct topic format', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const sPublish = mockMqtt.publishes[2];
      expect(sPublish.topic).toBe(
        'homeassistant/sensor/ep_room_room-1/zone_0_target_count/config',
      );
      expect(sPublish.retain).toBe(true);
    });

    it('binary_sensor payload contains correct value_template from OR generator', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const bsPayload = JSON.parse(mockMqtt.publishes[1].payload);
      expect(bsPayload.value_template).toContain("is_state('binary_sensor.mock_ep_lite_1_zone_0_occupancy', 'on')");
      expect(bsPayload.value_template).toContain(' or ');
      expect(bsPayload.value_template).toContain("is_state('binary_sensor.mock_ep_lite_2_zone_0_occupancy', 'on')");
    });

    it('sensor payload contains correct value_template from max target count generator', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const sPayload = JSON.parse(mockMqtt.publishes[2].payload);
      expect(sPayload.value_template).toContain("states('sensor.mock_ep_lite_1_zone_0_target_count')");
      expect(sPayload.value_template).toContain('| max');
    });

    it('second zone uses majority aggregation in binary_sensor', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      // zone 1 binary_sensor is at index 3 (avail[0], z0_bs[1], z0_s[2], z1_bs[3])
      const bsPayload = JSON.parse(mockMqtt.publishes[3].payload);
      expect(bsPayload.value_template).toContain("select('eq', 'on')");
      expect(bsPayload.value_template).toContain('count_on > 3 / 2');
    });

    it('all entities share identical device identifiers', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      // All payloads except availability (index 0) are entity discoveries
      const entityPublishes = mockMqtt.publishes.slice(1);
      expect(entityPublishes.length).toBeGreaterThan(0);

      const deviceBlocks = entityPublishes.map((p) => JSON.parse(p.payload).device);
      const firstDevice = deviceBlocks[0];

      for (const device of deviceBlocks) {
        expect(device.identifiers).toEqual(firstDevice.identifiers);
        expect(device.name).toBe(firstDevice.name);
        expect(device.manufacturer).toBe(firstDevice.manufacturer);
        expect(device.model).toBe(firstDevice.model);
      }

      expect(firstDevice.identifiers).toEqual(['ep_room_room-1']);
      expect(firstDevice.name).toBe('Living Room');
    });

    it('binary_sensor payload has device_class occupancy', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const bsPayload = JSON.parse(mockMqtt.publishes[1].payload);
      expect(bsPayload.device_class).toBe('occupancy');
    });

    it('sensor payload has unit_of_measurement targets', async () => {
      await service.createRoomDevice(twoZoneDescriptor());

      const sPayload = JSON.parse(mockMqtt.publishes[2].payload);
      expect(sPayload.unit_of_measurement).toBe('targets');
    });

    it('no_change_on_tie mode passes selfEntityId derived from unique_id', async () => {
      await service.createRoomDevice(noChangeOnTieDescriptor());

      // Availability + 1 bs + 1 sensor = 3 publishes
      expect(mockMqtt.publishes).toHaveLength(3);

      const bsPayload = JSON.parse(mockMqtt.publishes[1].payload);
      // The template should reference its own entity for tie-breaking
      expect(bsPayload.value_template).toContain(
        "states('binary_sensor.ep_room_room-2_zone_0_occupancy')",
      );
      // It should also have the 'default' fallback pattern
      expect(bsPayload.value_template).toContain("default('OFF', true)");
    });

    it('publishes only availability for empty zones array', async () => {
      await service.createRoomDevice(emptyZonesDescriptor());

      expect(mockMqtt.publishes).toHaveLength(1);
      expect(mockMqtt.publishes[0].topic).toBe('ep_room/room-empty/availability');
      expect(mockMqtt.publishes[0].payload).toBe('online');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // removeRoomDevice
  // ─────────────────────────────────────────────────────────────────

  describe('removeRoomDevice', () => {
    it('publishes empty payloads to all config topics + availability', async () => {
      await service.removeRoomDevice('room-1', 2);

      // 2 zones × (bs + sensor) + 1 availability = 5
      expect(mockMqtt.publishes).toHaveLength(5);
    });

    it('publishes empty strings to config topics with retain', async () => {
      await service.removeRoomDevice('room-1', 2);

      for (const pub of mockMqtt.publishes) {
        expect(pub.payload).toBe('');
        expect(pub.retain).toBe(true);
      }
    });

    it('config topics match expected format', async () => {
      await service.removeRoomDevice('room-1', 2);

      const topics = mockMqtt.publishes.map((p) => p.topic);
      expect(topics).toContain(
        'homeassistant/binary_sensor/ep_room_room-1/zone_0_occupancy/config',
      );
      expect(topics).toContain(
        'homeassistant/sensor/ep_room_room-1/zone_0_target_count/config',
      );
      expect(topics).toContain(
        'homeassistant/binary_sensor/ep_room_room-1/zone_1_occupancy/config',
      );
      expect(topics).toContain(
        'homeassistant/sensor/ep_room_room-1/zone_1_target_count/config',
      );
      expect(topics).toContain('ep_room/room-1/availability');
    });

    it('availability is published last', async () => {
      await service.removeRoomDevice('room-1', 2);

      const last = mockMqtt.publishes[mockMqtt.publishes.length - 1];
      expect(last.topic).toBe('ep_room/room-1/availability');
    });

    it('zero zones publishes only availability removal', async () => {
      await service.removeRoomDevice('room-1', 0);

      expect(mockMqtt.publishes).toHaveLength(1);
      expect(mockMqtt.publishes[0].topic).toBe('ep_room/room-1/availability');
      expect(mockMqtt.publishes[0].payload).toBe('');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getDiscoveryTopics
  // ─────────────────────────────────────────────────────────────────

  describe('getDiscoveryTopics', () => {
    it('returns correct topic list for 2-zone room', () => {
      const topics = service.getDiscoveryTopics('room-1', 2);

      // 1 availability + 2 × (bs + sensor) = 5
      expect(topics).toHaveLength(5);
      expect(topics[0]).toBe('ep_room/room-1/availability');
      expect(topics[1]).toBe(
        'homeassistant/binary_sensor/ep_room_room-1/zone_0_occupancy/config',
      );
      expect(topics[2]).toBe(
        'homeassistant/sensor/ep_room_room-1/zone_0_target_count/config',
      );
      expect(topics[3]).toBe(
        'homeassistant/binary_sensor/ep_room_room-1/zone_1_occupancy/config',
      );
      expect(topics[4]).toBe(
        'homeassistant/sensor/ep_room_room-1/zone_1_target_count/config',
      );
    });

    it('returns only availability for zero zones', () => {
      const topics = service.getDiscoveryTopics('room-1', 0);

      expect(topics).toHaveLength(1);
      expect(topics[0]).toBe('ep_room/room-1/availability');
    });

    it('sanitizes room ID in topics', () => {
      const topics = service.getDiscoveryTopics('My Room @#$', 1);

      // sanitizeForMqtt('My Room @#$') → 'My_Room'
      expect(topics[0]).toBe('ep_room/My_Room/availability');
      expect(topics[1]).toContain('ep_room_My_Room');
    });
  });
});
