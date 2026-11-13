import { describe, expect, it } from 'vitest';
import { initialViewerValues, MODES, parseMode, useViewerStore } from './useViewerStore';

describe('useViewerStore', () => {
  it('có giá trị mặc định', () => {
    const { mode, environment, displayMode } = useViewerStore.getState();
    expect({ mode, environment, displayMode }).toEqual(initialViewerValues);
    expect(mode).toBe('explore');
  });

  it('cập nhật mode, môi trường và chế độ hiển thị rồi reset', () => {
    const s = useViewerStore.getState();
    s.setMode('design');
    s.setEnvironment('night');
    s.setDisplayMode('wireframe');

    expect(useViewerStore.getState()).toMatchObject({
      mode: 'design',
      environment: 'night',
      displayMode: 'wireframe',
    });

    useViewerStore.getState().reset();
    expect(useViewerStore.getState()).toMatchObject(initialViewerValues);
  });

  it('parseMode chỉ chấp nhận 4 mode hợp lệ', () => {
    expect(MODES).toEqual(['explore', 'assembly', 'design', 'compare']);
    for (const m of MODES) expect(parseMode(m)).toBe(m);
    expect(parseMode('settings')).toBeNull();
    expect(parseMode('')).toBeNull();
    expect(parseMode(undefined)).toBeNull();
  });
});
