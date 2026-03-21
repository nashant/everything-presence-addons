import React from 'react';

interface DevicePlacement {
  x: number;
  y: number;
  rotationDeg?: number;
}

interface DeviceEditorProps {
  deviceName: string;
  placement: DevicePlacement;
  roomCentroid?: { x: number; y: number };
  onPlacementChange: (placement: DevicePlacement) => void;
  onUnlink: () => void;
  onClose: () => void;
  onRotationCommit?: (angle: number) => void;
}

export const DeviceEditor: React.FC<DeviceEditorProps> = ({
  deviceName,
  placement,
  roomCentroid,
  onPlacementChange,
  onUnlink,
  onClose,
  onRotationCommit,
}) => {
  return (
    <div data-panel className="fixed top-14 bottom-0 right-0 z-[55] w-80 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 text-aqua-400 flex items-center justify-center text-2xl">
            📡
          </div>
          <h2 className="text-lg font-semibold text-white">{deviceName}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="space-y-2">
          <div className="font-semibold text-slate-200 text-sm">Placement</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <span className="w-6 text-xs text-slate-400">X</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1 text-sm text-slate-100 focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                value={placement.x ?? 0}
                onChange={(e) => {
                  onPlacementChange({ ...placement, x: Number(e.target.value) || 0 });
                }}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-6 text-xs text-slate-400">Y</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1 text-sm text-slate-100 focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                value={placement.y ?? 0}
                onChange={(e) => {
                  onPlacementChange({ ...placement, y: Number(e.target.value) || 0 });
                }}
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-14 text-xs text-slate-400">Rotation</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={placement.rotationDeg ?? 0}
              onChange={(e) => {
                onPlacementChange({ ...placement, rotationDeg: Number(e.target.value) || 0 });
              }}
              onMouseUp={(e) => {
                onRotationCommit?.(Number((e.currentTarget as HTMLInputElement).value) || 0);
              }}
              onTouchEnd={(e) => {
                onRotationCommit?.(Number((e.currentTarget as HTMLInputElement).value) || 0);
              }}
              className="w-full"
            />
            <span className="text-xs text-slate-300">{placement.rotationDeg ?? 0}°</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-aqua-500"
              onClick={() => {
                onPlacementChange({
                  ...placement,
                  x: roomCentroid?.x ?? 0,
                  y: roomCentroid?.y ?? 0,
                });
              }}
            >
              Center
            </button>
            <button
              className="rounded-md border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-aqua-500"
              onClick={() => {
                onPlacementChange({ ...placement, rotationDeg: 0 });
              }}
            >
              Reset rotation
            </button>
          </div>
        </div>

        {/* Unlink */}
        <button
          onClick={onUnlink}
          className="w-full rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs font-semibold text-red-300 transition-all hover:bg-red-600/20 active:scale-95"
        >
          Unlink Device
        </button>
      </div>
    </div>
  );
};
