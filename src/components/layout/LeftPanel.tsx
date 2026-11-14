import { useEffect } from 'react';
import { AssemblyTutorial, type TutorialStepChange } from '@/features/assembly/AssemblyTutorial';
import { DesignPanel } from '@/features/configurator/DesignPanel';
import { ComponentTree } from '@/features/viewer/ComponentTree';
import { useT } from '@/i18n';
import { TANK_CATALOG, TANK_CATALOG_EXPANDED, TANK_GROUP_LABELS, TUTORIAL_TARGETS, tutorialTargetIds } from '@/scene/tankCatalog';
import { useSceneFxStore } from '@/stores/useSceneFxStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useUiStore } from '@/stores/useUiStore';
import { useViewerStore, type Mode } from '@/stores/useViewerStore';
import { CollapsiblePanel } from './CollapsiblePanel';

export function LeftPanel() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const open = useUiStore((s) => s.leftPanelOpen);
  const toggle = useUiStore((s) => s.toggleLeftPanel);
  const copy = t.modes[mode];

  return (
    <CollapsiblePanel
      side="left"
      title={copy.leftTitle}
      open={open}
      onToggle={toggle}
      collapseLabel={t.panels.collapseLeft}
      expandLabel={t.panels.expandLeft}
    >
      <LeftContent mode={mode} empty={copy.leftEmpty} />
    </CollapsiblePanel>
  );
}

function LeftContent({ mode, empty }: { mode: Mode; empty: string }) {
  switch (mode) {
    case 'explore':
      return (
        <ComponentTree
          className="panel-raw"
          components={TANK_CATALOG}
          groupLabels={TANK_GROUP_LABELS}
          defaultExpandedIds={TANK_CATALOG_EXPANDED}
        />
      );
    case 'assembly':
      return <AssemblyGuide />;
    case 'design':
      return <DesignPanel className="text-xs" />;
    case 'compare':
      return <p className="text-xs text-gunmetal-400">{empty}</p>;
  }
}

const ALL_TUTORIAL_PARTS = Object.keys(TUTORIAL_TARGETS);

/** Hướng dẫn lắp ráp từng bước, đồng bộ bộ phận đã lắp / đang lắp với scene. */
function AssemblyGuide() {
  const locale = useUiStore((s) => s.locale);

  // Rời chế độ lắp ráp: hiện lại toàn bộ xe và bỏ chọn.
  useEffect(
    () => () => {
      useSceneFxStore.getState().setTutorialHidden([]);
      useSelectionStore.getState().clearSelection();
    },
    [],
  );

  const onHighlight = (target: string | null) => {
    const id = tutorialTargetIds(target)[0];
    const selection = useSelectionStore.getState();
    if (!id) {
      selection.clearSelection();
      return;
    }
    selection.select(id);
    selection.requestFocus(id);
  };

  const onStepChange = (change: TutorialStepChange) => {
    const assembled = new Set(change.assembledParts);
    const hidden = ALL_TUTORIAL_PARTS.filter((p) => !assembled.has(p)).flatMap((p) => [...tutorialTargetIds(p)]);
    useSceneFxStore.getState().setTutorialHidden(hidden);
  };

  const onPlayAnimation = ({ id }: { id: string }) => {
    const ids = tutorialTargetIds(id.replace(/^assemble-/, ''));
    const fx = useSceneFxStore.getState();
    fx.setTutorialHidden(fx.tutorialHidden.filter((h) => !ids.includes(h)));
    fx.playDropIn(ids);
  };

  return (
    <div className="panel-raw">
      <AssemblyTutorial
        locale={locale}
        onHighlight={onHighlight}
        onStepChange={onStepChange}
        onPlayAnimation={onPlayAnimation}
      />
    </div>
  );
}
