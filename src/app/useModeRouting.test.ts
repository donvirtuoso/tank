import { describe, expect, it } from 'vitest';
import { hashForMode, modeFromHash } from './useModeRouting';

describe('modeFromHash', () => {
  it('đọc được các dạng hash hợp lệ', () => {
    expect(modeFromHash('#/assembly')).toBe('assembly');
    expect(modeFromHash('#design')).toBe('design');
    expect(modeFromHash(hashForMode('compare'))).toBe('compare');
  });

  it('trả null cho hash rỗng hoặc không hợp lệ', () => {
    expect(modeFromHash('')).toBeNull();
    expect(modeFromHash('#/')).toBeNull();
    expect(modeFromHash('#/unknown')).toBeNull();
  });
});
