import { AssemblyControls } from '@/features/assembly/AssemblyControls';
import { PROCEDURAL_MECHANISMS } from '@/features/assembly/useMechanismAnimator';
import { StatsPanel } from '@/features/configurator/StatsPanel';
import { ComponentInfoPanel } from '@/features/viewer/ComponentInfoPanel';
import { useT } from '@/i18n';
import { TANK_GROUP_LABELS } from '@/scene/tankCatalog';
import { useSceneCatalog } from '@/scene/useSceneCatalog';
import { useUiStore } from '@/stores/useUiStore';
import { useViewerStore, type Mode } from '@/stores/useViewerStore';
import { CollapsiblePanel } from './CollapsiblePanel';

export function RightPanel() {
  const t = useT();
  const mode = useViewerStore((s) => s.mode);
  const open = useUiStore((s) => s.rightPanelOpen);
  const toggle = useUiStore((s) => s.toggleRightPanel);
  const copy = t.modes[mode];

  return (
    <CollapsiblePanel
      side="right"
      title={copy.rightTitle}
      open={open}
      onToggle={toggle}
      collapseLabel={t.panels.collapseRight}
      expandLabel={t.panels.expandRight}
    >
      <RightContent mode={mode} empty={copy.rightEmpty} />
    </CollapsiblePanel>
  );
}

function RightContent({ mode, empty }: { mode: Mode; empty: string }) {
  const catalog = useSceneCatalog();
  switch (mode) {
    case 'explore':
      return <ComponentInfoPanel className="panel-raw" components={catalog} groupLabels={TANK_GROUP_LABELS} />;
    case 'assembly':
      return <AssemblyControls className="panel-raw assembly-controls" mechanisms={PROCEDURAL_MECHANISMS} />;
    case 'design':
      return <StatsPanel className="text-xs" />;
    case 'compare':
      return <p className="text-xs text-gunmetal-400">{empty}</p>;
  }
}
