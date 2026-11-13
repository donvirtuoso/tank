import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BottomToolbar } from '@/components/layout/BottomToolbar';
import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import { RATING_KEYS } from '@/domain/models/types';
import { computeScore } from '@/domain/scoring/score';
import { useUiStore } from '@/stores/useUiStore';
import { swapSlot, useVehicleStore } from '@/stores/useVehicleStore';
import {
  REPORT_BODY_CLASS,
  REPORT_DISCLAIMER,
  REPORT_SECTION_IDS,
  ReportButton,
  ReportOverlay,
  ReportView,
  buildReportData,
  downloadReport,
  reportFileName,
  serializeReport,
} from './ReportView';

const SHOT = 'data:image/png;base64,iVBORw0KGgo=';
const NOW = '2026-11-14T08:00:00.000Z';

const build = (overrides: Parameters<typeof buildReportData>[2] = {}) =>
  buildReportData(createDefaultConfiguration(), defaultCatalog, { now: () => NOW, screenshotDataUrl: SHOT, ...overrides });

beforeEach(() => useVehicleStore.getState().reset());
afterEach(() => vi.restoreAllMocks());

describe('buildReportData', () => {
  it('collects the current configuration into serialisable report data', () => {
    const data = build();
    const config = createDefaultConfiguration();
    expect(data.generatedAt).toBe(NOW);
    expect(data.design).toEqual({ id: config.id, name: config.name, schemaVersion: config.schemaVersion });
    expect(data.screenshotDataUrl).toBe(SHOT);
    expect(data.parts).toHaveLength(config.instances.length);
    expect(data.summary.partCount).toBe(config.instances.length);
    expect(data.summary.valid).toBe(true);
    expect(data.ratings.simulated).toBe(true);
    expect(data.ratings.values).toEqual(computeScore(config, defaultCatalog));
    expect(data.paint?.variantId).toBe('camo-olive');
    expect(data.notes.length).toBeGreaterThan(0);
    expect(data.disclaimer).toBe(REPORT_DISCLAIMER.vi);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('localises names and reports empty slots / compatibility issues', () => {
    const config = swapSlot(createDefaultConfiguration(), 'hull', null);
    const data = buildReportData(config, defaultCatalog, { locale: 'en', now: () => NOW });
    expect(data.disclaimer).toBe(REPORT_DISCLAIMER.en);
    expect(data.emptySlots.some((s) => s.slotId === 'hull' && s.required)).toBe(true);
    expect(data.summary.valid).toBe(false);
    expect(data.compatibility.length).toBe(data.summary.issueCount);
    expect(data.parts.find((p) => p.slotId === 'turret')?.variantName).toMatch(/[A-Za-z]/);
  });

  it('drops screenshots that are not raster data URLs', () => {
    expect(build({ screenshotDataUrl: 'javascript:alert(1)' }).screenshotDataUrl).toBeNull();
  });
});

describe('ReportView', () => {
  it('renders all 12 sections and the 3D snapshot', () => {
    render(<ReportView data={build()} />);
    const sections = document.querySelectorAll('[data-report-section]');
    expect(REPORT_SECTION_IDS).toHaveLength(12);
    expect([...sections].map((s) => s.getAttribute('data-report-section'))).toEqual([...REPORT_SECTION_IDS]);
    for (const s of sections) expect(s.querySelector('h2')?.textContent).toBeTruthy();
    expect(screen.getByTestId('report-snapshot').getAttribute('src')).toBe(SHOT);
    expect(screen.getAllByTestId('report-part-row')).toHaveLength(createDefaultConfiguration().instances.length);
    for (const key of RATING_KEYS) expect(screen.getByTestId(`report-rating-${key}`)).toBeTruthy();
  });

  it('always shows the simulated-ratings disclaimer and never calls ratings real', () => {
    const { container } = render(<ReportView data={build()} />);
    expect(screen.getByTestId('report-disclaimer').textContent).toBe(REPORT_DISCLAIMER.vi);
    expect(screen.getByTestId('report-disclaimer-top').textContent).toBe(REPORT_DISCLAIMER.vi);
    const text = container.textContent ?? '';
    expect(text).toMatch(/giả lập/);
    expect(text).not.toMatch(/thông số (kỹ thuật )?thực tế của xe|là thông số thực/);
    expect(REPORT_DISCLAIMER.vi).toMatch(/không phải thông số kỹ thuật thực tế/);
    expect(REPORT_DISCLAIMER.en).toMatch(/not real-world technical specifications/);
  });

  it.each(['vi', 'en'] as const)('labels every rating/score heading as simulated (%s)', (locale) => {
    const { container } = render(<ReportView data={build({ locale })} />);
    const labels = [...container.querySelectorAll('h1, h2, th, dt, caption, figcaption')]
      .map((el) => el.textContent ?? '')
      .filter((text) => /chỉ số|điểm|rating|score/i.test(text));
    expect(labels.length).toBeGreaterThan(0);
    for (const text of labels) expect(text).toMatch(/giả lập|simulated/i);
    // Không có câu nào khẳng định chỉ số là thông số thực.
    expect(container.textContent).not.toMatch(/(are|is) (the )?real(-world)? (spec|value)|là (thông )?số (liệu )?thực/i);
  });

  it('escapes user text instead of injecting HTML', () => {
    const data = build();
    data.design.name = '<img src=x onerror="alert(1)"><b>bold</b>';
    const { container } = render(<ReportView data={data} />);
    expect(screen.getByTestId('report-design-name').textContent).toBe(data.design.name);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows a placeholder when no snapshot is available', () => {
    render(<ReportView data={build({ screenshotDataUrl: null })} snapshotPending={false} />);
    expect(screen.queryByTestId('report-snapshot')).toBeNull();
    expect(screen.getByTestId('report-snapshot-missing')).toBeTruthy();
  });

  it('renders English copy when the report locale is en', () => {
    render(<ReportView data={build({ locale: 'en' })} />);
    expect(screen.getByRole('heading', { name: '12. Method & disclaimer' })).toBeTruthy();
  });
});

describe('JSON export', () => {
  it('serialises and downloads the report as a JSON file', async () => {
    const data = build();
    expect(JSON.parse(serializeReport(data))).toEqual(data);
    expect(reportFileName(data)).toBe('tank-report-medium-tank.json');

    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:report';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadReport(data);
    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0]?.type).toBe('application/json');
    expect(created[0]?.size).toBe(new TextEncoder().encode(serializeReport(data)).length);
    expect(document.querySelector('a[download]')).toBeNull();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:report'));
  });
});

describe('ReportOverlay', () => {
  it('captures the canvas, prints and exports the current configuration', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SHOT);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const print = vi.fn();
    const download = vi.fn();
    const onClose = vi.fn();
    const getCanvas = () => canvas;

    render(<ReportOverlay onClose={onClose} getCanvas={getCanvas} now={() => NOW} print={print} download={download} />);
    expect(document.body.classList.contains(REPORT_BODY_CLASS)).toBe(true);
    await waitFor(() => expect(screen.getByTestId('report-snapshot').getAttribute('src')).toBe(SHOT));

    fireEvent.click(screen.getByRole('button', { name: 'In / Lưu PDF' }));
    expect(print).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Xuất JSON' }));
    expect(download).toHaveBeenCalledTimes(1);
    const exported = download.mock.calls[0]![0] as ReturnType<typeof buildReportData>;
    expect(exported.screenshotDataUrl).toBe(SHOT);
    expect(exported.configuration).toEqual(useVehicleStore.getState().configuration);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('follows the UI locale and cleans up the body class on unmount', async () => {
    act(() => useUiStore.getState().setLocale('en'));
    const { unmount } = render(<ReportOverlay onClose={() => {}} getCanvas={() => null} now={() => NOW} />);
    await waitFor(() => expect(screen.getByTestId('report-snapshot-missing').textContent).toMatch(/No snapshot/));
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeTruthy();
    unmount();
    expect(document.body.classList.contains(REPORT_BODY_CLASS)).toBe(false);
  });

  it('retakes the snapshot with the given capture options', async () => {
    const SHOT2 = 'data:image/png;base64,QUJD';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SHOT);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const renderFrame = vi.fn();
    const getCanvas = () => canvas;
    render(<ReportOverlay onClose={() => {}} getCanvas={getCanvas} captureOptions={{ render: renderFrame }} />);
    await waitFor(() => expect(screen.getByTestId('report-snapshot').getAttribute('src')).toBe(SHOT));
    expect(renderFrame).toHaveBeenCalledTimes(1);

    toDataURL.mockReturnValue(SHOT2);
    fireEvent.click(screen.getByRole('button', { name: 'Chụp lại ảnh' }));
    await waitFor(() => expect(screen.getByTestId('report-snapshot').getAttribute('src')).toBe(SHOT2));
    expect(renderFrame).toHaveBeenCalledTimes(2);

    // Chụp lại thất bại thì giữ ảnh cũ.
    toDataURL.mockReturnValue('data:,');
    fireEvent.click(screen.getByRole('button', { name: 'Chụp lại ảnh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chụp lại ảnh' })).toHaveProperty('disabled', false));
    expect(screen.getByTestId('report-snapshot').getAttribute('src')).toBe(SHOT2);
  });

  it('traps Tab focus inside the dialog', async () => {
    render(
      <>
        <button type="button">outside</button>
        <ReportOverlay onClose={() => {}} getCanvas={() => null} />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('report-snapshot-missing').textContent).not.toMatch(/Đang chụp/));
    const first = screen.getByRole('button', { name: 'In / Lưu PDF' });
    const last = screen.getByRole('button', { name: 'Đóng' });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    screen.getByRole('button', { name: 'outside' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('uses window.print by default', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReportOverlay onClose={() => {}} getCanvas={() => null} />);
    await waitFor(() => expect(screen.getByTestId('report-snapshot-missing')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'In / Lưu PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('ReportButton', () => {
  it('opens and closes the report overlay', async () => {
    render(<ReportButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo cáo' }));
    expect(screen.getByRole('dialog', { name: 'Báo cáo cấu hình' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('report-snapshot-missing').textContent).not.toMatch(/Đang chụp/));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns focus to the report button when the overlay closes', async () => {
    render(<ReportButton />);
    const opener = screen.getByRole('button', { name: 'Báo cáo' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByTestId('report-snapshot-missing').textContent).not.toMatch(/Đang chụp/));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('is available on the bottom toolbar', () => {
    render(<BottomToolbar />);
    const toolbar = screen.getAllByRole('toolbar')[0]!;
    expect(within(toolbar).getByRole('button', { name: 'Báo cáo' })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Báo cáo' }).getAttribute('aria-haspopup')).toBe('dialog');
  });
});

describe('print.css', () => {
  const css = readFileSync(new URL('./print.css', import.meta.url), 'utf8');

  it('targets A4 paper with page-break rules and hides the app when printing', () => {
    expect(css).toMatch(/@page\s*{[^}]*size:\s*A4/);
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/page-break-inside:\s*avoid/);
    expect(css).toMatch(/break-inside:\s*avoid/);
    expect(css).toContain(`body.${REPORT_BODY_CLASS} > *:not(.report-overlay)`);
    expect(css).toMatch(/\.report-toolbar\s*{\s*display:\s*none/);
  });
});

it('ReportView source never uses dangerouslySetInnerHTML', () => {
  const source = readFileSync(new URL('./ReportView.tsx', import.meta.url), 'utf8');
  expect(source).not.toMatch(/dangerouslySetInnerHTML\s*=/);
});
