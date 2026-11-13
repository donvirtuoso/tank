import { Box } from 'lucide-react';
import { useT } from '@/i18n';
import { useViewerStore } from '@/stores/useViewerStore';

/**
 * Khung nhìn trung tâm. Hiện là placeholder; canvas three.js / R3F sẽ được gắn vào đây
 * ở các task sau. Export default để dùng với React.lazy.
 */
export default function Viewport() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const environment = useViewerStore((s) => s.environment);
  const displayMode = useViewerStore((s) => s.displayMode);

  return (
    <section
      aria-label={t.viewport.label}
      // Canvas 3D gắn trong vùng này sẽ được dùng để chụp thumbnail thiết kế.
      data-design-thumbnail=""
      className="viewport-grid relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <Box className="h-12 w-12 text-olive-500/70" aria-hidden />
        <p className="text-sm text-gunmetal-400">{t.viewport.placeholder}</p>
      </div>

      <dl className="absolute left-3 top-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 rounded border border-gunmetal-700 bg-gunmetal-900/80 px-3 py-2 font-mono text-[11px] backdrop-blur">
        <dt className="text-gunmetal-400">{t.viewport.mode}</dt>
        <dd className="text-olive-300">{t.modes[mode].label}</dd>
        <dt className="text-gunmetal-400">{t.viewport.environment}</dt>
        <dd className="text-gunmetal-100">{t.environments[environment]}</dd>
        <dt className="text-gunmetal-400">{t.viewport.displayMode}</dt>
        <dd className="text-gunmetal-100">{t.displayModes[displayMode]}</dd>
      </dl>
    </section>
  );
}
