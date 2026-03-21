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
      data-panel
      className={`absolute top-14 right-0 bottom-0 z-50 w-96 border-l border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl animate-in slide-in-from-right-4 fade-in duration-200 overflow-y-auto ${className}`}
    >
      <div className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/90 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
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
        {subtitle && (
          <div className="mt-2 text-xs text-slate-400">{subtitle}</div>
        )}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
};
