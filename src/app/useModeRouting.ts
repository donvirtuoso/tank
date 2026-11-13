import { useEffect } from 'react';
import { type Mode, parseMode, useViewerStore } from '@/stores/useViewerStore';

/** Đọc mode từ hash dạng `#/assembly`; trả `null` nếu không hợp lệ. */
export function modeFromHash(hash: string): Mode | null {
  return parseMode(hash.replace(/^#\/?/, ''));
}

export function hashForMode(mode: Mode): string {
  return `#/${mode}`;
}

/**
 * Đồng bộ mode hiện tại với URL hash để có thể chia sẻ link/khởi động thẳng vào một mode.
 */
export function useModeRouting(): void {
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);

  useEffect(() => {
    const syncFromHash = () => {
      const next = modeFromHash(window.location.hash);
      if (next) setMode(next);
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [setMode]);

  useEffect(() => {
    const target = hashForMode(mode);
    if (window.location.hash !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [mode]);
}
