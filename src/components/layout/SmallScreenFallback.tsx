import { MonitorSmartphone } from 'lucide-react';
import { format, useT } from '@/i18n';

interface SmallScreenFallbackProps {
  minWidth: number;
}

/** Màn hình thay thế khi viewport quá hẹp cho layout nhiều bảng. */
export function SmallScreenFallback({ minWidth }: SmallScreenFallbackProps) {
  const t = useT();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gunmetal-950 p-6 text-center">
      <MonitorSmartphone className="h-12 w-12 text-olive-400" aria-hidden />
      <h1 className="text-lg font-semibold text-gunmetal-50">{t.smallScreen.title}</h1>
      <p className="max-w-sm text-sm text-gunmetal-300">
        {format(t.smallScreen.message, { width: minWidth })}
      </p>
      <p className="max-w-sm text-xs text-gunmetal-400">{t.smallScreen.hint}</p>
    </div>
  );
}
