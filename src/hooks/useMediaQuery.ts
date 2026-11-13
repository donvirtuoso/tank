import { useCallback, useSyncExternalStore } from 'react';

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Theo dõi một media query. Khi môi trường không hỗ trợ `matchMedia`
 * (SSR, jsdom) thì mặc định coi như khớp để hiển thị layout đầy đủ.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = () => (hasMatchMedia() ? window.matchMedia(query).matches : true);

  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
