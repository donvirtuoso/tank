import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useToastStore } from '@/stores/useToastStore';
import { useUiStore } from '@/stores/useUiStore';
import { useViewerStore } from '@/stores/useViewerStore';

afterEach(() => {
  cleanup();
  useViewerStore.getState().reset();
  useUiStore.getState().reset();
  useToastStore.getState().clear();
  window.history.replaceState(null, '', '/');
});
