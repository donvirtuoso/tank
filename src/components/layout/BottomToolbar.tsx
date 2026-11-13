import { Box, Grid3x3, type LucideIcon, RotateCcw, ScanEye } from 'lucide-react';
import { useId } from 'react';
import { SavedDesignsButton } from '@/features/configurator/SavedDesignsDialog';
import { useT } from '@/i18n';
import { useToastStore } from '@/stores/useToastStore';
import {
  DISPLAY_MODES,
  type DisplayMode,
  ENVIRONMENTS,
  environmentSchema,
  useViewerStore,
} from '@/stores/useViewerStore';

const DISPLAY_ICONS: Record<DisplayMode, LucideIcon> = {
  shaded: Box,
  wireframe: Grid3x3,
  xray: ScanEye,
};

export function BottomToolbar() {
  const t = useT();
  const environmentId = useId();
  const mode = useViewerStore((s) => s.mode);
  const displayMode = useViewerStore((s) => s.displayMode);
  const setDisplayMode = useViewerStore((s) => s.setDisplayMode);
  const environment = useViewerStore((s) => s.environment);
  const setEnvironment = useViewerStore((s) => s.setEnvironment);
  const pushToast = useToastStore((s) => s.push);

  return (
    <footer
      role="toolbar"
      aria-label={t.toolbar.label}
      className="flex h-11 shrink-0 items-center gap-4 border-t border-gunmetal-700 bg-gunmetal-900 px-3"
    >
      <div role="group" aria-label={t.toolbar.displayMode} className="flex items-center gap-1">
        {DISPLAY_MODES.map((dm) => {
          const Icon = DISPLAY_ICONS[dm];
          return (
            <button
              key={dm}
              type="button"
              className="tool-btn"
              aria-pressed={dm === displayMode}
              onClick={() => setDisplayMode(dm)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.displayModes[dm]}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-gunmetal-700" aria-hidden />

      <div className="flex items-center gap-2 text-xs">
        <label htmlFor={environmentId} className="text-gunmetal-400">
          {t.toolbar.environment}
        </label>
        <select
          id={environmentId}
          value={environment}
          onChange={(e) => {
            const parsed = environmentSchema.safeParse(e.target.value);
            if (parsed.success) setEnvironment(parsed.data);
          }}
          className="h-7 rounded border border-gunmetal-600 bg-gunmetal-800 px-2 text-xs text-gunmetal-100"
        >
          {ENVIRONMENTS.map((env) => (
            <option key={env} value={env}>
              {t.environments[env]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="tool-btn"
        onClick={() => pushToast({ title: t.toolbar.viewReset, variant: 'success' })}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {t.toolbar.resetView}
      </button>

      <div className="h-5 w-px bg-gunmetal-700" aria-hidden />

      <SavedDesignsButton />

      <p className="ml-auto truncate text-xs text-gunmetal-400">{t.modes[mode].description}</p>
    </footer>
  );
}
