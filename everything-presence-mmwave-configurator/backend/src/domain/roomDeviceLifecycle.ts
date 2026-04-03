/**
 * Room Device Lifecycle Orchestrator
 *
 * Bridges zone assignment results (S03) with RoomDeviceService (S02).
 * Takes a RoomConfig + ZoneAssignment[], resolves per-device zone entity IDs,
 * builds a RoomDeviceDescriptor, and calls createRoomDevice/removeRoomDevice.
 *
 * Room-level "occupied" binary sensor is created as a HA template helper
 * (not MQTT discovery) and attached to the MQTT room virtual device.
 *
 * Pure functions for descriptor building; thin async wrappers for HA interaction.
 */

import type { RoomConfig, Zone } from './types.js';
import type { ZoneAssignment, SlotId } from './zoneAssignment.js';
import type { RoomDeviceService, RoomDeviceDescriptor } from '../ha/roomDeviceService.js';
import { generateHelperTemplate, type AggregationMode } from '../ha/templateGenerator.js';
import type { HaHelperService } from '../ha/haHelperService.js';
import type { IHaReadTransport } from '../ha/readTransport.js';
import { sanitizeForMqtt } from '../ha/discoveryPayload.js';
import { storage } from '../config/storage.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'room-device-lifecycle' });

// ─────────────────────────────────────────────────────────────────
// Dependency interfaces
// ─────────────────────────────────────────────────────────────────

/** Minimal entity resolution interface — subset of DeviceEntityService. */
export interface IEntityResolver {
  getEntityId(deviceId: string, entityKey: string): string | null;
}

/** Dependencies for lifecycle operations. */
export interface RoomDeviceLifecycleDeps {
  roomDeviceService: RoomDeviceService;
  entityResolver: IEntityResolver;
  /** Optional — needed for creating room-level occupied helper via HA API. */
  haHelperService?: HaHelperService;
  /** Optional — needed for device registry lookup when creating helpers. */
  readTransport?: IHaReadTransport;
}

// ─────────────────────────────────────────────────────────────────
// Slot → entity key derivation
// ─────────────────────────────────────────────────────────────────

/**
 * Derive occupancy and target-count entity keys from a device slot ID.
 * Returns null for slot types that don't have occupancy entities
 * (exclusion/entry zones).
 *
 * Slot IDs are 1-based (zone1, zone2, ...) matching device profile convention.
 * Entity keys follow the pattern: zone1Occupancy, zone1TargetCount.
 */
export function deriveEntityKeys(
  slotId: SlotId,
): { occupancyKey: string; targetCountKey: string } | null {
  // Only regular zone slots (zone1–zone4) have occupancy/target-count entities.
  // Exclusion and entry slots do not.
  if (!slotId.startsWith('zone')) {
    return null;
  }

  // slotId is e.g. "zone1", "zone2" — extract the number suffix
  const slotNumber = slotId.slice(4); // "1", "2", etc.
  return {
    occupancyKey: `zone${slotNumber}Occupancy`,
    targetCountKey: `zone${slotNumber}TargetCount`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Descriptor builder (pure)
// ─────────────────────────────────────────────────────────────────

/**
 * Build a RoomDeviceDescriptor from room config + zone assignments.
 *
 * Groups assignments by room zoneId, resolves entity IDs for each
 * covering sensor, and produces the descriptor consumed by
 * RoomDeviceService.createRoomDevice().
 *
 * Room zone indices in the descriptor are 0-based (matching S02
 * convention where zone_0_occupancy is the first room zone).
 *
 * @returns descriptor and any warnings from entity resolution
 */
export function buildRoomDeviceDescriptor(
  room: RoomConfig,
  assignments: ZoneAssignment[],
  entityResolver: IEntityResolver,
): { descriptor: RoomDeviceDescriptor; warnings: string[] } {
  const warnings: string[] = [];
  const zones = room.zones ?? [];
  const sensors = room.sensors ?? [];

  // ── Room-level occupancy (always when sensors exist) ──
  let roomOccupancy: RoomDeviceDescriptor['roomOccupancy'] = undefined;
  if (sensors.length > 0) {
    const sensorOccupancyIds: string[] = [];
    for (const sensor of sensors) {
      const entityId = entityResolver.getEntityId(sensor.deviceId, 'presence');
      if (entityId) {
        sensorOccupancyIds.push(entityId);
      } else {
        warnings.push(
          `Sensor ${sensor.deviceId}: no entity mapping for 'presence' — excluded from room-level occupancy`,
        );
      }
    }
    if (sensorOccupancyIds.length > 0) {
      roomOccupancy = {
        sensorEntityIds: sensorOccupancyIds,
        aggregationMode: room.aggregationMode ?? 'or',
      };
    }
  }

  // ── Zone-level entities ──

  // Build a map: zoneId → zone index (0-based, by position in room.zones)
  const zoneIndexMap = new Map<string, number>();
  const zoneMap = new Map<string, Zone>();
  for (let i = 0; i < zones.length; i++) {
    zoneIndexMap.set(zones[i].id, i);
    zoneMap.set(zones[i].id, zones[i]);
  }

  // Group assignments by room zoneId
  const assignmentsByZone = new Map<string, ZoneAssignment[]>();
  for (const assignment of assignments) {
    const existing = assignmentsByZone.get(assignment.zoneId) ?? [];
    existing.push(assignment);
    assignmentsByZone.set(assignment.zoneId, existing);
  }

  // Build descriptor zones
  const descriptorZones: RoomDeviceDescriptor['zones'] = [];

  for (const zone of zones) {
    const zoneAssignments = assignmentsByZone.get(zone.id);
    if (!zoneAssignments || zoneAssignments.length === 0) {
      // No sensors assigned to this zone — skip it in the descriptor
      continue;
    }

    const zoneIndex = zoneIndexMap.get(zone.id)!;
    const occupancyEntities: string[] = [];
    const targetCountEntities: string[] = [];

    for (const assignment of zoneAssignments) {
      const keys = deriveEntityKeys(assignment.slotId);
      if (!keys) {
        // Exclusion/entry slot — no occupancy entities, skip silently
        continue;
      }

      const occupancyEntityId = entityResolver.getEntityId(
        assignment.sensorDeviceId,
        keys.occupancyKey,
      );
      const targetCountEntityId = entityResolver.getEntityId(
        assignment.sensorDeviceId,
        keys.targetCountKey,
      );

      if (!occupancyEntityId) {
        warnings.push(
          `Sensor ${assignment.sensorDeviceId}: no entity mapping for ${keys.occupancyKey} — skipping occupancy for zone "${zone.id}"`,
        );
      } else {
        occupancyEntities.push(occupancyEntityId);
      }

      if (!targetCountEntityId) {
        warnings.push(
          `Sensor ${assignment.sensorDeviceId}: no entity mapping for ${keys.targetCountKey} — skipping target count for zone "${zone.id}"`,
        );
      } else {
        targetCountEntities.push(targetCountEntityId);
      }
    }

    // Only include zone if at least one entity was resolved
    if (occupancyEntities.length === 0 && targetCountEntities.length === 0) {
      warnings.push(
        `Zone "${zone.id}": no entities resolved from any covering sensor — omitted from descriptor`,
      );
      continue;
    }

    const aggregationMode: AggregationMode = zone.aggregationMode ?? 'or';

    descriptorZones.push({
      zoneId: zone.id,
      zoneName: zone.label ?? zone.id,
      zoneIndex,
      aggregationMode,
      coveringSensorEntities: {
        occupancy: occupancyEntities,
        targetCount: targetCountEntities,
      },
    });
  }

  return {
    descriptor: {
      roomId: room.id,
      roomName: room.name,
      roomOccupancy,
      zones: descriptorZones,
    },
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────
// Lifecycle operations (async, side-effecting)
// ─────────────────────────────────────────────────────────────────

/**
 * Create or update a virtual HA room device from room config + assignments.
 *
 * Builds the descriptor, skips if no zones have covering entities,
 * then publishes via RoomDeviceService. Re-publishing with the same
 * roomId updates the existing device.
 *
 * Also creates/updates the room-level "occupied" template helper via
 * the HA config flow API, attaching it to the MQTT room device.
 */
export async function createOrUpdateRoomDevice(
  room: RoomConfig,
  assignments: ZoneAssignment[],
  deps: RoomDeviceLifecycleDeps,
): Promise<{ created: boolean; warnings: string[] }> {
  const { descriptor, warnings } = buildRoomDeviceDescriptor(
    room,
    assignments,
    deps.entityResolver,
  );

  if (descriptor.zones.length === 0 && !descriptor.roomOccupancy) {
    log.warn(
      { roomId: room.id, warningCount: warnings.length },
      'No zones with covering entities and no sensors — skipping room device creation',
    );
    return { created: false, warnings };
  }

  log.info(
    {
      roomId: room.id,
      zoneCount: descriptor.zones.length,
      warningCount: warnings.length,
    },
    'Creating/updating room device',
  );

  await deps.roomDeviceService.createRoomDevice(descriptor);

  // ── Room-level occupied template helper ──
  if (descriptor.roomOccupancy && deps.haHelperService && deps.readTransport) {
    try {
      await createOrUpdateOccupancyHelper(room, descriptor, deps);
    } catch (err) {
      // Non-fatal — MQTT device and zone entities are already created
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Room occupied helper creation failed: ${msg}`);
      log.error({ err, roomId: room.id }, 'Failed to create/update room occupied helper');
    }
  } else if (descriptor.roomOccupancy && !deps.haHelperService) {
    warnings.push('Room occupied helper skipped — haHelperService not available');
  }

  return { created: true, warnings };
}

/**
 * Create or update the room-level "occupied" template binary sensor helper.
 *
 * - Looks up the MQTT room device in the HA device registry
 * - Generates a helper-compatible Jinja2 template (true/false output)
 * - Creates a new template helper via config flow, or updates existing one
 * - Stores the config entry ID on the room config for future management
 */
async function createOrUpdateOccupancyHelper(
  room: RoomConfig,
  descriptor: RoomDeviceDescriptor,
  deps: RoomDeviceLifecycleDeps,
): Promise<void> {
  const { haHelperService, readTransport } = deps;
  if (!haHelperService || !readTransport || !descriptor.roomOccupancy) return;

  const sanitizedRoomId = sanitizeForMqtt(room.id);
  const roomOcc = descriptor.roomOccupancy;

  // Find the HA device registry ID for this MQTT room device
  const haDeviceId = await haHelperService.findRoomDeviceId(sanitizedRoomId, readTransport);
  if (!haDeviceId) {
    log.warn(
      { roomId: room.id, sanitizedRoomId },
      'Cannot create occupied helper — room device not found in HA device registry (may need a moment to register)',
    );
    return;
  }

  // Generate the helper-compatible template (true/false output)
  const helperName = `${room.name} Occupied`;
  // For majority mode with even sensor count, the self entity ID is needed for tie-break
  const selfEntityId = `binary_sensor.${helperName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  const stateTemplate = generateHelperTemplate(
    roomOcc.aggregationMode,
    roomOcc.sensorEntityIds,
    roomOcc.aggregationMode === 'majority' ? selfEntityId : undefined,
  );

  const existingEntryId = room.occupancyHelperConfigEntryId;

  if (existingEntryId) {
    // Update existing helper
    log.info(
      { roomId: room.id, configEntryId: existingEntryId },
      'Updating existing room occupied helper',
    );
    await haHelperService.updateTemplateBinarySensor({
      configEntryId: existingEntryId,
      stateTemplate,
      deviceId: haDeviceId,
    });
  } else {
    // Create new helper
    const result = await haHelperService.createTemplateBinarySensor({
      name: helperName,
      stateTemplate,
      deviceClass: 'occupancy',
      deviceId: haDeviceId,
    });

    // Persist the config entry ID on the room for future updates/deletion
    const updatedRoom: RoomConfig = {
      ...room,
      occupancyHelperConfigEntryId: result.configEntryId,
    };
    storage.saveRoom(updatedRoom);

    log.info(
      { roomId: room.id, configEntryId: result.configEntryId, entityId: result.entityId },
      'Room occupied helper created and config entry ID stored',
    );
  }
}

/**
 * Remove a virtual HA room device for the given room.
 * Publishes empty MQTT discovery payloads to clear retained messages.
 * Also deletes the room-level occupied template helper if one exists.
 */
export async function removeRoomDevice(
  room: RoomConfig,
  deps: { roomDeviceService: RoomDeviceService; haHelperService?: HaHelperService },
): Promise<void> {
  const zoneCount = (room.zones ?? []).length;
  const hasSensors = (room.sensors ?? []).length > 0;

  log.info(
    { roomId: room.id, zoneCount, hasSensors },
    'Removing room device',
  );

  // Delete the template helper first (before MQTT cleanup)
  if (room.occupancyHelperConfigEntryId && deps.haHelperService) {
    try {
      await deps.haHelperService.deleteTemplateBinarySensor(room.occupancyHelperConfigEntryId);
      // Clear the stored config entry ID
      const updatedRoom: RoomConfig = { ...room };
      delete updatedRoom.occupancyHelperConfigEntryId;
      storage.saveRoom(updatedRoom);
      log.info(
        { roomId: room.id, configEntryId: room.occupancyHelperConfigEntryId },
        'Room occupied helper deleted',
      );
    } catch (err) {
      log.warn(
        { err, roomId: room.id, configEntryId: room.occupancyHelperConfigEntryId },
        'Failed to delete room occupied helper — continuing with MQTT cleanup',
      );
    }
  }

  await deps.roomDeviceService.removeRoomDevice(room.id, zoneCount, hasSensors);
}
