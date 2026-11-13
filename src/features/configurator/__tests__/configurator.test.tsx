import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DesignPanel } from '../DesignPanel';
import { StatsPanel, formatDelta, radarPoints, STATS_DISCLAIMER } from '../StatsPanel';
import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import { RATING_KEYS } from '@/domain/models/types';
import { validateConfiguration } from '@/domain/rules/compatibility';
import { computeScore } from '@/domain/scoring/score';
import { computeTankLayout, resolveVariant } from '@/scene/components/variant';
import { useToastStore } from '@/stores/useToastStore';
import { initialUiValues, useUiStore } from '@/stores/useUiStore';
import {
  HISTORY_LIMIT,
  computeScoreView,
  paintColorOf,
  selectDisplayedConfiguration,
  swapSlot,
  toSceneVariant,
  useVehicleStore,
  variantInSlot,
} from '@/stores/useVehicleStore';

const store = () => useVehicleStore.getState();
const sceneLayout = () => computeTankLayout(resolveVariant(toSceneVariant(selectDisplayedConfiguration(store()))));

beforeEach(() => {
  store().reset();
  useUiStore.setState({ ...initialUiValues });
  useToastStore.getState().clear();
});
afterEach(cleanup);

describe('useVehicleStore — swap & model', () => {
  it('starts from the valid default configuration, clean, with empty history', () => {
    const s = store();
    expect(s.configuration).toEqual(createDefaultConfiguration());
    expect(validateConfiguration(s.configuration, defaultCatalog)).toEqual([]);
    expect(s.dirty).toBe(false);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
  });

  it('swaps turret and the model turret changes', () => {
    const before = sceneLayout();
    expect(store().applyChange('turret', 'turret-low-profile')).toEqual({ ok: true });
    expect(variantInSlot(store().configuration, 'turret')).toBe('turret-low-profile');
    const after = sceneLayout();
    expect(after.variant.turret.style).toBe('lowProfile');
    expect(after.turret.height).toBeLessThan(before.turret.height);
    expect(after.turret.width).not.toBe(before.turret.width);
  });

  it('swaps barrel and the model barrel changes', () => {
    const before = sceneLayout();
    expect(store().applyChange('barrel', 'barrel-long').ok).toBe(true);
    const after = sceneLayout();
    expect(after.variant.barrel.length).toBeGreaterThan(before.variant.barrel.length);
    expect(after.variant.barrel.muzzleBrake).toBe(true);
    store().applyChange('barrel', 'barrel-short');
    expect(sceneLayout().variant.barrel.length).toBeLessThan(before.variant.barrel.length);
  });

  it('swaps road wheel layout and the model wheels change', () => {
    const before = sceneLayout();
    expect(store().applyChange('suspension', 'suspension-coil').ok).toBe(true);
    expect(store().applyChange('road-wheels', 'wheels-small-bogie').ok).toBe(true);
    const after = sceneLayout();
    expect(after.variant.roadWheels.layout).toBe('paired');
    expect(after.gear.roadWheelX.length).not.toBe(before.gear.roadWheelX.length);
    expect(after.gear.wheelRadius).toBeLessThan(before.gear.wheelRadius);
  });

  it('adds / changes / removes external protection (side skirts) on the model', () => {
    expect(sceneLayout().variant.skirts).toBe('none');
    expect(store().applyChange('side-skirt', 'skirt-plates').ok).toBe(true);
    expect(sceneLayout().variant.skirts).toBe('segmented');
    store().applyChange('side-skirt', 'skirt-mesh');
    expect(sceneLayout().variant.skirts).toBe('full');
    expect(store().configuration.instances.filter((i) => i.slotId === 'side-skirt')).toHaveLength(1);
    expect(store().applyChange('side-skirt', null).ok).toBe(true);
    expect(sceneLayout().variant.skirts).toBe('none');
  });

  it('preview shows on the model without committing; cancel restores', () => {
    const original = store().configuration;
    store().startPreview('turret', 'turret-low-profile');
    expect(sceneLayout().variant.turret.style).toBe('lowProfile');
    expect(store().configuration).toBe(original);
    expect(store().dirty).toBe(false);
    store().cancelPreview();
    expect(sceneLayout().variant.turret.style).toBe('cast');
  });

  it('confirming a preview commits it, marks dirty and recomputes score', () => {
    const scoreBefore = computeScore(store().configuration, defaultCatalog);
    store().startPreview('barrel', 'barrel-long');
    expect(store().confirmPreview()).toEqual({ ok: true });
    expect(store().preview).toBeNull();
    expect(store().dirty).toBe(true);
    expect(variantInSlot(store().configuration, 'barrel')).toBe('barrel-long');
    const view = computeScoreView(store());
    expect(view.basis).toBe('previous');
    expect(view.reference).toEqual(scoreBefore);
    expect(view.score.firepower).toBeGreaterThan(scoreBefore.firepower);
  });

  it('paint preset changes the paint colour', () => {
    const olive = paintColorOf(store().configuration, defaultCatalog);
    store().applyChange('camouflage', 'camo-sand');
    expect(paintColorOf(store().configuration, defaultCatalog)).not.toBe(olive);
  });

  it('swapSlot replaces every instance of a multi-instance slot and never mutates input', () => {
    const cfg = createDefaultConfiguration();
    const snapshot = JSON.stringify(cfg);
    const next = swapSlot(cfg, 'fender', 'fender-short');
    expect(next.instances.filter((i) => i.slotId === 'fender').map((i) => i.variantId)).toEqual(['fender-short']);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});

describe('useVehicleStore — rejection', () => {
  it('rejects an incompatible variant with a clear message and keeps configuration', () => {
    const before = store().configuration;
    const result = store().applyChange('turret', 'turret-large-welded');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.ruleId).toBe('turret-large-needs-large-hull');
    expect(store().configuration).toBe(before);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
    expect(store().lastRejection?.issues[0]?.message.vi).toMatch(/Tháp cỡ lớn/);
  });

  it('rejects confirming an incompatible preview', () => {
    const preview = store().startPreview('road-wheels', 'wheels-small-bogie');
    expect(preview.issues.map((i) => i.ruleId)).toEqual(['small-wheels-need-bogie-or-coil']);
    const result = store().confirmPreview();
    expect(result.ok).toBe(false);
    expect(variantInSlot(store().configuration, 'road-wheels')).toBe('wheels-large-spaced');
    expect(store().lastRejection?.variantId).toBe('wheels-small-bogie');
  });

  it('rejects removing a required slot', () => {
    expect(store().applyChange('turret', null).ok).toBe(false);
    expect(variantInSlot(store().configuration, 'turret')).toBe('turret-medium-cast');
  });
});

describe('useVehicleStore — undo / redo', () => {
  it('restores exact configurations through undo and redo', () => {
    const c0 = store().configuration;
    store().applyChange('turret', 'turret-low-profile');
    const c1 = store().configuration;
    store().applyChange('barrel', 'barrel-short');
    const c2 = store().configuration;
    store().applyChange('side-skirt', 'skirt-plates');
    const c3 = store().configuration;

    store().undo();
    expect(store().configuration).toEqual(c2);
    store().undo();
    expect(store().configuration).toEqual(c1);
    store().undo();
    expect(store().configuration).toEqual(c0);
    expect(store().dirty).toBe(false);
    store().undo(); // không còn gì để undo
    expect(store().configuration).toEqual(c0);

    store().redo();
    expect(store().configuration).toEqual(c1);
    expect(store().dirty).toBe(true);
    store().redo();
    store().redo();
    expect(store().configuration).toEqual(c3);
    store().redo();
    expect(store().configuration).toEqual(c3);
  });

  it('a new change clears the redo stack', () => {
    store().applyChange('turret', 'turret-low-profile');
    store().undo();
    expect(store().future).toHaveLength(1);
    store().applyChange('barrel', 'barrel-long');
    expect(store().future).toHaveLength(0);
  });

  it('re-selecting the current variant does not add history', () => {
    store().applyChange('turret', 'turret-medium-cast');
    expect(store().past).toHaveLength(0);
  });

  it('undo cancels an active preview; markSaved resets dirty', () => {
    store().applyChange('turret', 'turret-low-profile');
    store().startPreview('barrel', 'barrel-long');
    store().undo();
    expect(store().preview).toBeNull();
    store().redo();
    store().markSaved();
    expect(store().dirty).toBe(false);
    store().undo();
    expect(store().dirty).toBe(true);
  });

  it('caps the history length', () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      store().applyChange('barrel', i % 2 ? 'barrel-short' : 'barrel-long');
    }
    expect(store().past.length).toBe(HISTORY_LIMIT);
  });
});

describe('DesignPanel', () => {
  it('lists every turret variant and marks incompatible ones with the reason (not hidden)', () => {
    render(<DesignPanel />);
    const all = defaultCatalog.variants.filter((v) => v.categoryId === 'turret');
    for (const v of all) expect(screen.getByTestId(`variant-${v.id}`)).toBeTruthy();
    const large = screen.getByTestId('variant-turret-large-welded');
    expect(large.getAttribute('data-incompatible')).toBe('true');
    expect(within(large).getByText(/Không tương thích/)).toBeTruthy();
    expect(within(large).getByText('Tháp cỡ lớn chỉ đặt vừa trên thân xe cỡ lớn.')).toBeTruthy();
    expect(screen.getByTestId('variant-turret-low-profile').getAttribute('data-incompatible')).toBeNull();
  });

  it('preview → confirm swaps the turret', () => {
    render(<DesignPanel />);
    fireEvent.click(within(screen.getByTestId('variant-turret-low-profile')).getByRole('button'));
    expect(screen.getByTestId('preview-name').textContent).toBe('Tháp dáng thấp');
    expect(store().preview?.variantId).toBe('turret-low-profile');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(variantInSlot(store().configuration, 'turret')).toBe('turret-low-profile');
    expect(screen.getByTestId('dirty-indicator').textContent).toBe('Chưa lưu');
    expect(within(screen.getByTestId('variant-turret-low-profile')).getByText(/Đang dùng/)).toBeTruthy();
  });

  it('confirming an incompatible variant shows an alert and a toast', () => {
    render(<DesignPanel />);
    fireEvent.click(within(screen.getByTestId('variant-turret-large-welded')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Không thể áp dụng/);
    expect(alert.textContent).toMatch(/Tháp cỡ lớn chỉ đặt vừa trên thân xe cỡ lớn/);
    expect(useToastStore.getState().toasts.at(-1)?.variant).toBe('error');
    expect(variantInSlot(store().configuration, 'turret')).toBe('turret-medium-cast');
  });

  it('switches modules and offers "Không gắn" for optional slots', () => {
    render(<DesignPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Tấm che hông/ }));
    fireEvent.click(within(screen.getByTestId('variant-skirt-plates')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(variantInSlot(store().configuration, 'side-skirt')).toBe('skirt-plates');
    fireEvent.click(within(screen.getByTestId('variant-none')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(variantInSlot(store().configuration, 'side-skirt')).toBeNull();
  });

  it('undo / redo buttons and paint presets work', () => {
    render(<DesignPanel />);
    const undo = screen.getByRole('button', { name: 'Hoàn tác' }) as HTMLButtonElement;
    const redo = screen.getByRole('button', { name: 'Làm lại' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Màu cát' }));
    expect(variantInSlot(store().configuration, 'camouflage')).toBe('camo-sand');
    expect(screen.getByRole('radio', { name: 'Màu cát' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(undo);
    expect(variantInSlot(store().configuration, 'camouflage')).toBe('camo-olive');
    expect(redo.disabled).toBe(false);
    fireEvent.click(redo);
    expect(variantInSlot(store().configuration, 'camouflage')).toBe('camo-sand');
  });
});

describe('StatsPanel', () => {
  it('renders 5 progress bars with values and always the disclaimer', () => {
    render(<StatsPanel />);
    const score = computeScore(store().configuration, defaultCatalog);
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(RATING_KEYS.length);
    for (const key of RATING_KEYS) {
      expect(screen.getByTestId(`value-${key}`).textContent).toBe(String(score[key]));
    }
    expect(screen.queryByTestId('delta-firepower')).toBeNull();
    expect(screen.getByTestId('stats-disclaimer').textContent).toContain(STATS_DISCLAIMER);
    expect(STATS_DISCLAIMER.startsWith('Chỉ số giả lập')).toBe(true);
    expect(screen.getByTestId('stats-radar')).toBeTruthy();
  });

  it('updates values and shows delta vs previous configuration after a swap', () => {
    render(<StatsPanel />);
    const before = computeScore(store().configuration, defaultCatalog);
    act(() => {
      store().applyChange('barrel', 'barrel-long');
    });
    const after = computeScore(store().configuration, defaultCatalog);
    expect(screen.getByTestId('value-firepower').textContent).toBe(String(after.firepower));
    expect(screen.getByTestId('delta-firepower').textContent).toBe(formatDelta(after.firepower - before.firepower));
    expect(screen.getByTestId('delta-firepower').textContent?.startsWith('+')).toBe(true);
    expect(screen.getByTestId('radar-reference')).toBeTruthy();
    expect(screen.getByTestId('stats-disclaimer')).toBeTruthy();
  });

  it('shows preview delta against the current configuration', () => {
    render(<StatsPanel />);
    act(() => {
      store().startPreview('turret', 'turret-low-profile');
    });
    expect(screen.getByTestId('delta-basis').textContent).toMatch(/hiện tại/);
    expect(screen.getByTestId('delta-concealment').textContent?.startsWith('+')).toBe(true);
  });

  it('keeps the disclaimer in English locale', () => {
    useUiStore.setState({ locale: 'en' });
    render(<StatsPanel />);
    expect(screen.getByTestId('stats-disclaimer').textContent).toContain('Chỉ số giả lập');
    expect(screen.getByText('Firepower')).toBeTruthy();
  });

  it('radarPoints and formatDelta are correct', () => {
    const [top, zero, half] = radarPoints([100, 0, 50], 10, { x: 0, y: 0 });
    expect(top?.x).toBeCloseTo(0);
    expect(top?.y).toBeCloseTo(-10);
    expect(zero?.x).toBeCloseTo(0);
    expect(zero?.y).toBeCloseTo(0);
    expect(Math.hypot(half?.x ?? NaN, half?.y ?? NaN)).toBeCloseTo(5);
    expect(radarPoints([150], 10, { x: 0, y: 0 })[0]?.y).toBeCloseTo(-10);
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(-2)).toBe('−2');
    expect(formatDelta(0)).toBe('±0');
  });
});
