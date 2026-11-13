import { useT } from '@/i18n';
import { useUiStore } from '@/stores/useUiStore';
import { useViewerStore } from '@/stores/useViewerStore';
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
      <p className="text-xs text-gunmetal-400">{copy.rightEmpty}</p>
    </CollapsiblePanel>
  );
}
