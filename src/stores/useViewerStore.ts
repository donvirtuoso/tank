import { z } from 'zod';
import { create } from 'zustand';

export const MODES = ['explore', 'assembly', 'design', 'compare'] as const;
export const modeSchema = z.enum(MODES);
export type Mode = z.infer<typeof modeSchema>;

export const ENVIRONMENTS = ['studio', 'desert', 'forest', 'night'] as const;
export const environmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof environmentSchema>;

export const DISPLAY_MODES = ['shaded', 'wireframe', 'xray'] as const;
export const displayModeSchema = z.enum(DISPLAY_MODES);
export type DisplayMode = z.infer<typeof displayModeSchema>;

/** Trả về Mode hợp lệ hoặc `null` nếu giá trị không phải mode đã biết. */
export function parseMode(value: unknown): Mode | null {
  const result = modeSchema.safeParse(value);
  return result.success ? result.data : null;
}

export interface ViewerValues {
  mode: Mode;
  environment: Environment;
  displayMode: DisplayMode;
}

export interface ViewerState extends ViewerValues {
  setMode: (mode: Mode) => void;
  setEnvironment: (environment: Environment) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  reset: () => void;
}

export const initialViewerValues: ViewerValues = {
  mode: 'explore',
  environment: 'studio',
  displayMode: 'shaded',
};

export const useViewerStore = create<ViewerState>()((set) => ({
  ...initialViewerValues,
  setMode: (mode) => set({ mode }),
  setEnvironment: (environment) => set({ environment }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  reset: () => set(initialViewerValues),
}));
