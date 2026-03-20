import React from 'react';

interface PopOutPanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable slide-in panel for editor sections.
 * Styled to match the Zone Slots panel pattern: semi-transparent backdrop,
 * sticky header with close button, scrollable content area.
 */
export const PopOutPanel: React.FC<PopOutPanelProps> = ({
  title,
  subtitle,
  onClose,
  children,
  className = '',
}) => {
  return (
    <div
      className={`absolute top-14 right-0 bottom-0 z-50 w-96 border-l border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl animate-in slide-in-from-right-4 fade-in duration-200 overflow-y-auto ${className}`}
    >
      <div className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/90 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-700"
          >
            ✕ Close
          </button>
        </div>
        {subtitle && (
          <div className="mt-2 text-xs text-slate-400">{subtitle}</div>
        )}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
};
