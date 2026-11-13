import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { type Toast, type ToastVariant, useToastStore } from '@/stores/useToastStore';

const VARIANT_ICON: Record<ToastVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: 'border-gunmetal-600 text-gunmetal-200',
  success: 'border-olive-600 text-olive-300',
  warning: 'border-brass-500 text-brass-300',
  error: 'border-red-700 text-red-300',
};

function ToastItem({ toast }: { toast: Toast }) {
  const t = useT();
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = VARIANT_ICON[toast.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <li
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-start gap-2 rounded-md border-l-4 bg-gunmetal-800 p-3 shadow-panel',
        VARIANT_CLASS[toast.variant],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gunmetal-50">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-gunmetal-300">{toast.description}</p>}
      </div>
      <button
        type="button"
        className="rounded p-0.5 text-gunmetal-400 hover:text-gunmetal-50"
        onClick={() => dismiss(toast.id)}
        aria-label={t.toast.dismiss}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}

/** Vùng hiển thị toast (góc dưới phải). */
export function Toaster() {
  const t = useT();
  const toasts = useToastStore((s) => s.toasts);

  return (
    <section
      aria-label={t.toast.region}
      aria-live="polite"
      className="pointer-events-none fixed bottom-14 right-4 z-50 w-80"
    >
      <ol className="flex flex-col gap-2">
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </ol>
    </section>
  );
}
