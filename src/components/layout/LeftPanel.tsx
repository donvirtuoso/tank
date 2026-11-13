import { useT } from '@/i18n';
import { useUiStore } from '@/stores/useUiStore';
import { useViewerStore } from '@/stores/useViewerStore';
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
      <p className="text-xs text-gunmetal-400">{copy.leftEmpty}</p>
    </CollapsiblePanel>
  );
}
