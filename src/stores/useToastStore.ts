import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Thời gian hiển thị (ms) trước khi tự đóng. */
  duration: number;
}

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export const DEFAULT_TOAST_DURATION = 4000;
export const MAX_TOASTS = 4;

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (input) => {
    counter += 1;
    const id = `toast-${counter}`;
    const next: Toast = {
      ...input,
      id,
      variant: input.variant ?? 'info',
      duration: input.duration ?? DEFAULT_TOAST_DURATION,
    };
    set((s) => ({ toasts: [...s.toasts, next].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Tiện ích gọi toast ngoài component React. */
export function toast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
