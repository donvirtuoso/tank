import { useEffect, useMemo, useState } from 'react';
import { CompareView } from '@/features/comparison/CompareView';
import { useMechanismAnimator } from '@/features/assembly/useMechanismAnimator';
import { useT } from '@/i18n';
import type { EnvironmentPresetId } from '@/scene/Environment';
import { useSelectionHotkeys } from '@/scene/interactions/useSelectable';
import { TankScene } from '@/scene/TankScene';
import { useAssemblyStore } from '@/stores/useAssemblyStore';
import { useSceneFxStore } from '@/stores/useSceneFxStore';
import { toSceneVariant, useVehicleStore } from '@/stores/useVehicleStore';
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
 * Khung nhìn trung tâm. Chế độ So sánh hiển thị hai xe cạnh nhau; các chế độ khác hiển thị
 * cấu hình đang thiết kế (kể cả bản xem thử) và nối với panel qua `SceneRig`.
 * Export default để dùng với React.lazy.
 */
export default function Viewport() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const environment = useViewerStore((s) => s.environment);
  const displayMode = useViewerStore((s) => s.displayMode);
  const [useGlb, setUseGlb] = useState(false);

  useMechanismAnimator();
  useSelectionHotkeys(mode !== 'compare');

  // Tháo rời / mở nắp / ẩn theo hướng dẫn chỉ thuộc chế độ Lắp ráp: rời chế độ thì lắp lại nguyên xe.
  useEffect(() => {
    if (mode === 'assembly') return;
    useAssemblyStore.getState().resetAll();
    useSceneFxStore.getState().setTutorialHidden([]);
  }, [mode]);

  const configuration = useVehicleStore((s) => s.preview?.configuration ?? s.configuration);
  const variant = useMemo(() => toSceneVariant(configuration), [configuration]);

  const progress = useSceneFxStore((s) => s.progress);
  const turretYaw = useAssemblyStore((s) => s.turretYaw);
  const gunElevation = useAssemblyStore((s) => s.gunElevation);
  const articulation = useMemo(
    () => ({
      turretYaw,
      gunElevation,
      driverHatchOpen: progress.driverHatch,
      commanderHatchOpen: progress.commanderHatch,
      engineCoverOpen: progress.engineCover,
    }),
    [turretYaw, gunElevation, progress],
  );

  if (mode === 'compare') {
    return (
      <section aria-label={t.viewport.label} className="relative h-full w-full overflow-hidden bg-gunmetal-950 p-2">
        <CompareView className="flex h-full flex-col gap-2" />
      </section>
    );
  }

  return (
    <section
      aria-label={t.viewport.label}
      // Canvas 3D trong vùng này được dùng để chụp thumbnail thiết kế.
      data-design-thumbnail=""
      className="relative h-full w-full overflow-hidden bg-gunmetal-950">
      <TankScene
        environment={SCENE_ENVIRONMENT[environment]}
        variant={variant}
        articulation={articulation}
        showToolbar={false}
        interactive
        useGlb={useGlb}
      />

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 rounded border border-gunmetal-700 bg-gunmetal-900/80 px-3 py-2 font-mono text-[11px] backdrop-blur">
          <dt className="text-gunmetal-400">{t.viewport.mode}</dt>
          <dd className="text-olive-300">{t.modes[mode].label}</dd>
          <dt className="text-gunmetal-400">{t.viewport.environment}</dt>
          <dd className="text-gunmetal-100">{t.environments[environment]}</dd>
          <dt className="text-gunmetal-400">{t.viewport.displayMode}</dt>
          <dd className="text-gunmetal-100">{t.displayModes[displayMode]}</dd>
        </dl>
        <div
          role="group"
          aria-label={t.viewport.modelToggle}
          className="pointer-events-auto flex items-center gap-1 rounded border border-gunmetal-700 bg-gunmetal-900/80 p-1 text-[11px] backdrop-blur">
          <span className="px-1 text-gunmetal-400">{t.viewport.model}</span>
          {[false, true].map((glb) => (
            <button
              key={String(glb)}
              type="button"
              aria-pressed={useGlb === glb}
              onClick={() => setUseGlb(glb)}
              className={
                useGlb === glb
                  ? 'rounded bg-olive-600 px-2 py-0.5 text-gunmetal-50'
                  : 'rounded px-2 py-0.5 text-gunmetal-300 hover:bg-gunmetal-800'
              }>
              {glb ? t.viewport.modelGlb : t.viewport.modelProcedural}
            </button>
          ))}
        </div>
        {useGlb && (
          <p className="max-w-xs rounded border border-amber-700/60 bg-gunmetal-900/85 px-2 py-1 text-[11px] text-amber-200">
            {t.viewport.glbNote}
          </p>
        )}
      </div>
    </section>
  );
}
