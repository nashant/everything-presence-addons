import React from 'react';
import { Zone, ZoneRect, ZonePolygon, isZoneRect, isZonePolygon } from '../api/types';

export interface PerSensorCoverageInfo {
  id: string;
  color: string;
  label: string;
  coverage: 'full' | 'partial' | 'none';
}

interface ZoneEditorPanelProps {
  zone: Zone;
  onChange: (zone: Zone) => void;
  onDelete: () => void;
  onClose: () => void;
  onDeleteVertex?: (index: number) => void;
  coverage?: 'full' | 'partial' | 'none';
  perSensorCoverage?: PerSensorCoverageInfo[];
}

const zoneTypeLabels: Record<Zone['type'], string> = {
  regular: 'Detection',
  exclusion: 'Exclusion',
  entry: 'Entry',
};

const zoneTypeColors: Record<Zone['type'], string> = {
  regular: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  exclusion: 'bg-red-500/20 text-red-300 border-red-500/50',
  entry: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
};

type AggregationMode = 'or' | 'majority' | 'no_change_on_tie';

const aggregationModes: { value: AggregationMode; label: string }[] = [
  { value: 'or', label: 'Any (OR)' },
  { value: 'majority', label: 'Majority' },
  { value: 'no_change_on_tie', label: 'Hold on Tie' },
];

const coverageBadgeStyles: Record<'full' | 'partial' | 'none', string> = {
  full: 'bg-green-500/20 text-green-300 border-green-500/40',
  partial: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  none: 'bg-red-500/20 text-red-300 border-red-500/40',
};

export const ZoneEditorPanel: React.FC<ZoneEditorPanelProps> = ({
  zone,
  onChange,
  onDelete,
  onClose,
  onDeleteVertex,
  coverage = 'full',
  perSensorCoverage,
}) => {
  const update = (patch: Partial<Zone>) => onChange({ ...zone, ...patch } as Zone);
  const activeAggregation: AggregationMode = zone.aggregationMode ?? 'or';
  const overlapPct = Math.round((zone.overlapThreshold ?? 0.1) * 100);

  return (
    <div data-panel className="fixed top-14 bottom-0 right-0 z-[55] w-80 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📐</span>
          <h2 className="text-lg font-semibold text-white">
            {zone.label || `Zone ${zone.id.slice(0, 6)}`}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Out-of-range warning */}
        {coverage !== 'full' && (
          <div className={`rounded-lg border px-3 py-2.5 text-xs ${
            coverage === 'none'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            <div className="font-semibold mb-0.5">
              {coverage === 'none' ? '⚠ Out of sensor range' : '⚠ Partial sensor coverage'}
            </div>
            <div className="text-[11px] opacity-80">
              {coverage === 'none'
                ? 'This zone is entirely outside the sensor\'s detection area. It will not detect presence.'
                : 'Part of this zone extends beyond the sensor\'s detection range. Coverage may be unreliable in those areas.'}
            </div>
          </div>
        )}

        {/* Zone Type */}
        <div>
          <div className="text-xs font-medium text-slate-400 mb-2">Zone Type</div>
          <div className="flex gap-2">
            {(['regular', 'exclusion', 'entry'] as const).map((type) => (
              <button
                key={type}
                onClick={() => update({ type })}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                  zone.type === type
                    ? zoneTypeColors[type]
                    : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                {zoneTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div>
          <div className="text-xs font-medium text-slate-400 mb-2">Label</div>
          <input
            type="text"
            placeholder="e.g. Bed, Chair, Desk..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
            value={zone.label ?? ''}
            onChange={(e) => update({ label: e.target.value || undefined })}
          />
        </div>

        {/* Aggregation Mode */}
        <div>
          <div className="text-xs font-medium text-slate-400 mb-2">Aggregation Mode</div>
          <div className="flex gap-1.5">
            {aggregationModes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => update({ aggregationMode: value })}
                className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all ${
                  activeAggregation === value
                    ? 'border-aqua-500/60 bg-aqua-500/15 text-aqua-300'
                    : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            {activeAggregation === 'or' && 'Zone is occupied if any sensor detects presence.'}
            {activeAggregation === 'majority' && 'Zone is occupied if >50% of sensors detect presence.'}
            {activeAggregation === 'no_change_on_tie' && 'On tie, zone keeps its current state.'}
          </p>
        </div>

        {/* Overlap Threshold */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Overlap Threshold</span>
            <span className="text-xs font-mono text-aqua-300 tabular-nums">{overlapPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={overlapPct}
            onChange={(e) => update({ overlapThreshold: Number(e.target.value) / 100 })}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-aqua-500
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-aqua-400 [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-900
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-aqua-400 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-900"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Minimum vertex coverage to consider a sensor as covering this zone.
          </p>
        </div>

        {/* Per-Sensor Coverage */}
        {perSensorCoverage && perSensorCoverage.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">Per-Sensor Coverage</div>
            <div className="space-y-1.5">
              {perSensorCoverage.map((sensor) => (
                <div
                  key={sensor.id}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                    style={{ backgroundColor: sensor.color }}
                  />
                  <span className="text-xs text-slate-300 truncate flex-1">{sensor.label}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${coverageBadgeStyles[sensor.coverage]}`}
                  >
                    {sensor.coverage === 'full' ? 'Full' : sensor.coverage === 'partial' ? 'Partial' : 'None'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rectangle-specific: Position & Size */}
        {isZoneRect(zone) && (() => {
          const rect = zone as ZoneRect;
          const updateRect = (patch: Partial<ZoneRect>) => onChange({ ...rect, ...patch });
          return (
            <>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Position</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500">X (mm)</label>
                    <input type="number" className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                      value={rect.x} onChange={(e) => updateRect({ x: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Y (mm)</label>
                    <input type="number" className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                      value={rect.y} onChange={(e) => updateRect({ y: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Size</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500">Width (mm)</label>
                    <input type="number" min={100} className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                      value={rect.width} onChange={(e) => updateRect({ width: Math.max(100, Number(e.target.value)) })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Height (mm)</label>
                    <input type="number" min={100} className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 focus:outline-none"
                      value={rect.height} onChange={(e) => updateRect({ height: Math.max(100, Number(e.target.value)) })} />
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Polygon-specific: Vertex list */}
        {isZonePolygon(zone) && (() => {
          const poly = zone as ZonePolygon;
          return (
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">
                Vertices ({poly.vertices.length})
              </div>
              <div className="text-[11px] text-slate-500 mb-2">
                Drag vertices on canvas to reposition. Click edge midpoints to add vertices.
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {poly.vertices.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="w-6 text-slate-500 text-right">{i + 1}.</span>
                    <span className="flex-1 font-mono text-[11px]">({Math.round(v.x)}, {Math.round(v.y)})</span>
                    {poly.vertices.length > 3 && onDeleteVertex && (
                      <button
                        onClick={() => onDeleteVertex(i)}
                        className="text-rose-400 hover:text-rose-300 text-[10px] px-1"
                        title="Remove vertex"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Enabled toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Enabled</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={zone.enabled !== false}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-aqua-500"></div>
          </label>
        </div>
      </div>

      {/* Delete button */}
      <div className="border-t border-slate-700 p-4">
        <button
          onClick={onDelete}
          className="w-full rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-rose-600 active:scale-95"
        >
          Delete Zone
        </button>
      </div>
    </div>
  );
};
