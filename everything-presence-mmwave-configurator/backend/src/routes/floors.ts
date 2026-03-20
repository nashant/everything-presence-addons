import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../config/storage';
import { Floor } from '../domain/types';

export const createFloorsRouter = (): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ floors: storage.listFloors() });
  });

  router.get('/:id', (req, res) => {
    const floor = storage.getFloor(req.params.id);
    if (!floor) return res.status(404).json({ message: 'Floor not found' });
    return res.json({ floor });
  });

  router.post('/', (req, res) => {
    const { name, level, icon } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'name is required' });
    }
    const floor: Floor = {
      id: uuidv4(),
      name: name.trim(),
      level: typeof level === 'number' ? level : 0,
      icon: typeof icon === 'string' ? icon : null,
    };
    storage.saveFloor(floor);
    return res.status(201).json({ floor });
  });

  router.put('/:id', (req, res) => {
    const existing = storage.getFloor(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Floor not found' });

    const updated: Floor = {
      ...existing,
      name: typeof req.body.name === 'string' ? req.body.name.trim() : existing.name,
      level: typeof req.body.level === 'number' ? req.body.level : existing.level,
      icon: req.body.icon !== undefined ? req.body.icon : existing.icon,
    };
    storage.saveFloor(updated);
    return res.json({ floor: updated });
  });

  router.delete('/:id', (req, res) => {
    const removed = storage.deleteFloor(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Floor not found' });
    return res.json({ ok: true });
  });

  return router;
};
