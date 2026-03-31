/**
 * Room Zone Orchestrator: chains coverage → assignment → transform → write.
 *
 * Given a RoomConfig with sensors[] and zones[], this service:
 * 1. Resolves sensor profiles from device mappings
 * 2. Computes FOV coverage for all zone × sensor pairs
 * 3. Assigns zones to device slots via the assignment engine
 * 4. Transforms zone coordinates to each sensor's device-space
 * 5. Writes translated zones to HA entities via ZoneWriter
 *
 * All dependencies are injected for testability.
 */

import type { RoomConfig, Zone, DevicePlacement, SensorAttachment } from './types';
import type { IHaWriteClient } from '../ha/writeClient';
import type { DeviceMapping } from '../config/deviceMappingStorage';
import type { DeviceProfile, DeviceProfileLimits } from './deviceProfiles';
import {
  ZoneWriter,
  type ZoneWriteResult,
  type TranslatedZoneAssignment,
  type TranslatedZoneWriteConfig,
} from '../ha/zoneWriter';
import {
  type DeviceZone,
  isDeviceZoneRect,
  transformZoneToDeviceSpace,
} from './coordinateTransform';
import { computeAllCoverage } from './zoneCoverage';
import {
  assignZonesToDevices,
  type SensorProfile,
  type ZoneAssignment,
  type UnassignedZone,
  type SlotId,
} from './zoneAssignment';
import { isZoneRect } from './types';
import { logger } from '../logger';

// ─────────────────────────────────────────────────────────────────
// Dependency interfaces (for injection / mocking)
// ─────────────────────────────────────────────────────────────────

/** Subset of DeviceEntityService needed by the orchestrator. */
export interface IDeviceEntityService {
  getZoneEntitySet(deviceId: string, zoneType: 'regular' | 'exclusion' | 'entry', zoneIndex: number): import('./types').ZoneEntitySet | null;
  getPolygonZoneEntity(deviceId: string, zoneType: 'polygon' | 'polygonExclusion' | 'polygonEntry', zoneIndex: number): string | null;
}

/** Subset of DeviceMappingStorage needed by the orchestrator. */
export interface IDeviceMappingStorage {
  getMapping(deviceId: string): DeviceMapping | null;
}

/** Subset of DeviceProfileLoader needed by the orchestrator. */
export interface IProfileLoader {
  getProfileById(id: string): DeviceProfile | undefined;
}

// ─────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────

/** Per-device write result. */
export interface DeviceWriteResult {
  deviceId: string;
  writeResult: ZoneWriteResult;
  assignedZoneIds: string[];
}

/** Complete orchestration result. */
export interface OrchestratorResult {
  results: DeviceWriteResult[];
  unassigned: UnassignedZone[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────
// Slot parsing helper
// ─────────────────────────────────────────────────────────────────

/**
 * Parse a SlotId into its type and 1-based index.
 * e.g. "zone2" → { slotType: 'regular', slotIndex: 2 }
 *      "exclusion1" → { slotType: 'exclusion', slotIndex: 1 }
 *      "entry2" → { slotType: 'entry', slotIndex: 2 }
 */
function parseSlotId(slotId: SlotId): { slotType: 'regular' | 'exclusion' | 'entry'; slotIndex: number } {
  if (slotId.startsWith('zone')) {
    return { slotType: 'regular', slotIndex: parseInt(slotId.slice(4), 10) };
  }
  if (slotId.startsWith('exclusion')) {
    return { slotType: 'exclusion', slotIndex: parseInt(slotId.slice(9), 10) };
  }
  // entry
  return { slotType: 'entry', slotIndex: parseInt(slotId.slice(5), 10) };
}

// ─────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────

export class RoomZoneOrchestrator {
  private readonly writeClient: IHaWriteClient;
  private readonly deviceEntityService: IDeviceEntityService;
  private readonly deviceMappingStorage: IDeviceMappingStorage;
  private readonly profileLoader: IProfileLoader;

  constructor(deps: {
    writeClient: IHaWriteClient;
    deviceEntityService: IDeviceEntityService;
    deviceMappingStorage: IDeviceMappingStorage;
    profileLoader: IProfileLoader;
  }) {
    this.writeClient = deps.writeClient;
    this.deviceEntityService = deps.deviceEntityService;
    this.deviceMappingStorage = deps.deviceMappingStorage;
    this.profileLoader = deps.profileLoader;
  }

  /**
   * Build a SensorProfile from a device mapping and its profile.
   * Returns null with a warning if the sensor can't be resolved.
   */
  private resolveSensorProfile(
    sensor: SensorAttachment,
    warnings: string[],
  ): SensorProfile | null {
    const mapping = this.deviceMappingStorage.getMapping(sensor.deviceId);
    if (!mapping) {
      warnings.push(`Sensor ${sensor.deviceId}: no device mapping found — skipping`);
      return null;
    }

    const profileId = sensor.profileId ?? mapping.profileId;
    const profile = this.profileLoader.getProfileById(profileId);
    if (!profile) {
      warnings.push(`Sensor ${sensor.deviceId}: profile "${profileId}" not found — skipping`);
      return null;
    }

    const limits = profile.limits ?? {};
    const placement = sensor.placement ?? { x: 0, y: 0, rotationDeg: 0 };

    return {
      deviceId: sensor.deviceId,
      placement,
      maxZones: limits.maxZones ?? 0,
      maxExclusionZones: limits.maxExclusionZones ?? 0,
      maxEntryZones: limits.maxEntryZones ?? 0,
      fovDeg: limits.fieldOfViewDegrees ?? 120,
      maxRangeMm: (limits.maxRangeMeters ?? 6) * 1000,
    };
  }

  /**
   * Main entry point: apply room zones across all sensors.
   *
   * Pipeline: profile resolution → coverage → assignment → transform → write.
   */
  async applyRoomZones(room: RoomConfig): Promise<OrchestratorResult> {
    const sensors = room.sensors ?? [];
    const zones = room.zones ?? [];
    const warnings: string[] = [];

    // Empty room early returns
    if (zones.length === 0) {
      logger.info({ roomId: room.id }, 'No zones to apply');
      return { results: [], unassigned: [], warnings: [] };
    }

    if (sensors.length === 0) {
      logger.info({ roomId: room.id }, 'No sensors in room');
      const unassigned: UnassignedZone[] = zones.map(z => ({
        zoneId: z.id,
        reason: 'No sensors available',
      }));
      return { results: [], unassigned, warnings: [] };
    }

    // Step 1: Resolve sensor profiles
    const sensorProfiles: SensorProfile[] = [];
    for (const sensor of sensors) {
      const profile = this.resolveSensorProfile(sensor, warnings);
      if (profile) {
        sensorProfiles.push(profile);
      }
    }

    if (sensorProfiles.length === 0) {
      logger.warn({ roomId: room.id }, 'No resolvable sensor profiles — all zones unassigned');
      const unassigned: UnassignedZone[] = zones.map(z => ({
        zoneId: z.id,
        reason: 'No resolvable sensors',
      }));
      return { results: [], unassigned, warnings };
    }

    // Step 2: Compute coverage matrix
    const coverageMatrix = computeAllCoverage(
      zones,
      sensorProfiles.map(sp => ({
        placement: sp.placement,
        fovDeg: sp.fovDeg,
        maxRangeMm: sp.maxRangeMm,
      })),
    );

    // Step 3: Assign zones to device slots
    const assignmentResult = assignZonesToDevices(zones, sensorProfiles, coverageMatrix);
    warnings.push(...assignmentResult.warnings);

    // Step 4 & 5: Group assignments by device, transform, and write
    const assignmentsByDevice = new Map<string, ZoneAssignment[]>();
    for (const assignment of assignmentResult.assignments) {
      const existing = assignmentsByDevice.get(assignment.sensorDeviceId) ?? [];
      existing.push(assignment);
      assignmentsByDevice.set(assignment.sensorDeviceId, existing);
    }

    const zoneWriter = new ZoneWriter(this.writeClient);
    const results: DeviceWriteResult[] = [];

    for (const [deviceId, deviceAssignments] of assignmentsByDevice) {
      // Find the sensor profile for this device
      const sensorProfile = sensorProfiles.find(sp => sp.deviceId === deviceId);
      if (!sensorProfile) continue; // Shouldn't happen — assignments are from resolved profiles

      // Build the zone map: zoneId → Zone
      const zoneMap = new Map<string, Zone>();
      for (const z of zones) {
        zoneMap.set(z.id, z);
      }

      // Transform each assigned zone to device-space and build translated assignments
      const translatedAssignments: TranslatedZoneAssignment[] = [];
      const assignedZoneIds: string[] = [];

      for (const assignment of deviceAssignments) {
        const zone = zoneMap.get(assignment.zoneId);
        if (!zone) {
          warnings.push(`Zone "${assignment.zoneId}" not found in room zones — skipping`);
          continue;
        }

        const deviceZone = transformZoneToDeviceSpace(zone, sensorProfile.placement);
        const { slotType, slotIndex } = parseSlotId(assignment.slotId);

        translatedAssignments.push({ zone: deviceZone, slotIndex, slotType });
        assignedZoneIds.push(assignment.zoneId);
      }

      // Write to device
      const writeConfig: TranslatedZoneWriteConfig = {
        maxRegularSlots: sensorProfile.maxZones,
        maxExclusionSlots: sensorProfile.maxExclusionZones,
        maxEntrySlots: sensorProfile.maxEntryZones,
      };

      const writeResult = await zoneWriter.applyTranslatedZones(
        deviceId,
        translatedAssignments,
        writeConfig,
      );

      if (!writeResult.ok) {
        logger.warn(
          { deviceId, failures: writeResult.failures },
          'Some zone writes failed'
        );
      }

      results.push({ deviceId, writeResult, assignedZoneIds });
    }

    // Also write empty zones to sensors that got no assignments (clear all slots)
    for (const sp of sensorProfiles) {
      if (assignmentsByDevice.has(sp.deviceId)) continue;
      // Skip EP One (all-zero caps)
      if (sp.maxZones === 0 && sp.maxExclusionZones === 0 && sp.maxEntryZones === 0) continue;

      const writeConfig: TranslatedZoneWriteConfig = {
        maxRegularSlots: sp.maxZones,
        maxExclusionSlots: sp.maxExclusionZones,
        maxEntrySlots: sp.maxEntryZones,
      };

      const writeResult = await zoneWriter.applyTranslatedZones(
        sp.deviceId,
        [], // No assignments — clears all slots
        writeConfig,
      );

      results.push({ deviceId: sp.deviceId, writeResult, assignedZoneIds: [] });
    }

    logger.info(
      {
        roomId: room.id,
        devicesWritten: results.length,
        zonesAssigned: assignmentResult.assignments.length,
        zonesUnassigned: assignmentResult.unassigned.length,
        warningCount: warnings.length,
      },
      'Room zone orchestration complete'
    );

    return {
      results,
      unassigned: assignmentResult.unassigned,
      warnings,
    };
  }
}
