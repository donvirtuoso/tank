import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';

interface CollapsiblePanelProps {
  side: 'left' | 'right';
  title: string;
  open: boolean;
  onToggle: () => void;
  collapseLabel: string;
  expandLabel: string;
  children: ReactNode;
}

/** Bảng bên có thể thu gọn thành một thanh hẹp. */
export function CollapsiblePanel({
  side,
  title,
  open,
  onToggle,
  collapseLabel,
  expandLabel,
  children,
}: CollapsiblePanelProps) {
  const contentId = useId();
  const isLeft = side === 'left';
  const CollapseIcon = isLeft ? PanelLeftClose : PanelRightClose;
  const ExpandIcon = isLeft ? PanelLeftOpen : PanelRightOpen;
  const toggleLabel = open ? collapseLabel : expandLabel;

  return (
    <aside
      aria-label={title}
      className={cn(
        'flex shrink-0 flex-col border-gunmetal-700 bg-gunmetal-900 transition-[width] duration-200',
        isLeft ? 'border-r' : 'border-l',
        open ? 'w-72' : 'w-10',
      )}
    >
      <div
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 border-b border-gunmetal-700 px-1.5',
          open ? 'justify-between' : 'justify-center',
          !isLeft && 'flex-row-reverse',
        )}
      >
        {open && (
          <h2 className="truncate px-1 text-xs font-semibold uppercase tracking-wider text-gunmetal-200">
            {title}
          </h2>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {open ? (
            <CollapseIcon className="h-4 w-4" aria-hidden />
          ) : (
            <ExpandIcon className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      <div id={contentId} hidden={!open} className="min-h-0 flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </aside>
  );
}
