import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ComponentTree, matchesQuery, normalizeSearch } from './ComponentTree';
import { TANK_COMPONENTS } from './__fixtures__/tankComponents';
import { initialSelectionState, useSelectionStore } from '../../stores/useSelectionStore';

const store = () => useSelectionStore.getState();
const tree = () => screen.getByRole('tree');
const item = (name: string) => within(tree()).queryByRole('button', { name });

beforeEach(() => {
  useSelectionStore.setState({ ...initialSelectionState });
});
afterEach(cleanup);

describe('search helpers', () => {
  it('ignores case and Vietnamese diacritics', () => {
    expect(normalizeSearch('Động Cơ')).toBe('dong co');
    const engine = TANK_COMPONENTS.find((c) => c.id === 'engine')!;
    expect(matchesQuery(engine, 'dong co')).toBe(true);
    expect(matchesQuery(engine, 'ENGINE')).toBe(true);
    expect(matchesQuery(engine, 'turret')).toBe(false);
  });
});

describe('ComponentTree', () => {
  it('expands/collapses nodes', () => {
    render(<ComponentTree components={TANK_COMPONENTS} />);
    expect(item('Thân xe')).toBeTruthy();
    expect(item('Tháp pháo')).toBeTruthy(); // hull mở mặc định
    expect(item('Nòng pháo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng Tháp pháo' }));
    expect(item('Nòng pháo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn Tháp pháo' }));
    expect(item('Nòng pháo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn tất cả' }));
    expect(item('Tháp pháo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả' }));
    expect(item('Bánh dẫn hướng')).toBeTruthy();
  });

  it('search shows matches with their ancestors', () => {
    render(<ComponentTree components={TANK_COMPONENTS} />);
    fireEvent.change(screen.getByLabelText('Tìm linh kiện'), { target: { value: 'banh dan' } });
    expect(item('Bánh dẫn hướng')).toBeTruthy();
    expect(item('Xích trái')).toBeTruthy();
    expect(item('Thân xe')).toBeTruthy();
    expect(item('Động cơ')).toBeNull();

    fireEvent.change(screen.getByLabelText('Tìm linh kiện'), { target: { value: 'zzz' } });
    expect(screen.getByText('Không tìm thấy linh kiện phù hợp.')).toBeTruthy();
  });

  it('filters by group', () => {
    render(<ComponentTree components={TANK_COMPONENTS} groupLabels={{ optics: 'Quang học' }} />);
    fireEvent.change(screen.getByLabelText('Lọc theo nhóm'), { target: { value: 'optics' } });
    expect(item('Kính tiềm vọng')).toBeTruthy();
    expect(item('Tháp pháo')).toBeTruthy(); // tổ tiên
    expect(item('Động cơ')).toBeNull();
    expect(screen.getByRole('option', { name: 'Quang học' })).toBeTruthy();
  });

  it('selects, hovers and marks the selected node', () => {
    render(<ComponentTree components={TANK_COMPONENTS} />);
    fireEvent.mouseEnter(item('Động cơ')!);
    expect(store().hoverId).toBe('engine');
    fireEvent.mouseLeave(item('Động cơ')!);
    expect(store().hoverId).toBeNull();
    fireEvent.click(item('Động cơ')!);
    expect(store().selectedId).toBe('engine');
    const selected = within(tree()).getAllByRole('treeitem').find((li) => li.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toContain('Động cơ');
  });

  it('toggles visibility and greys out hidden/non-isolated nodes', () => {
    render(<ComponentTree components={TANK_COMPONENTS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn Động cơ' }));
    expect(store().hidden).toEqual(['engine']);
    fireEvent.click(screen.getByRole('button', { name: 'Hiện Động cơ' }));
    expect(store().hidden).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Ẩn Tháp pháo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng Tháp pháo' }));
    const gunItem = item('Nòng pháo')!.closest('li')!;
    expect(gunItem.getAttribute('data-hidden')).toBe('true');
  });
});
