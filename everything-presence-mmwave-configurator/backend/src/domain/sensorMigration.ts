/**
 * Startup migration: backfill sensors[] for rooms that have deviceId but no sensors array.
 */
import { storage } from '../config/storage';
import type { RoomConfig, SensorAttachment } from './types';

export interface SensorMigrationResult {
  totalRooms: number;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * For each room on disk that has a deviceId but no sensors[],
 * write sensors[0] synthesized from the legacy fields.
 * Idempotent — rooms that already have sensors[] are skipped.
 */
export function migrateSensorsArray(): SensorMigrationResult {
  const rooms = storage.listRooms();
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const room of rooms) {
    try {
      if (room.sensors && room.sensors.length > 0) {
        skippedCount++;
        continue;
      }
      if (!room.deviceId) {
        skippedCount++;
        continue;
      }

      // Synthesize sensors[0] from legacy fields
      const sensor: SensorAttachment = {
        deviceId: room.deviceId,
        profileId: room.profileId,
        placement: room.devicePlacement,
      };

      const updated: RoomConfig = {
        ...room,
        sensors: [sensor],
      };

      storage.saveRoom(updated);
      migratedCount++;
    } catch {
      errorCount++;
    }
  }

  return {
    totalRooms: rooms.length,
    migratedCount,
    skippedCount,
    errorCount,
  };
}
