import React from 'react';

export type EditorSection = 'walls' | 'devices' | 'zones' | 'doors' | 'furniture' | 'settings';

interface SectionDef {
  id: EditorSection;
  icon: string;
  label: string;
  /** Show a subtle badge (e.g. count or status) */
  badge?: string;
  /** Dim this section when it's not applicable */
  disabled?: boolean;
  disabledHint?: string;
}

interface EditorSidebarProps {
  sections: SectionDef[];
  activeSection: EditorSection | null;
  onSectionClick: (section: EditorSection) => void;
  onBack: () => void;
}

/**
 * Vertical sidebar for the room editor.
 * Shows a list of section buttons — clicking one opens the corresponding
 * PopOutPanel and collapses any other. Back button at top returns to dashboard.
 */
export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  sections,
  activeSection,
  onSectionClick,
  onBack,
}) => {
  return (
    <div className="absolute top-0 left-0 bottom-0 z-40 w-20 flex flex-col border-r border-slate-700/50 bg-slate-900/90 backdrop-blur shadow-xl">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex flex-col items-center justify-center gap-1 px-2 py-4 text-slate-400 transition-colors hover:text-white hover:bg-slate-800/60 border-b border-slate-700/50"
        title="Back to Dashboard"
      >
        <span className="text-lg">←</span>
        <span className="text-[10px] font-medium">Back</span>
      </button>

      {/* Section buttons */}
      <div className="flex-1 flex flex-col py-2 gap-1">
        {sections.map((s) => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => !s.disabled && onSectionClick(s.id)}
              disabled={s.disabled}
              title={s.disabled ? s.disabledHint : s.label}
              className={`relative flex flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-all
                ${isActive
                  ? 'text-aqua-100 bg-aqua-600/20 border-r-2 border-aqua-500'
                  : s.disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }
              `}
            >
              <span className="text-lg">{s.icon}</span>
              <span className="leading-tight">{s.label}</span>
              {s.badge && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none
                  ${isActive ? 'bg-aqua-500/30 text-aqua-200' : 'bg-slate-700 text-slate-300'}
                `}>
                  {s.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export type { SectionDef };
