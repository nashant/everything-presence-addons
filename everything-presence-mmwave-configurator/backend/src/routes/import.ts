import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../config/storage';
import { Floor } from '../domain/types';
import { logger } from '../logger';
import type { IHaReadTransport } from '../ha/readTransport';

interface ImportRouterDeps {
  readTransport: IHaReadTransport;
}

export const createImportRouter = ({ readTransport }: ImportRouterDeps): Router => {
  const router = Router();

  /**
   * POST /api/import/ha
   *
   * Imports floors and areas (as rooms) from Home Assistant.
   * - Floors are matched by name (case-insensitive) — duplicates are skipped.
   * - Areas are matched by name (case-insensitive) — duplicates are skipped.
   * - Each imported area becomes a room with floorId mapped from the HA area's floor_id.
   * - Rooms are created without a deviceId (room-first flow).
   */
  router.post('/ha', async (_req, res) => {
    try {
      const [haFloors, haAreas] = await Promise.all([
        readTransport.listFloorRegistry(),
        readTransport.listAreaRegistry(),
      ]);

      logger.info(
        { haFloorCount: haFloors.length, haAreaCount: haAreas.length },
        'HA import: fetched floors and areas',
      );

      // ── Import floors ──────────────────────────────────────────────
      const existingFloors = storage.listFloors();
      const existingFloorNames = new Set(existingFloors.map((f) => f.name.toLowerCase()));

      // Map HA floor_id → local floor id (for room floorId assignment)
      const haFloorIdToLocalId = new Map<string, string>();

      const importedFloors: Floor[] = [];
      const skippedFloors: string[] = [];

      for (const haFloor of haFloors) {
        if (existingFloorNames.has(haFloor.name.toLowerCase())) {
          // Map to existing floor
          const existing = existingFloors.find(
            (f) => f.name.toLowerCase() === haFloor.name.toLowerCase(),
          );
          if (existing) {
            haFloorIdToLocalId.set(haFloor.floor_id, existing.id);
          }
          skippedFloors.push(haFloor.name);
          continue;
        }

        const floor: Floor = {
          id: uuidv4(),
          name: haFloor.name,
          level: haFloor.level ?? 0,
          icon: haFloor.icon ?? null,
        };
        storage.saveFloor(floor);
        importedFloors.push(floor);
        haFloorIdToLocalId.set(haFloor.floor_id, floor.id);
        existingFloorNames.add(floor.name.toLowerCase());
      }

      // ── Import areas as rooms ──────────────────────────────────────
      const existingRooms = storage.listRooms();
      const existingRoomNames = new Set(existingRooms.map((r) => r.name.toLowerCase()));

      const importedRooms: Array<{ id: string; name: string; floorId?: string }> = [];
      const skippedRooms: string[] = [];

      for (const area of haAreas) {
        if (existingRoomNames.has(area.name.toLowerCase())) {
          skippedRooms.push(area.name);
          continue;
        }

        const floorId = area.floor_id ? haFloorIdToLocalId.get(area.floor_id) : undefined;

        const room = {
          id: uuidv4(),
          name: area.name,
          floorId,
          units: 'metric' as const,
          zones: [],
          metadata: { haAreaId: area.area_id },
        };
        storage.saveRoom(room);
        importedRooms.push({ id: room.id, name: room.name, floorId: room.floorId });
        existingRoomNames.add(room.name.toLowerCase());
      }

      logger.info(
        {
          floorsImported: importedFloors.length,
          floorsSkipped: skippedFloors.length,
          roomsImported: importedRooms.length,
          roomsSkipped: skippedRooms.length,
        },
        'HA import complete',
      );

      res.json({
        floors: {
          imported: importedFloors.length,
          skipped: skippedFloors.length,
          items: importedFloors,
        },
        rooms: {
          imported: importedRooms.length,
          skipped: skippedRooms.length,
          items: importedRooms,
        },
      });
    } catch (err) {
      logger.error({ err }, 'HA import failed');
      res.status(500).json({ message: 'HA import failed', error: String(err) });
    }
  });

  return router;
};
