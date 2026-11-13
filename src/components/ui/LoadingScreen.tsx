import { LoaderCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

interface LoadingScreenProps {
  label?: string;
  /** Phủ toàn màn hình thay vì lấp đầy vùng chứa. */
  fullscreen?: boolean;
}

export function LoadingScreen({ label, fullscreen = false }: LoadingScreenProps) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 bg-gunmetal-950 text-gunmetal-300',
        fullscreen ? 'fixed inset-0 z-50' : 'h-full w-full',
      )}
    >
      <LoaderCircle className="h-8 w-8 animate-spin text-olive-400" aria-hidden />
      <span className="text-sm tracking-wide">{label ?? t.app.loading}</span>
    </div>
  );
}
