import { useT } from '@/i18n';
import type { EnvironmentPresetId } from '@/scene/Environment';
import { TankScene } from '@/scene/TankScene';
import { useViewerStore, type Environment } from '@/stores/useViewerStore';

/**
 * Cảnh 3D chỉ có hai preset ánh sáng; ánh xạ môi trường của app (chọn ở BottomToolbar) sang preset gần nhất.
 */
const SCENE_ENVIRONMENT: Readonly<Record<Environment, EnvironmentPresetId>> = {
  studio: 'hangar',
  night: 'hangar',
  desert: 'daylight',
  forest: 'daylight',
};

/**
 * Khung nhìn trung tâm: canvas R3F hiển thị xe tăng procedural.
 * Export default để dùng với React.lazy.
 */
export default function Viewport() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const environment = useViewerStore((s) => s.environment);
  const displayMode = useViewerStore((s) => s.displayMode);

  return (
    <section
      aria-label={t.viewport.label}
      // Canvas 3D trong vùng này được dùng để chụp thumbnail thiết kế.
      data-design-thumbnail=""
      className="relative h-full w-full overflow-hidden bg-gunmetal-950">
      <TankScene environment={SCENE_ENVIRONMENT[environment]} showToolbar={false} useGlb />

      <dl className="pointer-events-none absolute left-3 top-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 rounded border border-gunmetal-700 bg-gunmetal-900/80 px-3 py-2 font-mono text-[11px] backdrop-blur">
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
