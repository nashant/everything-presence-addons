/**
 * MQTT discovery payload builder for Home Assistant room devices.
 *
 * Follows the same discovery pattern as dev/mock-devices but for virtual
 * "room" devices that aggregate zone entities from EP sensors.
 */

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip characters that are unsafe in MQTT topics and HA identifiers.
 * Keeps only `[a-zA-Z0-9_-]`. Collapses consecutive underscores.
 * Returns 'unnamed' for empty/blank results.
 */
export function sanitizeForMqtt(input: string): string {
  const cleaned = input
    .replace(/[^a-zA-Z0-9_-]/g, '_') // replace unsafe chars
    .replace(/_+/g, '_')              // collapse repeated underscores
    .replace(/^_|_$/g, '');           // trim leading/trailing underscores
  return cleaned || 'unnamed';
}

// ---------------------------------------------------------------------------
// Topic helpers
// ---------------------------------------------------------------------------

/**
 * Build an HA MQTT discovery config topic.
 * Format: `homeassistant/{component}/{nodeId}/{objectId}/config`
 */
export function discoveryTopic(component: string, nodeId: string, objectId: string): string {
  return `homeassistant/${component}/${nodeId}/${objectId}/config`;
}

/**
 * Build the state topic for a room entity.
 * Format: `ep_room/{sanitizedRoomId}/{objectId}/state`
 */
export function stateTopic(sanitizedRoomId: string, objectId: string): string {
  return `ep_room/${sanitizedRoomId}/${objectId}/state`;
}

/**
 * Build the availability topic for a room device.
 * Format: `ep_room/{sanitizedRoomId}/availability`
 */
export function availabilityTopic(sanitizedRoomId: string): string {
  return `ep_room/${sanitizedRoomId}/availability`;
}

// ---------------------------------------------------------------------------
// Device block
// ---------------------------------------------------------------------------

export interface DeviceBlock {
  identifiers: string[];
  name: string;
  manufacturer: string;
  model: string;
}

/**
 * Build the shared `device` block that groups all entities under one HA device.
 * All discovery payloads for a room share this block so HA groups them correctly.
 */
export function buildRoomDeviceBlock(roomId: string, roomName: string): DeviceBlock {
  const sanitizedId = sanitizeForMqtt(roomId);
  return {
    identifiers: [`ep_room_${sanitizedId}`],
    name: roomName,
    manufacturer: 'Everything Presence',
    model: 'Virtual Room Aggregator',
  };
}

// ---------------------------------------------------------------------------
// Discovery payloads
// ---------------------------------------------------------------------------

export interface BinarySensorDiscoveryPayload {
  unique_id: string;
  object_id: string;
  name: string;
  device: DeviceBlock;
  device_class: 'occupancy';
  state_topic: string;
  payload_on: string;
  payload_off: string;
  value_template: string;
  availability_topic: string;
}

/**
 * Build a complete MQTT discovery payload for a binary_sensor (occupancy).
 *
 * @param roomId       - Raw room ID (will be sanitized)
 * @param roomName     - Human-readable room name
 * @param zoneIndex    - Numeric zone index (0-based)
 * @param zoneName     - Human-readable zone name
 * @param valueTemplate - Jinja2 template string for value_template
 * @param deviceBlock  - Shared device block from buildRoomDeviceBlock()
 */
export function buildBinarySensorDiscovery(
  roomId: string,
  roomName: string,
  zoneIndex: number,
  zoneName: string,
  valueTemplate: string,
  deviceBlock: DeviceBlock,
): BinarySensorDiscoveryPayload {
  const sanitizedRoomId = sanitizeForMqtt(roomId);
  const objectId = `zone_${zoneIndex}_occupancy`;
  const nodeId = `ep_room_${sanitizedRoomId}`;

  return {
    unique_id: `${nodeId}_${objectId}`,
    object_id: objectId,
    name: `${zoneName} Occupancy`,
    device: deviceBlock,
    device_class: 'occupancy',
    state_topic: stateTopic(sanitizedRoomId, objectId),
    payload_on: 'ON',
    payload_off: 'OFF',
    value_template: valueTemplate,
    availability_topic: availabilityTopic(sanitizedRoomId),
  };
}

/**
 * Build a complete MQTT discovery payload for the room-level occupied
 * binary_sensor. This always exists when a room has sensors, independent
 * of zones.
 *
 * @param roomId       - Raw room ID (will be sanitized)
 * @param roomName     - Human-readable room name
 * @param valueTemplate - Jinja2 template string aggregating sensor occupancy
 * @param deviceBlock  - Shared device block from buildRoomDeviceBlock()
 */
export function buildRoomOccupancyDiscovery(
  roomId: string,
  roomName: string,
  valueTemplate: string,
  deviceBlock: DeviceBlock,
): BinarySensorDiscoveryPayload {
  const sanitizedRoomId = sanitizeForMqtt(roomId);
  const objectId = 'occupied';
  const nodeId = `ep_room_${sanitizedRoomId}`;

  return {
    unique_id: `${nodeId}_${objectId}`,
    object_id: objectId,
    name: `${roomName} Occupied`,
    device: deviceBlock,
    device_class: 'occupancy',
    state_topic: stateTopic(sanitizedRoomId, objectId),
    payload_on: 'ON',
    payload_off: 'OFF',
    value_template: valueTemplate,
    availability_topic: availabilityTopic(sanitizedRoomId),
  };
}

export interface SensorDiscoveryPayload {
  unique_id: string;
  object_id: string;
  name: string;
  device: DeviceBlock;
  state_topic: string;
  value_template: string;
  availability_topic: string;
  unit_of_measurement?: string;
}

/**
 * Build a complete MQTT discovery payload for a sensor (e.g. target count).
 *
 * @param roomId       - Raw room ID (will be sanitized)
 * @param roomName     - Human-readable room name
 * @param zoneIndex    - Numeric zone index (0-based)
 * @param zoneName     - Human-readable zone name
 * @param valueTemplate - Jinja2 template string for value_template
 * @param deviceBlock  - Shared device block from buildRoomDeviceBlock()
 * @param unit         - Optional unit_of_measurement
 */
export function buildSensorDiscovery(
  roomId: string,
  roomName: string,
  zoneIndex: number,
  zoneName: string,
  valueTemplate: string,
  deviceBlock: DeviceBlock,
  unit?: string,
): SensorDiscoveryPayload {
  const sanitizedRoomId = sanitizeForMqtt(roomId);
  const objectId = `zone_${zoneIndex}_target_count`;
  const nodeId = `ep_room_${sanitizedRoomId}`;

  const payload: SensorDiscoveryPayload = {
    unique_id: `${nodeId}_${objectId}`,
    object_id: objectId,
    name: `${zoneName} Target Count`,
    device: deviceBlock,
    state_topic: stateTopic(sanitizedRoomId, objectId),
    value_template: valueTemplate,
    availability_topic: availabilityTopic(sanitizedRoomId),
  };

  if (unit) {
    payload.unit_of_measurement = unit;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Select (aggregation mode) discovery payload
// ---------------------------------------------------------------------------

export interface SelectDiscoveryPayload {
  unique_id: string;
  object_id: string;
  name: string;
  device: DeviceBlock;
  state_topic: string;
  command_topic: string;
  options: string[];
  availability_topic: string;
  icon?: string;
}

/**
 * Build an MQTT discovery payload for a select entity (occupancy mode).
 *
 * @param roomId       - Raw room ID (will be sanitized)
 * @param roomName     - Human-readable room name
 * @param options      - Selectable option labels
 * @param deviceBlock  - Shared device block from buildRoomDeviceBlock()
 * @param icon         - Optional MDI icon string
 */
export function buildSelectDiscovery(
  roomId: string,
  roomName: string,
  options: string[],
  deviceBlock: DeviceBlock,
  icon = 'mdi:account-group',
): SelectDiscoveryPayload {
  const sanitizedRoomId = sanitizeForMqtt(roomId);
  const objectId = 'occupancy_mode';
  const nodeId = `ep_room_${sanitizedRoomId}`;

  return {
    unique_id: `${nodeId}_${objectId}`,
    object_id: objectId,
    name: `${roomName} Occupancy Mode`,
    device: deviceBlock,
    state_topic: stateTopic(sanitizedRoomId, objectId),
    command_topic: `ep_room/${sanitizedRoomId}/${objectId}/set`,
    options,
    availability_topic: availabilityTopic(sanitizedRoomId),
    icon,
  };
}
