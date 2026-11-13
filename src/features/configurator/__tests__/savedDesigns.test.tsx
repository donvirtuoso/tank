import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  SavedDesignsButton,
  SavedDesignsDialog,
  THUMBNAIL_CANVAS_ATTR,
  UnsavedChangesGuard,
  findThumbnailCanvas,
} from '../SavedDesignsDialog';
import { createDefaultConfiguration } from '@/domain/defaultConfiguration';
import { SCHEMA_VERSION } from '@/domain/models/types';
import { DESIGNS_STORAGE_KEY } from '@/services/designRepository';
import { serializeDesign } from '@/services/importExport';
import { useSavedDesignsStore } from '@/stores/useSavedDesignsStore';
import { useVehicleStore, variantInSlot } from '@/stores/useVehicleStore';

const vehicle = () => useVehicleStore.getState();
const saved = () => useSavedDesignsStore.getState();

function fileOf(content: string, size = content.length): File {
  return { name: 'design.json', size, text: async () => content } as unknown as File;
}

async function importFile(file: File) {
  const input = screen.getByTestId('import-input');
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vehicle().reset();
  useSavedDesignsStore.setState({ designs: [], currentId: null, error: null });
});
afterEach(() => window.localStorage.clear());

const renderDialog = () => {
  const onClose = vi.fn();
  render(<SavedDesignsDialog onClose={onClose} getCanvas={() => null} />);
  return { onClose };
};

describe('SavedDesignsDialog', () => {
  it('saves the current design to localStorage and lists it', async () => {
    renderDialog();
    expect(screen.getByText('Chưa có thiết kế nào được lưu.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tên thiết kế'), { target: { value: 'Xe của tôi' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    });
    expect(screen.getByTestId('design-name').textContent).toMatch(/Xe của tôi/);
    expect(window.localStorage.getItem(DESIGNS_STORAGE_KEY)).toContain('Xe của tôi');
  });

  it('opens a design directly when clean; asks for confirmation when dirty', async () => {
    const design = saved().saveAs('A')!;
    vehicle().reset();
    renderDialog();
    act(() => {
      vehicle().applyChange('barrel', 'barrel-long');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mở: A' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm.textContent).toMatch(/chưa lưu/);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Huỷ' }));
    expect(variantInSlot(vehicle().configuration, 'barrel')).toBe('barrel-long');

    fireEvent.click(screen.getByRole('button', { name: 'Mở: A' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bỏ thay đổi' }));
    expect(variantInSlot(vehicle().configuration, 'barrel')).toBe('barrel-medium');
    expect(saved().currentId).toBe(design.id);
  });

  it('asks for confirmation before reset', () => {
    renderDialog();
    act(() => {
      vehicle().applyChange('barrel', 'barrel-long');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm.textContent).toMatch(/Đặt lại về cấu hình mặc định/);
    expect(variantInSlot(vehicle().configuration, 'barrel')).toBe('barrel-long');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Đặt lại' }));
    expect(vehicle().configuration).toEqual(createDefaultConfiguration());
  });

  it('renames, duplicates and deletes (with confirmation)', () => {
    saved().saveAs('A');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi tên: A' }));
    const input = screen.getAllByLabelText('Tên thiết kế').at(-1)!;
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(saved().designs[0]?.name).toBe('B');

    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản: B' }));
    expect(saved().designs.map((d) => d.name).sort()).toEqual(['B', 'B (bản sao)']);

    fireEvent.click(screen.getByRole('button', { name: 'Xoá: B (bản sao)' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xoá' }));
    expect(saved().designs.map((d) => d.name)).toEqual(['B']);
  });

  it('imports valid JSON', async () => {
    renderDialog();
    const design = {
      schemaVersion: SCHEMA_VERSION,
      id: 'imported',
      name: 'Nhập vào',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configuration: createDefaultConfiguration(),
    };
    await importFile(fileOf(serializeDesign(design)));
    await waitFor(() => expect(saved().designs.map((d) => d.id)).toEqual(['imported']));
    expect(screen.queryByTestId('import-errors')).toBeNull();
  });

  it('rejects invalid JSON and shows errors by path', async () => {
    renderDialog();
    const bad = { ...createDefaultConfiguration(), name: '' };
    await importFile(fileOf(JSON.stringify(bad)));
    const errors = await screen.findByTestId('import-errors');
    expect(errors.textContent).toMatch(/name/);
    expect(saved().designs).toHaveLength(0);
  });

  it('replaces missing variants with defaults and shows a warning', async () => {
    renderDialog();
    const config = createDefaultConfiguration();
    config.instances = config.instances.map((i) => (i.slotId === 'turret' ? { ...i, variantId: 'turret-x' } : i));
    await importFile(fileOf(JSON.stringify(config)));
    const warnings = await screen.findByTestId('import-warnings');
    expect(warnings.textContent).toMatch(/turret-x/);
    expect(warnings.textContent).toMatch(/configuration\.instances\[\d+\]\.variantId/);
    expect(variantInSlot(saved().designs[0]!.configuration, 'turret')).toBe('turret-medium-cast');
  });

  it('Escape closes the confirmation first, then the dialog', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('findThumbnailCanvas', () => {
  it('picks the canvas inside the marked 3D viewport, not the first canvas on the page', () => {
    const root = document.createElement('div');
    root.innerHTML = `<canvas id="chart"></canvas><section ${THUMBNAIL_CANVAS_ATTR}=""><canvas id="scene"></canvas></section>`;
    expect(findThumbnailCanvas(root)?.id).toBe('scene');
  });

  it('returns null rather than an unrelated canvas', () => {
    const root = document.createElement('div');
    root.innerHTML = '<canvas id="chart"></canvas>';
    expect(findThumbnailCanvas(root)).toBeNull();
  });
});

describe('SavedDesignsButton', () => {
  it('opens and closes the dialog; marks unsaved changes', () => {
    render(<SavedDesignsButton />);
    const button = screen.getByRole('button', { name: 'Lưu / mở thiết kế' });
    act(() => {
      vehicle().applyChange('barrel', 'barrel-long');
    });
    expect(button.getAttribute('aria-label')).toBe('Lưu / mở thiết kế (có thay đổi chưa lưu)');
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Thiết kế đã lưu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the dialog itself does not install a beforeunload listener', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderDialog();
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);
    add.mockRestore();
  });
});

describe('UnsavedChangesGuard', () => {
  it('blocks unload while there are unsaved changes', () => {
    const { unmount } = render(<UnsavedChangesGuard />);
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);
    act(() => {
      vehicle().applyChange('barrel', 'barrel-long');
    });
    expect(fire()).toBe(true);
    unmount();
    expect(fire()).toBe(false);
  });
});
