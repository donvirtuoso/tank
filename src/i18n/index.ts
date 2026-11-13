import { useUiStore } from '@/stores/useUiStore';
import type { Dictionary, Locale } from './config';
import { enMessages } from './en';
import { viMessages } from './vi';

export { DEFAULT_LOCALE, LOCALES } from './config';
export type { Dictionary, Locale } from './config';

export const dictionaries: Record<Locale, Dictionary> = {
  vi: viMessages,
  en: enMessages,
};

/** Trả về từ điển của ngôn ngữ hiện tại. */
export function useT(): Dictionary {
  const locale = useUiStore((s) => s.locale);
  return dictionaries[locale];
}

/** Thay `{key}` trong chuỗi bằng giá trị tương ứng; giữ nguyên placeholder không có giá trị. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}
