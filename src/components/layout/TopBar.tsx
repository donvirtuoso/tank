import {
  Compass,
  type LucideIcon,
  PenTool,
  Scale,
  Settings,
  Shield,
  Wrench,
} from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/useUiStore';
import { type Mode, MODES, useViewerStore } from '@/stores/useViewerStore';

const MODE_ICONS: Record<Mode, LucideIcon> = {
  explore: Compass,
  assembly: Wrench,
  design: PenTool,
  compare: Scale,
};

export function TopBar() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const openSettings = useUiStore((s) => s.openSettings);

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-4 border-b border-gunmetal-700 bg-gunmetal-900 px-3 shadow-panel">
      <div className="flex min-w-0 items-center gap-2">
        <Shield className="h-5 w-5 shrink-0 text-olive-400" aria-hidden />
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold uppercase tracking-wider text-gunmetal-50">
            {t.app.title}
          </h1>
          <p className="truncate text-[11px] text-gunmetal-400">{t.app.subtitle}</p>
        </div>
      </div>

      <nav aria-label={t.nav.label} className="mx-auto">
        <ul className="flex items-center gap-1 rounded-md border border-gunmetal-700 bg-gunmetal-950/60 p-1">
          {MODES.map((m) => {
            const Icon = MODE_ICONS[m];
            const active = m === mode;
            return (
              <li key={m}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMode(m)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-olive-700 text-olive-50 shadow-inner'
                      : 'text-gunmetal-300 hover:bg-gunmetal-800 hover:text-gunmetal-50',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{t.modes[m].label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        className="icon-btn"
        onClick={openSettings}
        aria-label={t.settings.open}
        title={t.settings.title}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
    </header>
  );
}
