import { create } from 'zustand';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export interface UiValues {
  locale: Locale;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  settingsOpen: boolean;
}

export interface UiState extends UiValues {
  setLocale: (locale: Locale) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  reset: () => void;
}

export const initialUiValues: UiValues = {
  locale: DEFAULT_LOCALE,
  leftPanelOpen: true,
  rightPanelOpen: true,
  settingsOpen: false,
};

export const useUiStore = create<UiState>()((set) => ({
  ...initialUiValues,
  setLocale: (locale) => set({ locale }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  reset: () => set(initialUiValues),
}));
