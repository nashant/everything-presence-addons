/**
 * Room Device Lifecycle Orchestrator
 *
 * Bridges zone assignment results (S03) with RoomDeviceService (S02).
 * Takes a RoomConfig + ZoneAssignment[], resolves per-device zone entity IDs,
 * builds a RoomDeviceDescriptor, and calls createRoomDevice/removeRoomDevice.
 *
 * Pure functions for descriptor building; thin async wrappers for HA interaction.
 */

import type { RoomConfig, Zone } from './types.js';
import type { ZoneAssignment, SlotId } from './zoneAssignment.js';
import type { RoomDeviceService, RoomDeviceDescriptor } from '../ha/roomDeviceService.js';
import type { AggregationMode } from '../ha/templateGenerator.js';
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

  if (descriptor.zones.length === 0) {
    log.warn(
      { roomId: room.id, warningCount: warnings.length },
      'No zones with covering entities — skipping room device creation',
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

  return { created: true, warnings };
}

/**
 * Remove a virtual HA room device for the given room.
 * Publishes empty MQTT discovery payloads to clear retained messages.
 */
export async function removeRoomDevice(
  room: RoomConfig,
  deps: { roomDeviceService: RoomDeviceService },
): Promise<void> {
  const zoneCount = (room.zones ?? []).length;

  log.info(
    { roomId: room.id, zoneCount },
    'Removing room device',
  );

  await deps.roomDeviceService.removeRoomDevice(room.id, zoneCount);
}
