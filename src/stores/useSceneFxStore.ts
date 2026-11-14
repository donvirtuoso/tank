import { create } from 'zustand';

/** Tiến độ hoạt ảnh (0..1) của các cơ cấu xe tăng procedural. */
export interface MechanismProgress {
  driverHatch: number;
  commanderHatch: number;
  engineCover: number;
  /** Cụm động lực được nhấc ra khỏi khoang. */
  powerpack: number;
}

export interface SceneFxState {
  progress: MechanismProgress;
  /** Bộ phận chưa được lắp ở bước hướng dẫn hiện tại → ẩn trong scene. */
  tutorialHidden: string[];
  /** Hoạt ảnh "thả vào vị trí" của bước hướng dẫn. */
  dropIn: { ids: readonly string[]; startedAt: number } | null;
  setProgress: (patch: Partial<MechanismProgress>) => void;
  setTutorialHidden: (ids: string[]) => void;
  playDropIn: (ids: readonly string[]) => void;
  reset: () => void;
}

export const INITIAL_PROGRESS: MechanismProgress = { driverHatch: 0, commanderHatch: 0, engineCover: 0, powerpack: 0 };

/** Trạng thái hiệu ứng scene chỉ dùng để hiển thị (không lưu vào thiết kế). */
export const useSceneFxStore = create<SceneFxState>()((set) => ({
  progress: { ...INITIAL_PROGRESS },
  tutorialHidden: [],
  dropIn: null,
  setProgress: (patch) => set((s) => ({ progress: { ...s.progress, ...patch } })),
  setTutorialHidden: (ids) => set({ tutorialHidden: ids }),
  playDropIn: (ids) => set({ dropIn: { ids, startedAt: performance.now() } }),
  reset: () => set({ progress: { ...INITIAL_PROGRESS }, tutorialHidden: [], dropIn: null }),
}));
