import { describe, expect, it } from 'vitest';
import { DEFAULT_TOAST_DURATION, MAX_TOASTS, toast, useToastStore } from './useToastStore';

describe('useToastStore', () => {
  it('thêm toast với giá trị mặc định và đóng theo id', () => {
    const id = toast({ title: 'Xin chào' });
    const [item] = useToastStore.getState().toasts;
    expect(item).toMatchObject({
      id,
      title: 'Xin chào',
      variant: 'info',
      duration: DEFAULT_TOAST_DURATION,
    });

    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it(`giới hạn tối đa ${MAX_TOASTS} toast, giữ các toast mới nhất`, () => {
    for (let i = 0; i < MAX_TOASTS + 2; i += 1) toast({ title: `t${i}` });
    const titles = useToastStore.getState().toasts.map((t) => t.title);
    expect(titles).toHaveLength(MAX_TOASTS);
    expect(titles.at(-1)).toBe(`t${MAX_TOASTS + 1}`);
  });
});
