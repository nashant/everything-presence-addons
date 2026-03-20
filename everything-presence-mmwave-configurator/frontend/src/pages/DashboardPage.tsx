import React, { useState, useEffect, useCallback } from 'react';
import { RoomConfig, Floor } from '../api/types';
import { fetchRooms, createRoom, deleteRoom } from '../api/rooms';
import { fetchFloors, createFloor, importFromHA, ImportResult } from '../api/floors';
import { fetchDevices } from '../api/client';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

interface DashboardPageProps {
  onNavigate?: (view: 'wizard' | 'zoneEditor' | 'roomBuilder' | 'settings' | 'liveTracking') => void;
  onRoomSelect?: (roomId: string, profileId: string | null) => void;
  onAddDevice?: (roomId: string) => void;
}

interface DeviceInfo {
  id: string;
  name: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onRoomSelect,
  onAddDevice,
}) => {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<RoomConfig[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New room form
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomFloorId, setNewRoomFloorId] = useState<string>('');

  // New floor form
  const [showNewFloor, setShowNewFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorLevel, setNewFloorLevel] = useState(0);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Collapsed floors
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [floorsRes, roomsRes, devicesRes] = await Promise.all([
        fetchFloors(),
        fetchRooms(),
        fetchDevices().catch(() => ({ devices: [] })),
      ]);
      setFloors(floorsRes.floors);
      setRooms(roomsRes.rooms);
      setDevices(devicesRes.devices.map((d: any) => ({ id: d.id, name: d.name })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      const result = await createRoom({
        name: newRoomName.trim(),
        floorId: newRoomFloorId || undefined,
        units: 'metric',
        zones: [],
      });
      setRooms((prev) => [...prev, result.room]);
      setNewRoomName('');
      setNewRoomFloorId('');
      setShowNewRoom(false);
      // Navigate to room builder to draw walls
      if (onRoomSelect) onRoomSelect(result.room.id, null);
      if (onNavigate) onNavigate('roomBuilder');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  };

  const handleCreateFloor = async () => {
    if (!newFloorName.trim()) return;
    try {
      const result = await createFloor({
        name: newFloorName.trim(),
        level: newFloorLevel,
      });
      setFloors((prev) => [...prev, result.floor].sort((a, b) => a.level - b.level));
      setNewFloorName('');
      setNewFloorLevel(0);
      setShowNewFloor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create floor');
    }
  };

  const handleImportHA = async () => {
    try {
      setImporting(true);
      setImportResult(null);
      const result = await importFromHA();
      setImportResult(result);
      // Refresh data
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from Home Assistant');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await deleteRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  const toggleFloorCollapse = (floorId: string) => {
    setCollapsedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  // Group rooms by floor
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
  const roomsByFloor = new Map<string | null, RoomConfig[]>();
  for (const room of rooms) {
    const key = room.floorId ?? null;
    if (!roomsByFloor.has(key)) roomsByFloor.set(key, []);
    roomsByFloor.get(key)!.push(room);
  }
  const unassignedRooms = roomsByFloor.get(null) ?? [];

  const getDeviceName = (deviceId?: string) => {
    if (!deviceId) return null;
    const device = devices.find((d) => d.id === deviceId);
    return device?.name ?? deviceId;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Rooms</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your rooms, floors, and device placement
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <button
              onClick={() => onNavigate?.('settings')}
              className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="glass-card p-4 border-red-500/50">
          <div className="flex items-center justify-between">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Import result banner */}
      {importResult && (
        <div className="glass-card p-4 border-emerald-500/30">
          <div className="flex items-center justify-between">
            <p className="text-emerald-400 text-sm">
              Imported {importResult.floors.imported} floor{importResult.floors.imported !== 1 ? 's' : ''}
              {importResult.floors.skipped > 0 && ` (${importResult.floors.skipped} skipped)`}
              {' and '}
              {importResult.rooms.imported} room{importResult.rooms.imported !== 1 ? 's' : ''}
              {importResult.rooms.skipped > 0 && ` (${importResult.rooms.skipped} skipped)`}
              {' from Home Assistant'}
            </p>
            <button
              onClick={() => setImportResult(null)}
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowNewRoom(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-aqua-500/20 hover:bg-aqua-500/30 text-aqua-400 border border-aqua-500/30 transition-colors"
        >
          + New Room
        </button>
        <button
          onClick={() => setShowNewFloor(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          + New Floor
        </button>
        <button
          onClick={handleImportHA}
          disabled={importing}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-colors disabled:opacity-50"
        >
          {importing ? '⏳ Importing...' : '🏠 Import from Home Assistant'}
        </button>
      </div>

      {/* New Room form */}
      {showNewRoom && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-aqua-400">Create New Room</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1">Room Name</label>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. Living Room"
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-aqua-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                autoFocus
              />
            </div>
            <div className="min-w-[180px]">
              <label className="block text-xs text-slate-400 mb-1">Floor (optional)</label>
              <select
                value={newRoomFloorId}
                onChange={(e) => setNewRoomFloorId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-aqua-500/50"
              >
                <option value="">No floor</option>
                {sortedFloors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateRoom}
                disabled={!newRoomName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-aqua-500 hover:bg-aqua-400 text-slate-950 transition-colors disabled:opacity-50"
              >
                Create & Draw Walls
              </button>
              <button
                onClick={() => {
                  setShowNewRoom(false);
                  setNewRoomName('');
                  setNewRoomFloorId('');
                }}
                className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Floor form */}
      {showNewFloor && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-aqua-400">Create New Floor</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1">Floor Name</label>
              <input
                type="text"
                value={newFloorName}
                onChange={(e) => setNewFloorName(e.target.value)}
                placeholder="e.g. Ground Floor"
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-aqua-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFloor()}
                autoFocus
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-slate-400 mb-1">Level</label>
              <input
                type="number"
                value={newFloorLevel}
                onChange={(e) => setNewFloorLevel(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-aqua-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateFloor}
                disabled={!newFloorName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-aqua-500 hover:bg-aqua-400 text-slate-950 transition-colors disabled:opacity-50"
              >
                Create Floor
              </button>
              <button
                onClick={() => {
                  setShowNewFloor(false);
                  setNewFloorName('');
                  setNewFloorLevel(0);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rooms.length === 0 && !showNewRoom && (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-4">🏠</div>
          <h2 className="text-lg font-semibold text-slate-200 mb-2">No rooms yet</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
            Create a room to get started, or import your rooms and floors from Home Assistant.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowNewRoom(true)}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-aqua-500 hover:bg-aqua-400 text-slate-950 transition-colors"
            >
              + New Room
            </button>
            <button
              onClick={handleImportHA}
              disabled={importing}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-colors disabled:opacity-50"
            >
              🏠 Import from HA
            </button>
          </div>
        </div>
      )}

      {/* Floor sections */}
      {sortedFloors.map((floor) => {
        const floorRooms = roomsByFloor.get(floor.id) ?? [];
        if (floorRooms.length === 0) return null;
        const isCollapsed = collapsedFloors.has(floor.id);

        return (
          <div key={floor.id} className="space-y-3">
            <button
              onClick={() => toggleFloorCollapse(floor.id)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <span className="text-xs text-slate-500 transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {floor.icon && <span className="mr-1">{floor.icon}</span>}
                {floor.name}
              </h2>
              <span className="text-xs text-slate-500">
                {floorRooms.length} room{floorRooms.length !== 1 ? 's' : ''}
              </span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {floorRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    deviceName={getDeviceName(room.deviceId)}
                    onNavigate={onNavigate}
                    onRoomSelect={onRoomSelect}
                    onAddDevice={onAddDevice}
                    onDelete={handleDeleteRoom}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned rooms */}
      {unassignedRooms.length > 0 && (
        <div className="space-y-3">
          {sortedFloors.length > 0 && (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Unassigned
              </h2>
              <span className="text-xs text-slate-500">
                {unassignedRooms.length} room{unassignedRooms.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unassignedRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                deviceName={getDeviceName(room.deviceId)}
                onNavigate={onNavigate}
                onRoomSelect={onRoomSelect}
                onAddDevice={onAddDevice}
                onDelete={handleDeleteRoom}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Room Card ──────────────────────────────────────────────────────

interface RoomCardProps {
  room: RoomConfig;
  deviceName: string | null;
  onNavigate?: (view: 'wizard' | 'zoneEditor' | 'roomBuilder' | 'settings' | 'liveTracking') => void;
  onRoomSelect?: (roomId: string, profileId: string | null) => void;
  onAddDevice?: (roomId: string) => void;
  onDelete?: (roomId: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({
  room,
  deviceName,
  onNavigate,
  onRoomSelect,
  onAddDevice,
  onDelete,
}) => {
  const hasDevice = Boolean(room.deviceId);
  const hasWalls = Boolean(room.roomShell?.points?.length);
  const zoneCount = room.zones?.length ?? 0;

  const handleNavigate = (view: 'roomBuilder' | 'zoneEditor' | 'liveTracking') => {
    onRoomSelect?.(room.id, room.profileId ?? null);
    onNavigate?.(view);
  };

  return (
    <div className="glass-card p-4 space-y-3 group">
      {/* Room header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{room.name}</h3>
          {hasDevice ? (
            <p className="text-xs text-slate-400 mt-0.5">
              📡 {deviceName}
            </p>
          ) : (
            <p className="text-xs text-amber-400/80 mt-0.5">No device linked</p>
          )}
        </div>
        <button
          onClick={() => onDelete?.(room.id)}
          className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm"
          title="Delete room"
        >
          🗑
        </button>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5">
        {hasWalls && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            Walls drawn
          </span>
        )}
        {!hasWalls && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
            No walls
          </span>
        )}
        {zoneCount > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
            {zoneCount} zone{zoneCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => handleNavigate('roomBuilder')}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          {hasWalls ? '✏️ Edit Room' : '📐 Draw Walls'}
        </button>
        {hasDevice ? (
          <>
            <button
              onClick={() => handleNavigate('zoneEditor')}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              📦 Zones
            </button>
            <button
              onClick={() => handleNavigate('liveTracking')}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              📍 Live
            </button>
          </>
        ) : (
          <button
            onClick={() => onAddDevice?.(room.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-aqua-500/20 hover:bg-aqua-500/30 text-aqua-400 border border-aqua-500/30 transition-colors"
          >
            + Add Device
          </button>
        )}
      </div>
    </div>
  );
};
