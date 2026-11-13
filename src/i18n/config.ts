import type { viMessages } from './vi';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

/** Cấu trúc từ điển chuẩn (lấy từ tiếng Việt). */
export type Dictionary = typeof viMessages;
