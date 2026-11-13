import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedDesignsStore } from '@/stores/useSavedDesignsStore';
import { useVehicleStore, variantInSlot } from '@/stores/useVehicleStore';
import { type Mode, useViewerStore } from '@/stores/useViewerStore';
import { App } from './App';

function modeButton(name: string) {
  const nav = screen.getByRole('navigation', { name: 'Chế độ làm việc' });
  return within(nav).getByRole('button', { name });
}

describe('App', () => {
  it('hiển thị layout tiếng Việt mặc định với mode Khám phá', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Xưởng Xe Tăng' })).toBeInTheDocument();
    expect(modeButton('Khám phá')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Bộ phận' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thông tin chi tiết' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Thanh công cụ' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Khung nhìn 3D' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('vi');
  });

  const modeCases: Array<[label: string, mode: Mode, leftTitle: string]> = [
    ['Lắp ráp', 'assembly', 'Các bước lắp ráp'],
    ['Thiết kế', 'design', 'Thư viện chi tiết'],
    ['So sánh', 'compare', 'Danh sách xe'],
    ['Khám phá', 'explore', 'Bộ phận'],
  ];

  it.each(modeCases)(
    'chuyển sang mode "%s" qua TopBar',
    async (label, mode, leftTitle) => {
      const user = userEvent.setup();
      // Bắt đầu ở mode khác để luôn có thay đổi thực sự.
      useViewerStore.setState({ mode: mode === 'explore' ? 'compare' : 'explore' });
      render(<App />);

      await user.click(modeButton(label));

      expect(modeButton(label)).toHaveAttribute('aria-current', 'page');
      expect(useViewerStore.getState().mode).toBe(mode);
      expect(screen.getByRole('heading', { name: leftTitle })).toBeInTheDocument();
      expect(window.location.hash).toBe(`#/${mode}`);
    },
  );

  it('chỉ một mode được đánh dấu active', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(modeButton('Thiết kế'));

    const nav = screen.getByRole('navigation', { name: 'Chế độ làm việc' });
    const active = within(nav)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent('Thiết kế');
  });

  it('khởi động vào mode lấy từ URL hash', () => {
    window.history.replaceState(null, '', '/#/compare');
    render(<App />);
    expect(modeButton('So sánh')).toHaveAttribute('aria-current', 'page');
  });

  it('bỏ qua hash không hợp lệ và dùng mode mặc định', () => {
    window.history.replaceState(null, '', '/#/khong-ton-tai');
    render(<App />);
    expect(modeButton('Khám phá')).toHaveAttribute('aria-current', 'page');
    expect(window.location.hash).toBe('#/explore');
  });

  it('thu gọn và mở lại bảng trái', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Thu gọn bảng trái' }));
    expect(screen.queryByRole('heading', { name: 'Bộ phận' })).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: 'Mở rộng bảng trái' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');

    await user.click(expand);
    expect(screen.getByRole('heading', { name: 'Bộ phận' })).toBeInTheDocument();
  });

  it('đổi ngôn ngữ sang tiếng Anh qua Settings và hiện toast', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Mở cài đặt' }));
    const dialog = screen.getByRole('dialog', { name: 'Cài đặt' });
    await user.click(within(dialog).getByRole('radio', { name: 'English' }));

    expect(screen.getByRole('navigation', { name: 'Working mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Switched to English')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hiện toast khi đặt lại góc nhìn', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Đặt lại góc nhìn' }));
    expect(screen.getByText('Đã đặt lại góc nhìn')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText('Đã đặt lại góc nhìn')).not.toBeInTheDocument();
  });

  describe('lưu / nạp thiết kế', () => {
    beforeEach(() => {
      window.localStorage.clear();
      useVehicleStore.getState().reset();
      useSavedDesignsStore.setState({ designs: [], currentId: null, error: null });
    });
    afterEach(() => window.localStorage.clear());

    const fireBeforeUnload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it('cảnh báo khi rời trang lúc còn thay đổi chưa lưu', () => {
      const { unmount } = render(<App />);
      expect(fireBeforeUnload()).toBe(false);

      act(() => {
        useVehicleStore.getState().applyChange('barrel', 'barrel-long');
      });
      expect(fireBeforeUnload()).toBe(true);

      act(() => {
        useVehicleStore.getState().markSaved();
      });
      expect(fireBeforeUnload()).toBe(false);
      unmount();
    });

    it('mở hộp thoại thiết kế từ thanh công cụ và lưu được', async () => {
      const user = userEvent.setup();
      render(<App />);
      act(() => {
        useVehicleStore.getState().applyChange('barrel', 'barrel-long');
      });

      const toolbar = screen.getByRole('toolbar', { name: 'Thanh công cụ' });
      await user.click(within(toolbar).getByRole('button', { name: /Lưu \/ mở thiết kế/ }));
      const dialog = screen.getByRole('dialog', { name: 'Thiết kế đã lưu' });
      await user.type(within(dialog).getByLabelText('Tên thiết kế'), 'Xe App');
      await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(useSavedDesignsStore.getState().designs.map((d) => d.name)).toEqual(['Xe App']),
      );
      expect(useVehicleStore.getState().dirty).toBe(false);
      expect(fireBeforeUnload()).toBe(false);
    });

    it('khởi động lại nạp thiết kế đang mở ở phiên trước', () => {
      useVehicleStore.getState().applyChange('barrel', 'barrel-long');
      const saved = useSavedDesignsStore.getState().saveAs('Phiên trước')!;
      useVehicleStore.getState().reset();

      render(<App />);
      expect(useSavedDesignsStore.getState().currentId).toBe(saved.id);
      expect(variantInSlot(useVehicleStore.getState().configuration, 'barrel')).toBe('barrel-long');
      expect(useVehicleStore.getState().dirty).toBe(false);
    });
  });

  describe('màn hình nhỏ', () => {
    afterEach(() => {
      Reflect.deleteProperty(window, 'matchMedia');
    });

    it('hiển thị fallback khi màn hình hẹp hơn 1024px', () => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });

      render(<App />);

      expect(screen.getByRole('heading', { name: 'Màn hình quá nhỏ' })).toBeInTheDocument();
      expect(screen.getByText(/tối thiểu 1024px/)).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });
});
