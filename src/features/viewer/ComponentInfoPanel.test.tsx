import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ComponentInfoPanel } from './ComponentInfoPanel';
import { ComponentTree } from './ComponentTree';
import { TANK_COMPONENTS } from './__fixtures__/tankComponents';
import { initialSelectionState, useSelectionStore } from '../../stores/useSelectionStore';
import { handleSelectionKey } from '../../scene/interactions/useSelectable';

const store = () => useSelectionStore.getState();

beforeEach(() => {
  useSelectionStore.setState({ ...initialSelectionState });
});
afterEach(cleanup);

describe('ComponentInfoPanel', () => {
  it('shows an empty state when nothing is selected', () => {
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    expect(screen.getByText(/Chọn một linh kiện/)).toBeTruthy();
  });

  it('updates correctly for every one of ≥12 parts selected via the store (raycast path)', () => {
    expect(TANK_COMPONENTS.length).toBeGreaterThanOrEqual(12);
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    for (const c of TANK_COMPONENTS) {
      act(() => store().select(c.id));
      expect(screen.getByTestId('component-name-vi').textContent).toBe(c.nameVi);
      expect(screen.getByTestId('component-name-en').textContent).toBe(c.nameEn);
    }
  });

  it('updates correctly when clicking ≥12 parts in the tree', () => {
    render(
      <>
        <ComponentTree components={TANK_COMPONENTS} />
        <ComponentInfoPanel components={TANK_COMPONENTS} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả' }));
    const tree = screen.getByRole('tree');
    let clicked = 0;
    for (const c of TANK_COMPONENTS) {
      fireEvent.click(within(tree).getByRole('button', { name: c.nameVi }));
      clicked += 1;
      expect(store().selectedId).toBe(c.id);
      expect(screen.getByTestId('component-name-vi').textContent).toBe(c.nameVi);
      expect(screen.getByTestId('component-name-en').textContent).toBe(c.nameEn);
    }
    expect(clicked).toBeGreaterThanOrEqual(12);
  });

  it('renders properties, education and related parts', () => {
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    act(() => store().select('engine'));
    expect(screen.getByText('Công suất')).toBeTruthy();
    expect(screen.getByText('840 hp')).toBeTruthy();
    expect(screen.getByTestId('component-education').textContent).toMatch(/diesel/);

    const related = screen.getByRole('region', { name: 'Linh kiện liên quan' });
    fireEvent.mouseEnter(within(related).getByRole('button', { name: 'Hộp số' }));
    expect(store().hoverId).toBe('transmission');
    fireEvent.click(within(related).getByRole('button', { name: 'Hộp số' }));
    expect(screen.getByTestId('component-name-vi').textContent).toBe('Hộp số');
  });

  it('Hide / Show / Isolate / Show related / Show all work and reset', () => {
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    act(() => store().select('engine'));

    fireEvent.click(screen.getByRole('button', { name: 'Cô lập' }));
    expect(store().isolated).toEqual(['engine']);

    fireEvent.click(screen.getByRole('button', { name: 'Hiện liên quan' }));
    expect(store().isolated).toEqual(['engine', 'transmission', 'fuel-tank']);

    fireEvent.click(screen.getByRole('button', { name: 'Hiện tất cả' }));
    expect(store().isolated).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hiện tất cả' })).toBeNull();

    // Ẩn linh kiện đang chọn sẽ bỏ chọn; chọn lại thì nút chuyển thành "Hiện".
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn' }));
    expect(store().hidden).toEqual(['engine']);
    act(() => store().select('engine'));
    fireEvent.click(screen.getByRole('button', { name: 'Hiện' }));
    expect(store().hidden).toEqual([]);
  });

  it('Focus button requests focus; Esc deselects', () => {
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    act(() => store().select('gun'));
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(store().focusRequest?.id).toBe('gun');

    act(() => {
      handleSelectionKey({ key: 'Escape', target: document.body, ctrlKey: false, metaKey: false, altKey: false });
    });
    expect(screen.getByText(/Chọn một linh kiện/)).toBeTruthy();
  });

  it('disables "Show related" for parts without relations', () => {
    render(<ComponentInfoPanel components={TANK_COMPONENTS} />);
    act(() => store().select('idler'));
    expect((screen.getByRole('button', { name: 'Hiện liên quan' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
