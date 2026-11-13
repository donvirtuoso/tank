import { Suspense, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { SmallScreenFallback } from '@/components/layout/SmallScreenFallback';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Toaster } from '@/components/ui/Toaster';
import { SavedDesignsSync, UnsavedChangesGuard } from '@/features/configurator/SavedDesignsDialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useT } from '@/i18n';
import { useUiStore } from '@/stores/useUiStore';
import { useModeRouting } from './useModeRouting';

/** Chiều rộng tối thiểu (px) để hiển thị layout đầy đủ. */
export const MIN_DESKTOP_WIDTH = 1024;
const DESKTOP_QUERY = `(min-width: ${MIN_DESKTOP_WIDTH}px)`;

export function App() {
  const t = useT();
  const locale = useUiStore((s) => s.locale);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  useModeRouting();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.app.title;
  }, [locale, t]);

  return (
    <>
      {/* Ngoài Suspense để cảnh báo rời trang luôn được cài, kể cả khi giao diện đang tải lười. */}
      <UnsavedChangesGuard />
      <SavedDesignsSync />
      <Suspense fallback={<LoadingScreen fullscreen />}>
        {isDesktop ? <AppShell /> : <SmallScreenFallback minWidth={MIN_DESKTOP_WIDTH} />}
        <Toaster />
      </Suspense>
    </>
  );
}
