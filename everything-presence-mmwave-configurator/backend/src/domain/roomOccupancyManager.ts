/**
 * RoomOccupancyManager — subscribes to occupancy mode MQTT command topics
 * and regenerates the occupied binary sensor template when the user changes
 * the aggregation mode via the HA select entity.
 *
 * The select entity is published via MQTT discovery (see roomDeviceService)
 * and appears on the room device page. When the user picks a new option,
 * HA publishes the selected value to the command topic. This manager:
 *   1. Subscribes to `ep_room/{roomId}/occupancy_mode/set`
 *   2. On change: updates room config, regenerates template, updates HA helper
 *   3. Publishes the new state back to `ep_room/{roomId}/occupancy_mode/state`
 */

import { logger } from '../logger.js';
import { storage } from '../config/storage.js';
import { sanitizeForMqtt, stateTopic } from '../ha/discoveryPayload.js';
import { generateHelperTemplate, type AggregationMode } from '../ha/templateGenerator.js';
import type { HaHelperService } from '../ha/haHelperService.js';
import type { IHaReadTransport } from '../ha/readTransport.js';
import type { MqttClient } from '../ha/mqttClient.js';
import type { RoomConfig } from './types.js';
import { deviceEntityService } from './deviceEntityService.js';

const log = logger.child({ module: 'room-occupancy-manager' });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AGGREGATION_MODE_OPTIONS = ['Any', 'All', 'Majority'] as const;
export type AggregationModeLabel = (typeof AGGREGATION_MODE_OPTIONS)[number];

const LABEL_TO_MODE: Record<AggregationModeLabel, AggregationMode> = {
  Any: 'or',
  All: 'and',
  Majority: 'majority',
};

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class RoomOccupancyManager {
  private readonly haHelperService: HaHelperService;
  private readonly readTransport: IHaReadTransport;
  private readonly mqttClient: MqttClient;
  /** Track command topic → roomId for quick lookup. */
  private topicToRoom = new Map<string, string>();

  constructor(
    haHelperService: HaHelperService,
    readTransport: IHaReadTransport,
    mqttClient: MqttClient,
  ) {
    this.haHelperService = haHelperService;
    this.readTransport = readTransport;
    this.mqttClient = mqttClient;
  }

  /**
   * Initialize: subscribe to MQTT command topics for all rooms with sensors.
   */
  async initialize(): Promise<void> {
    const rooms = storage.listRooms();
    const roomsWithSensors = rooms.filter((r: RoomConfig) => (r.sensors?.length ?? 0) > 0);

    if (roomsWithSensors.length === 0) {
      log.info('No rooms with sensors — skipping occupancy mode subscription');
      return;
    }

    // Subscribe to command topics
    for (const room of roomsWithSensors) {
      const sanitizedId = sanitizeForMqtt(room.id);
      const cmdTopic = `ep_room/${sanitizedId}/occupancy_mode/set`;
      this.topicToRoom.set(cmdTopic, room.id);
    }

    // Subscribe to all command topics via a wildcard
    const wildcard = 'ep_room/+/occupancy_mode/set';
    await this.mqttClient.subscribe(wildcard, (topic: string, payload: Buffer) => {
      const message = payload.toString();
      this.handleModeCommand(topic, message).catch(err => {
        log.error({ err, topic, message }, 'Failed to handle occupancy mode command');
      });
    });

    log.info(
      { roomCount: roomsWithSensors.length, wildcard },
      'Room occupancy manager initialized — subscribed to mode command topics',
    );
  }

  /**
   * Handle a mode command from HA: update room config, regenerate template,
   * publish new state back.
   */
  private async handleModeCommand(topic: string, newModeLabel: string): Promise<void> {
    const roomId = this.topicToRoom.get(topic);
    if (!roomId) {
      // Unknown topic — might be a new room added since init. Try to find it.
      log.debug({ topic }, 'Mode command for untracked topic — ignoring');
      return;
    }

    const room = storage.getRoom(roomId);
    if (!room) {
      log.warn({ topic, roomId }, 'Mode command for deleted room — ignoring');
      return;
    }

    const mode = LABEL_TO_MODE[newModeLabel as AggregationModeLabel];
    if (!mode) {
      log.warn({ topic, newModeLabel }, 'Unknown aggregation mode label — ignoring');
      return;
    }

    // Skip if already the same mode
    if (room.aggregationMode === mode) {
      log.debug({ roomId: room.id, mode }, 'Mode unchanged — skipping');
      return;
    }

    log.info(
      { roomId: room.id, roomName: room.name, oldMode: room.aggregationMode, newMode: mode, label: newModeLabel },
      'Occupancy mode changed — regenerating template',
    );

    // Update room config
    const updatedRoom: RoomConfig = { ...room, aggregationMode: mode };
    storage.saveRoom(updatedRoom);

    // Publish new state back to MQTT
    const sanitizedId = sanitizeForMqtt(room.id);
    const stTopic = stateTopic(sanitizedId, 'occupancy_mode');
    await this.mqttClient.publish(stTopic, newModeLabel, true);

    // Regenerate the occupied binary sensor template
    if (!room.occupancyHelperConfigEntryId) {
      log.warn({ roomId: room.id }, 'No occupancy helper config entry — cannot update template');
      return;
    }

    // Resolve sensor entity IDs
    const sensors = room.sensors ?? [];
    const sensorOccupancyIds: string[] = [];
    for (const sensor of sensors) {
      const eid = deviceEntityService.getEntityId(sensor.deviceId, 'presence');
      if (eid) sensorOccupancyIds.push(eid);
    }

    if (sensorOccupancyIds.length === 0) {
      log.warn({ roomId: room.id }, 'No sensor entity IDs resolved — cannot update template');
      return;
    }

    // Generate new template
    const helperName = `${room.name} Occupied`;
    const selfEntityId = `binary_sensor.${helperName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    const stateTemplate = generateHelperTemplate(
      mode,
      sensorOccupancyIds,
      mode === 'majority' ? selfEntityId : undefined,
    );

    // Find device ID
    const haDeviceId = await this.haHelperService.findRoomDeviceId(sanitizedId, this.readTransport);
    if (!haDeviceId) {
      log.warn({ roomId: room.id }, 'Room device not found — cannot update template');
      return;
    }

    // Update the template helper
    await this.haHelperService.updateTemplateBinarySensor({
      configEntryId: room.occupancyHelperConfigEntryId,
      stateTemplate,
      deviceId: haDeviceId,
    });

    log.info(
      { roomId: room.id, mode, sensorCount: sensorOccupancyIds.length },
      'Occupied binary sensor template updated',
    );
  }
}
