import { describe, it, expect } from 'vitest';
import {
  sanitizeForMqtt,
  discoveryTopic,
  stateTopic,
  availabilityTopic,
  buildRoomDeviceBlock,
  buildBinarySensorDiscovery,
  buildSensorDiscovery,
} from '../../ha/discoveryPayload';

// ─────────────────────────────────────────────────────────────────
// sanitizeForMqtt
// ─────────────────────────────────────────────────────────────────

describe('sanitizeForMqtt', () => {
  it('passes through clean alphanumeric strings', () => {
    expect(sanitizeForMqtt('living-room_1')).toBe('living-room_1');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeForMqtt('Living Room')).toBe('Living_Room');
  });

  it('strips special characters', () => {
    expect(sanitizeForMqtt('room@#$%^&*!')).toBe('room');
  });

  it('collapses consecutive underscores', () => {
    expect(sanitizeForMqtt('a   b')).toBe('a_b');
  });

  it('handles MQTT wildcard characters (+ and #)', () => {
    expect(sanitizeForMqtt('room+#test')).toBe('room_test');
  });

  it('handles forward slashes', () => {
    expect(sanitizeForMqtt('floor/room/zone')).toBe('floor_room_zone');
  });

  it('returns "unnamed" for empty string', () => {
    expect(sanitizeForMqtt('')).toBe('unnamed');
  });

  it('returns "unnamed" for string of only special chars', () => {
    expect(sanitizeForMqtt('!@#$%')).toBe('unnamed');
  });

  it('handles unicode characters', () => {
    expect(sanitizeForMqtt('küche-wohnzimmer')).toBe('k_che-wohnzimmer');
  });

  it('handles very long names', () => {
    const longName = 'a'.repeat(200);
    const result = sanitizeForMqtt(longName);
    expect(result).toBe(longName); // no truncation — just sanitization
  });

  it('trims leading and trailing underscores from replacements', () => {
    expect(sanitizeForMqtt('  room  ')).toBe('room');
  });
});

// ─────────────────────────────────────────────────────────────────
// Topic helpers
// ─────────────────────────────────────────────────────────────────

describe('discoveryTopic', () => {
  it('produces correct HA discovery topic format', () => {
    expect(discoveryTopic('binary_sensor', 'ep_room_abc', 'zone_0_occupancy'))
      .toBe('homeassistant/binary_sensor/ep_room_abc/zone_0_occupancy/config');
  });
});

describe('stateTopic', () => {
  it('produces correct state topic format', () => {
    expect(stateTopic('my_room', 'zone_0_occupancy'))
      .toBe('ep_room/my_room/zone_0_occupancy/state');
  });
});

describe('availabilityTopic', () => {
  it('produces correct availability topic format', () => {
    expect(availabilityTopic('my_room'))
      .toBe('ep_room/my_room/availability');
  });
});

// ─────────────────────────────────────────────────────────────────
// buildRoomDeviceBlock
// ─────────────────────────────────────────────────────────────────

describe('buildRoomDeviceBlock', () => {
  it('returns correct device block structure', () => {
    const block = buildRoomDeviceBlock('room-123', 'Living Room');
    expect(block).toEqual({
      identifiers: ['ep_room_room-123'],
      name: 'Living Room',
      manufacturer: 'Everything Presence',
      model: 'Virtual Room Aggregator',
    });
  });

  it('sanitizes room ID in identifiers', () => {
    const block = buildRoomDeviceBlock('room with spaces!', 'Test Room');
    expect(block.identifiers[0]).toBe('ep_room_room_with_spaces');
  });

  it('handles empty room name (uses original name, sanitization is for IDs only)', () => {
    const block = buildRoomDeviceBlock('r1', '');
    expect(block.name).toBe('');
    expect(block.identifiers[0]).toBe('ep_room_r1');
  });
});

// ─────────────────────────────────────────────────────────────────
// buildBinarySensorDiscovery
// ─────────────────────────────────────────────────────────────────

describe('buildBinarySensorDiscovery', () => {
  const device = buildRoomDeviceBlock('room-1', 'Living Room');

  it('includes all required HA discovery fields', () => {
    const payload = buildBinarySensorDiscovery(
      'room-1', 'Living Room', 0, 'Main Zone',
      '{{ states("binary_sensor.ep1_zone_0_occupancy") }}',
      device,
    );

    expect(payload).toHaveProperty('unique_id');
    expect(payload).toHaveProperty('object_id');
    expect(payload).toHaveProperty('name');
    expect(payload).toHaveProperty('device');
    expect(payload).toHaveProperty('device_class', 'occupancy');
    expect(payload).toHaveProperty('state_topic');
    expect(payload).toHaveProperty('payload_on', 'ON');
    expect(payload).toHaveProperty('payload_off', 'OFF');
    expect(payload).toHaveProperty('value_template');
    expect(payload).toHaveProperty('availability_topic');
  });

  it('uses correct object_id and unique_id format', () => {
    const payload = buildBinarySensorDiscovery(
      'room-1', 'Living Room', 2, 'Corner Zone',
      '{{ template }}',
      device,
    );

    expect(payload.object_id).toBe('zone_2_occupancy');
    expect(payload.unique_id).toBe('ep_room_room-1_zone_2_occupancy');
  });

  it('formats zone name in entity name', () => {
    const payload = buildBinarySensorDiscovery(
      'room-1', 'Living Room', 0, 'Desk Area',
      '{{ template }}',
      device,
    );
    expect(payload.name).toBe('Desk Area Occupancy');
  });

  it('uses correct state topic format', () => {
    const payload = buildBinarySensorDiscovery(
      'room-1', 'Living Room', 0, 'Zone',
      '{{ t }}',
      device,
    );
    expect(payload.state_topic).toBe('ep_room/room-1/zone_0_occupancy/state');
  });

  it('uses correct availability topic format', () => {
    const payload = buildBinarySensorDiscovery(
      'room-1', 'Living Room', 0, 'Zone',
      '{{ t }}',
      device,
    );
    expect(payload.availability_topic).toBe('ep_room/room-1/availability');
  });

  it('shares device block for correct HA device grouping', () => {
    const p1 = buildBinarySensorDiscovery('r1', 'Room', 0, 'Z0', '{{ a }}', device);
    const p2 = buildBinarySensorDiscovery('r1', 'Room', 1, 'Z1', '{{ b }}', device);
    expect(p1.device).toBe(p2.device); // same reference
  });

  it('stores the value_template verbatim', () => {
    const tpl = "{% set sensors = ['binary_sensor.ep1_z0'] %}{{ 'ON' if sensors | select('is_state', 'on') | list | count > 0 else 'OFF' }}";
    const payload = buildBinarySensorDiscovery('r1', 'Room', 0, 'Z', tpl, device);
    expect(payload.value_template).toBe(tpl);
  });

  it('handles room ID with special characters via sanitization', () => {
    const specialDevice = buildRoomDeviceBlock('room/with+special#chars', 'Special Room');
    const payload = buildBinarySensorDiscovery(
      'room/with+special#chars', 'Special Room', 0, 'Zone',
      '{{ t }}',
      specialDevice,
    );
    expect(payload.unique_id).toMatch(/^ep_room_room_with_special_chars_zone_0_occupancy$/);
    expect(payload.state_topic).toBe('ep_room/room_with_special_chars/zone_0_occupancy/state');
  });
});

// ─────────────────────────────────────────────────────────────────
// buildSensorDiscovery
// ─────────────────────────────────────────────────────────────────

describe('buildSensorDiscovery', () => {
  const device = buildRoomDeviceBlock('room-1', 'Living Room');

  it('includes all required fields for a target count sensor', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Living Room', 0, 'Main Zone',
      '{{ states("sensor.ep1_zone_0_target_count") }}',
      device,
    );

    expect(payload).toHaveProperty('unique_id');
    expect(payload).toHaveProperty('object_id', 'zone_0_target_count');
    expect(payload).toHaveProperty('name', 'Main Zone Target Count');
    expect(payload).toHaveProperty('device');
    expect(payload).toHaveProperty('state_topic');
    expect(payload).toHaveProperty('value_template');
    expect(payload).toHaveProperty('availability_topic');
  });

  it('does NOT include device_class (target count has no standard class)', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Living Room', 0, 'Zone',
      '{{ t }}',
      device,
    );
    expect(payload).not.toHaveProperty('device_class');
  });

  it('does NOT include payload_on/off (sensor, not binary_sensor)', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Living Room', 0, 'Zone',
      '{{ t }}',
      device,
    );
    expect(payload).not.toHaveProperty('payload_on');
    expect(payload).not.toHaveProperty('payload_off');
  });

  it('includes unit_of_measurement when provided', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Room', 0, 'Zone',
      '{{ t }}',
      device,
      'targets',
    );
    expect(payload.unit_of_measurement).toBe('targets');
  });

  it('omits unit_of_measurement when not provided', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Room', 0, 'Zone',
      '{{ t }}',
      device,
    );
    expect(payload).not.toHaveProperty('unit_of_measurement');
  });

  it('uses correct unique_id and topic format', () => {
    const payload = buildSensorDiscovery(
      'room-1', 'Living Room', 3, 'Zone 3',
      '{{ t }}',
      device,
    );
    expect(payload.unique_id).toBe('ep_room_room-1_zone_3_target_count');
    expect(payload.state_topic).toBe('ep_room/room-1/zone_3_target_count/state');
  });

  it('shares device block for correct HA device grouping', () => {
    const p1 = buildSensorDiscovery('r1', 'Room', 0, 'Z0', '{{ a }}', device);
    const p2 = buildBinarySensorDiscovery('r1', 'Room', 0, 'Z0', '{{ b }}', device);
    expect(p1.device).toBe(p2.device);
  });
});
