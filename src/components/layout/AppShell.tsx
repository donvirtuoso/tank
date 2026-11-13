import { lazy, Suspense } from 'react';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useT } from '@/i18n';
import { useUiStore } from '@/stores/useUiStore';
import { BottomToolbar } from './BottomToolbar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { TopBar } from './TopBar';

// Viewport sẽ chứa canvas three.js (nặng) nên được tách chunk và tải lười.
const Viewport = lazy(() => import('./Viewport'));

/**
 * Khung bố cục chính:
 *   TopBar
 *   LeftPanel | Viewport | RightPanel
 *   BottomToolbar
 */
export function AppShell() {
  const t = useT();
  const settingsOpen = useUiStore((s) => s.settingsOpen);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gunmetal-950 text-gunmetal-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="relative min-w-0 flex-1">
          <Suspense fallback={<LoadingScreen label={t.app.loadingViewport} />}>
            <Viewport />
          </Suspense>
        </main>
        <RightPanel />
      </div>
      <BottomToolbar />
      {settingsOpen && <SettingsDialog />}
    </div>
  );
}
