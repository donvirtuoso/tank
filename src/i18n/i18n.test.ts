import { describe, expect, it } from 'vitest';
import { enMessages } from './en';
import { DEFAULT_LOCALE, dictionaries, format } from './index';
import { viMessages } from './vi';

function leafEntries(obj: object, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([key, value]): Array<[string, unknown]> =>
    typeof value === 'object' && value !== null
      ? leafEntries(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );
}

describe('i18n', () => {
  it('tiếng Việt là ngôn ngữ mặc định', () => {
    expect(DEFAULT_LOCALE).toBe('vi');
    expect(dictionaries.vi).toBe(viMessages);
    expect(dictionaries.en).toBe(enMessages);
  });

  it('vi và en có cùng bộ khoá, không có chuỗi rỗng', () => {
    const viKeys = leafEntries(viMessages).map(([k]) => k).sort();
    const enKeys = leafEntries(enMessages).map(([k]) => k).sort();
    expect(enKeys).toEqual(viKeys);

    for (const dict of [viMessages, enMessages]) {
      for (const [key, value] of leafEntries(dict)) {
        expect(typeof value, key).toBe('string');
        expect((value as string).trim(), key).not.toBe('');
      }
    }
  });

  it('format thay placeholder và giữ nguyên placeholder thiếu', () => {
    expect(format('Rộng {width}px', { width: 1024 })).toBe('Rộng 1024px');
    expect(format('{a} và {b}', { a: 'x' })).toBe('x và {b}');
  });
});
