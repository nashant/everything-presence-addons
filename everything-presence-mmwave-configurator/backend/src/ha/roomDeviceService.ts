/**
 * RoomDeviceService — orchestrates MQTT discovery messages to create/remove
 * virtual HA room devices with aggregated zone entities.
 *
 * Uses MqttClient (T01), discovery payload builder (T01), and template
 * generator (T02) to publish retained MQTT discovery messages that HA
 * picks up and registers as devices + entities.
 */

import { logger } from '../logger.js';
import type { MqttClient } from './mqttClient.js';
import {
  sanitizeForMqtt,
  discoveryTopic,
  availabilityTopic,
  buildRoomDeviceBlock,
  buildBinarySensorDiscovery,
  buildSensorDiscovery,
} from './discoveryPayload.js';
import {
  generateTemplate,
  generateMaxTargetCountTemplate,
  type AggregationMode,
} from './templateGenerator.js';

const log = logger.child({ module: 'room-device-service' });

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
    const { roomId, roomName, zones } = descriptor;
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;
    const deviceBlock = buildRoomDeviceBlock(roomId, roomName);

    log.info(
      { roomId, sanitizedRoomId, roomName, zoneCount: zones.length },
      'Creating room device via MQTT discovery',
    );

    // 1. Publish availability: 'online'
    const availTopic = availabilityTopic(sanitizedRoomId);
    await this.mqtt.publish(availTopic, 'online', true);
    log.debug({ topic: availTopic }, 'Published availability online');

    // 2. For each zone, publish binary_sensor (occupancy) + sensor (target count)
    for (const zone of zones) {
      const { zoneIndex, zoneName, aggregationMode, coveringSensorEntities } = zone;

      // --- Binary sensor (occupancy) ---
      const bsObjectId = `zone_${zoneIndex}_occupancy`;
      const bsUniqueId = `${nodeId}_${bsObjectId}`;
      // For no_change_on_tie mode, the self entity needs to be the binary_sensor's
      // HA entity_id. HA derives it as binary_sensor.<unique_id>.
      const selfEntityId = `binary_sensor.${bsUniqueId}`;

      const occupancyTemplate = generateTemplate(
        aggregationMode,
        coveringSensorEntities.occupancy,
        aggregationMode === 'no_change_on_tie' ? selfEntityId : undefined,
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

    const topicCount = 1 + zones.length * 2; // availability + (bs + sensor) per zone
    log.info(
      { roomId, sanitizedRoomId, zoneCount: zones.length, topicCount },
      'Room device created',
    );
  }

  /**
   * Remove a virtual room device by publishing empty payloads to all
   * config topics (clears retained messages) then removing availability.
   */
  async removeRoomDevice(roomId: string, zoneCount: number): Promise<void> {
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;

    log.info(
      { roomId, sanitizedRoomId, zoneCount },
      'Removing room device via MQTT discovery',
    );

    // Publish empty payloads to each entity config topic
    for (let i = 0; i < zoneCount; i++) {
      const bsObjectId = `zone_${i}_occupancy`;
      const bsTopic = discoveryTopic('binary_sensor', nodeId, bsObjectId);
      await this.mqtt.publish(bsTopic, '', true);

      const sObjectId = `zone_${i}_target_count`;
      const sTopic = discoveryTopic('sensor', nodeId, sObjectId);
      await this.mqtt.publish(sTopic, '', true);
    }

    // Remove availability last
    const availTopic = availabilityTopic(sanitizedRoomId);
    await this.mqtt.publish(availTopic, '', true);

    log.info(
      { roomId, sanitizedRoomId, zoneCount, topicCount: 1 + zoneCount * 2 },
      'Room device removed',
    );
  }

  /**
   * Return all MQTT topics that createRoomDevice/removeRoomDevice would
   * publish to. Useful for debugging and inspection.
   */
  getDiscoveryTopics(roomId: string, zoneCount: number): string[] {
    const sanitizedRoomId = sanitizeForMqtt(roomId);
    const nodeId = `ep_room_${sanitizedRoomId}`;
    const topics: string[] = [];

    // Availability topic
    topics.push(availabilityTopic(sanitizedRoomId));

    // Per-zone entity config topics
    for (let i = 0; i < zoneCount; i++) {
      topics.push(discoveryTopic('binary_sensor', nodeId, `zone_${i}_occupancy`));
      topics.push(discoveryTopic('sensor', nodeId, `zone_${i}_target_count`));
    }

    return topics;
  }
}
