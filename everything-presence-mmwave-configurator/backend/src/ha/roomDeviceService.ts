/**
 * RoomDeviceService — orchestrates MQTT discovery messages to create/remove
 * virtual HA room devices with aggregated zone entities.
 *
 * Uses MqttClient, discovery payload builder, and template generator to
 * publish retained MQTT discovery messages that HA picks up and registers
 * as devices + entities.
 *
 * Note: Room-level occupied entity is now created via HA template helper
 * API (see haHelperService.ts), not MQTT discovery.
 */

import { logger } from '../logger.js';
import type { MqttClient } from './mqttClient.js';
import {
  sanitizeForMqtt,
  discoveryTopic,
  stateTopic,
  availabilityTopic,
  buildRoomDeviceBlock,
  buildBinarySensorDiscovery,
  buildSensorDiscovery,
  buildSelectDiscovery,
} from './discoveryPayload.js';
import {
  generateTemplate,
  generateMaxTargetCountTemplate,
  type AggregationMode,
} from './templateGenerator.js';

const log = logger.child({ module: 'room-device-service' });

/** Map internal aggregation modes to user-facing labels for the MQTT select entity. */
const MODE_TO_LABEL: Record<AggregationMode, string> = {
  or: 'Any',
  and: 'All',
  majority: 'Majority',
};

// ---------------------------------------------------------------------------
// Input descriptor
// ---------------------------------------------------------------------------

/**
 * Subset of room data needed to build discovery payloads.
 * S04 will build this from zone assignments + device profiles.
 */
export interface RoomDeviceDescriptor {
  roomId: string;
  roomName: string;
  /** Room-level occupancy — always present when the room has sensors. */
  roomOccupancy?: {
    sensorEntityIds: string[];
    aggregationMode: AggregationMode;
  };
  zones: Array<{
    zoneId: string;
    zoneName: string;
    zoneIndex: number;
    aggregationMode: AggregationMode;
    coveringSensorEntities: {
      /** e.g. ['binary_sensor.mock_ep_lite_1_zone_2_occupancy'] */
      occupancy: string[];
      /** e.g. ['sensor.mock_ep_lite_1_zone_2_target_count'] */
      targetCount: string[];
    };
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RoomDeviceService {
  private readonly mqtt: MqttClient;

  constructor(mqtt: MqttClient) {
    this.mqtt = mqtt;
  }

  /**
   * Publish MQTT discovery messages to create a virtual HA room device
   * with binary_sensor (occupancy) and sensor (target count) entities
   * for each zone.
   *
   * Publishes availability 'online' first, then all entity discovery payloads.
   * All payloads are retained so HA picks them up even after restart.
   */
  async createRoomDevice(descriptor: RoomDeviceDescriptor): Promise<void> {
    const { roomId, roomName, zones, roomOccupancy } = descriptor;
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;
    const deviceBlock = buildRoomDeviceBlock(roomId, roomName);

    log.info(
      { roomId, sanitizedRoomId, roomName, zoneCount: zones.length, hasRoomOccupancy: !!roomOccupancy },
      'Creating room device via MQTT discovery',
    );

    // 1. Publish availability: 'online'
    const availTopic = availabilityTopic(sanitizedRoomId);
    await this.mqtt.publish(availTopic, 'online', true);
    log.debug({ topic: availTopic }, 'Published availability online');

    // 2. Room-level occupied entity is now created via HA template helper API
    //    (see haHelperService.ts), not MQTT discovery. Skip it here.

    // 3. For each zone, publish binary_sensor (occupancy) + sensor (target count)
    for (const zone of zones) {
      const { zoneIndex, zoneName, aggregationMode, coveringSensorEntities } = zone;

      // --- Binary sensor (occupancy) ---
      const bsObjectId = `zone_${zoneIndex}_occupancy`;
      const bsUniqueId = `${nodeId}_${bsObjectId}`;
      // For majority mode with even sensor count, the self entity needs to be
      // the binary_sensor's HA entity_id for tie-break self-reference.
      const selfEntityId = `binary_sensor.${bsUniqueId}`;

      const occupancyTemplate = generateTemplate(
        aggregationMode,
        coveringSensorEntities.occupancy,
        aggregationMode === 'majority' ? selfEntityId : undefined,
      );

      const bsPayload = buildBinarySensorDiscovery(
        roomId,
        roomName,
        zoneIndex,
        zoneName,
        occupancyTemplate,
        deviceBlock,
      );

      const bsTopic = discoveryTopic('binary_sensor', nodeId, bsObjectId);
      await this.mqtt.publish(bsTopic, JSON.stringify(bsPayload), true);
      log.debug({ topic: bsTopic, zoneIndex, aggregationMode }, 'Published binary_sensor discovery');

      // --- Sensor (target count) ---
      const sObjectId = `zone_${zoneIndex}_target_count`;
      const targetCountTemplate = generateMaxTargetCountTemplate(
        coveringSensorEntities.targetCount,
      );

      const sPayload = buildSensorDiscovery(
        roomId,
        roomName,
        zoneIndex,
        zoneName,
        targetCountTemplate,
        deviceBlock,
        'targets',
      );

      const sTopic = discoveryTopic('sensor', nodeId, sObjectId);
      await this.mqtt.publish(sTopic, JSON.stringify(sPayload), true);
      log.debug({ topic: sTopic, zoneIndex }, 'Published sensor discovery');
    }

    // 4. Publish occupancy mode select entity (when sensors exist)
    if (roomOccupancy && roomOccupancy.sensorEntityIds.length > 0) {
      const selectPayload = buildSelectDiscovery(
        roomId,
        roomName,
        ['Any', 'All', 'Majority'],
        deviceBlock,
      );

      const selectConfigTopic = discoveryTopic('select', nodeId, 'occupancy_mode');
      await this.mqtt.publish(selectConfigTopic, JSON.stringify(selectPayload), true);

      // Publish current state (default to 'Any' if not set)
      const currentMode = roomOccupancy.aggregationMode ?? 'or';
      const modeLabel = MODE_TO_LABEL[currentMode] ?? 'Any';
      const selectStateTopic = stateTopic(sanitizedRoomId, 'occupancy_mode');
      await this.mqtt.publish(selectStateTopic, modeLabel, true);

      log.debug({ topic: selectConfigTopic, currentMode: modeLabel }, 'Published occupancy mode select');
    }

    const topicCount = 1 + zones.length * 2 + (roomOccupancy ? 2 : 0); // availability + (bs + sensor) per zone + select config + state
    log.info(
      { roomId, sanitizedRoomId, zoneCount: zones.length, hasRoomOccupancy: !!roomOccupancy, topicCount },
      'Room device created',
    );
  }

  /**
   * Remove a virtual room device by publishing empty payloads to all
   * config topics (clears retained messages) then removing availability.
   */
  async removeRoomDevice(roomId: string, zoneCount: number, _hasRoomOccupancy = true): Promise<void> {
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;

    log.info(
      { roomId, sanitizedRoomId, zoneCount },
      'Removing room device via MQTT discovery',
    );

    // Room-level occupied entity is managed via HA template helper API,
    // not MQTT discovery. Still clear any legacy retained MQTT message.
    const occTopic = discoveryTopic('binary_sensor', nodeId, 'occupied');
    await this.mqtt.publish(occTopic, '', true);

    // Publish empty payloads to each zone entity config topic
    for (let i = 0; i < zoneCount; i++) {
      const bsObjectId = `zone_${i}_occupancy`;
      const bsTopic = discoveryTopic('binary_sensor', nodeId, bsObjectId);
      await this.mqtt.publish(bsTopic, '', true);

      const sObjectId = `zone_${i}_target_count`;
      const sTopic = discoveryTopic('sensor', nodeId, sObjectId);
      await this.mqtt.publish(sTopic, '', true);
    }

    // Remove occupancy mode select entity
    const selectTopic = discoveryTopic('select', nodeId, 'occupancy_mode');
    await this.mqtt.publish(selectTopic, '', true);
    const selectStateTopic2 = stateTopic(sanitizedRoomId, 'occupancy_mode');
    await this.mqtt.publish(selectStateTopic2, '', true);

    // Remove availability last
    const availTopic = availabilityTopic(sanitizedRoomId);
    await this.mqtt.publish(availTopic, '', true);

    const topicCount = 1 + 1 + zoneCount * 2; // legacy occupied + availability + zone entities
    log.info(
      { roomId, sanitizedRoomId, zoneCount, topicCount },
      'Room device removed',
    );
  }

  /**
   * Return all MQTT topics that createRoomDevice/removeRoomDevice would
   * publish to. Useful for debugging and inspection.
   */
  getDiscoveryTopics(roomId: string, zoneCount: number, hasRoomOccupancy = true): string[] {
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;
    const topics: string[] = [];

    // Availability topic
    topics.push(availabilityTopic(sanitizedRoomId));

    // Room-level occupied entity
    if (hasRoomOccupancy) {
      topics.push(discoveryTopic('binary_sensor', nodeId, 'occupied'));
    }

    // Per-zone entity config topics
    for (let i = 0; i < zoneCount; i++) {
      topics.push(discoveryTopic('binary_sensor', nodeId, `zone_${i}_occupancy`));
      topics.push(discoveryTopic('sensor', nodeId, `zone_${i}_target_count`));
    }

    return topics;
  }
}
