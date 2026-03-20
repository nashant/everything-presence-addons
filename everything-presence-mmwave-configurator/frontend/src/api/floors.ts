import { Floor } from './types';
import { ingressAware } from './client';

const handle = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
};

export const fetchFloors = async () => {
  const res = await fetch(ingressAware('api/floors'));
  return handle<{ floors: Floor[] }>(res);
};

export const createFloor = async (payload: Partial<Floor>) => {
  const res = await fetch(ingressAware('api/floors'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<{ floor: Floor }>(res);
};

export const updateFloor = async (id: string, payload: Partial<Floor>) => {
  const res = await fetch(ingressAware(`api/floors/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<{ floor: Floor }>(res);
};

export const deleteFloor = async (id: string) => {
  const res = await fetch(ingressAware(`api/floors/${id}`), {
    method: 'DELETE',
  });
  return handle<{ ok: boolean }>(res);
};

export interface ImportResult {
  floors: { imported: number; skipped: number; items: Floor[] };
  rooms: { imported: number; skipped: number; items: Array<{ id: string; name: string; floorId?: string }> };
}

export const importFromHA = async () => {
  const res = await fetch(ingressAware('api/import/ha'), {
    method: 'POST',
  });
  return handle<ImportResult>(res);
};
