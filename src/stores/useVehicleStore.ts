import { create } from 'zustand';
import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import type {
  Catalog,
  MaterialPreset,
  SimulatedRatings,
  VehicleConfiguration,
} from '@/domain/models/types';
import { validateConfiguration, type CompatibilityIssue } from '@/domain/rules/compatibility';
import { computeScore } from '@/domain/scoring/score';
import type { DeepPartial, SkirtStyle, TankVariantConfig } from '@/scene/components/variant';

/**
 * Store cấu hình xe cho chế độ Design.
 *
 * - `configuration` chỉ chứa DỮ LIỆU (VehicleConfiguration, serialisable) — không giữ Object3D.
 * - `preview`: cấu hình thử (chưa xác nhận) để hiển thị trên mô hình.
 * - `past` / `future`: lịch sử undo/redo (snapshot cấu hình).
 * - `dirty`: cấu hình hiện tại khác với mốc đã lưu (`baseline`).
 * Mọi kiểm tra tương thích dùng `validateConfiguration` của domain (T2).
 */

export const HISTORY_LIMIT = 50;

export interface PlacementPreview {
  slotId: string;
  /** `null` = gỡ chi tiết khỏi slot. */
  variantId: string | null;
  configuration: VehicleConfiguration;
  /** Lỗi MỚI phát sinh nếu xác nhận; rỗng = tương thích. */
  issues: CompatibilityIssue[];
}

export interface PlacementRejection {
  slotId: string;
  variantId: string | null;
  issues: CompatibilityIssue[];
}

export type ChangeResult = { ok: true } | { ok: false; issues: CompatibilityIssue[] };

export interface VehicleValues {
  catalog: Catalog;
  configuration: VehicleConfiguration;
  /** Mốc so sánh cho dirty flag (cấu hình đã lưu / nạp gần nhất). */
  baseline: VehicleConfiguration;
  preview: PlacementPreview | null;
  past: VehicleConfiguration[];
  future: VehicleConfiguration[];
  dirty: boolean;
  lastRejection: PlacementRejection | null;
}

export interface VehicleActions {
  /** Kiểm tra (không thay đổi state) việc đặt biến thể / gỡ slot. */
  checkChange: (slotId: string, variantId: string | null) => CompatibilityIssue[];
  startPreview: (slotId: string, variantId: string | null) => PlacementPreview;
  cancelPreview: () => void;
  /** Xác nhận preview; bị từ chối nếu có lỗi tương thích. */
  confirmPreview: () => ChangeResult;
  /** Đổi biến thể ngay (không qua preview); bị từ chối nếu không tương thích. */
  applyChange: (slotId: string, variantId: string | null) => ChangeResult;
  dismissRejection: () => void;
  undo: () => void;
  redo: () => void;
  /** Nạp cấu hình mới (xoá lịch sử, đặt làm mốc sạch). */
  load: (configuration: VehicleConfiguration) => void;
  /** Đánh dấu cấu hình hiện tại là đã lưu. */
  markSaved: () => void;
  reset: () => void;
}

export type VehicleStore = VehicleValues & VehicleActions;

// ---------------------------------------------------------------------------
// Hàm thuần
// ---------------------------------------------------------------------------

export function cloneConfiguration(config: VehicleConfiguration): VehicleConfiguration {
  return { ...config, instances: config.instances.map((i) => ({ ...i })) };
}

export function sameConfiguration(a: VehicleConfiguration, b: VehicleConfiguration): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Đổi chi tiết trong slot: gỡ mọi chi tiết hiện có của slot rồi gắn biến thể mới
 * (`variantId = null` → chỉ gỡ). Giữ nguyên thứ tự các chi tiết còn lại.
 */
export function swapSlot(
  config: VehicleConfiguration,
  slotId: string,
  variantId: string | null,
): VehicleConfiguration {
  const index = config.instances.findIndex((i) => i.slotId === slotId);
  const kept = config.instances.filter((i) => i.slotId !== slotId).map((i) => ({ ...i }));
  if (variantId === null) return { ...config, instances: kept };
  const used = new Set(kept.map((i) => i.instanceId));
  let n = 1;
  while (used.has(`${slotId}-${n}`)) n += 1;
  const next = { instanceId: `${slotId}-${n}`, slotId, variantId };
  const at = index < 0 ? kept.length : Math.min(index, kept.length);
  return { ...config, instances: [...kept.slice(0, at), next, ...kept.slice(at)] };
}

function issueKey(i: CompatibilityIssue): string {
  return [i.code, i.ruleId ?? '', i.slotId ?? '', i.variantId ?? ''].join('|');
}

/** Lỗi tương thích MỚI phát sinh khi chuyển từ `before` sang `after`. */
export function newIssues(
  before: VehicleConfiguration,
  after: VehicleConfiguration,
  catalog: Catalog,
): CompatibilityIssue[] {
  const existing = new Set(validateConfiguration(before, catalog).map(issueKey));
  return validateConfiguration(after, catalog).filter((i) => !existing.has(issueKey(i)));
}

export function variantInSlot(config: VehicleConfiguration, slotId: string): string | null {
  return config.instances.find((i) => i.slotId === slotId)?.variantId ?? null;
}

/** Màu hiển thị cho preset sơn / vật liệu. */
export const MATERIAL_PRESET_COLORS: Readonly<Record<MaterialPreset, string>> = {
  'steel-matte': '#6f7376',
  'steel-worn': '#7d7a72',
  'cast-rough': '#5e5c55',
  rubber: '#1c1c1c',
  glass: '#a9c6d6',
  canvas: '#a08e66',
  brass: '#b5893a',
  'paint-olive': '#4b5320',
  'paint-sand': '#c2a66b',
  'paint-grey': '#6b6f73',
  'paint-camo': '#5a5d3a',
  decal: '#e8e4d8',
};

/** Ánh xạ biến thể catalog → tham số mô hình procedural (chỉ phần khác mặc định). */
const HULL_MAP: Record<string, TankVariantConfig['hull']> = {
  'hull-compact': { length: 5.4, width: 2.0, height: 0.95 },
  'hull-standard': { length: 6.8, width: 2.3, height: 1.1 },
  'hull-sloped': { length: 7.0, width: 2.4, height: 1.05 },
  'hull-heavy': { length: 8.2, width: 2.9, height: 1.3 },
};

const TURRET_MAP: Record<string, TankVariantConfig['turret']['style']> = {
  'turret-small-round': 'cast',
  'turret-low-profile': 'lowProfile',
  'turret-medium-cast': 'cast',
  'turret-large-welded': 'welded',
};

const BARREL_MAP: Record<string, Partial<TankVariantConfig['barrel']>> = {
  'barrel-short': { length: 2.8, caliber: 0.1, muzzleBrake: false, fumeExtractor: false },
  'barrel-medium': { length: 4.8, caliber: 0.12, muzzleBrake: false, fumeExtractor: true },
  'barrel-long': { length: 6.4, caliber: 0.13, muzzleBrake: true, fumeExtractor: true },
};

const WHEEL_MAP: Record<string, TankVariantConfig['roadWheels']> = {
  'wheels-large-spaced': { count: 5, diameter: 0.9, layout: 'even' },
  'wheels-interleaved': { count: 8, diameter: 0.8, layout: 'even' },
  'wheels-small-bogie': { count: 8, diameter: 0.55, layout: 'paired' },
};

const SKIRT_MAP: Record<string, SkirtStyle> = {
  'skirt-plates': 'segmented',
  'skirt-mesh': 'full',
  'skirt-rubber': 'full',
};

/** Slot có thay đổi nhìn thấy được trên mô hình procedural. */
export const MODEL_VISIBLE_SLOTS = [
  'hull',
  'turret',
  'barrel',
  'road-wheels',
  'side-skirt',
  'antenna',
  'headlight',
  'storage',
  'camouflage',
] as const;

/** Chuyển VehicleConfiguration (dữ liệu) → cấu hình mô hình procedural cho ProceduralTank. */
export function toSceneVariant(config: VehicleConfiguration): DeepPartial<TankVariantConfig> {
  const get = (slotId: string) => variantInSlot(config, slotId);
  const has = (slotId: string) => config.instances.some((i) => i.slotId === slotId);
  const hull = HULL_MAP[get('hull') ?? ''];
  const turret = TURRET_MAP[get('turret') ?? ''];
  const barrel = BARREL_MAP[get('barrel') ?? ''];
  const wheels = WHEEL_MAP[get('road-wheels') ?? ''];
  const skirt = get('side-skirt');
  return {
    id: config.id,
    ...(hull && { hull: { ...hull } }),
    ...(turret && { turret: { style: turret } }),
    ...(barrel && { barrel: { ...barrel } }),
    ...(wheels && { roadWheels: { ...wheels } }),
    skirts: skirt ? SKIRT_MAP[skirt] ?? 'segmented' : 'none',
    accessories: {
      antenna: has('antenna'),
      headlights: has('headlight'),
      toolbox: has('storage'),
      spareTracks: has('storage'),
      smokeLaunchers: true,
    },
  };
}

/** Màu sơn chính lấy từ slot camouflage (preset sơn). */
export function paintColorOf(config: VehicleConfiguration, catalog: Catalog): string {
  const id = variantInSlot(config, 'camouflage');
  const variant = catalog.variants.find((v) => v.id === id);
  return MATERIAL_PRESET_COLORS[variant?.materialPreset ?? 'paint-olive'];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function initialValues(
  configuration: VehicleConfiguration = createDefaultConfiguration(),
  catalog: Catalog = defaultCatalog,
): VehicleValues {
  return {
    catalog,
    configuration: cloneConfiguration(configuration),
    baseline: cloneConfiguration(configuration),
    preview: null,
    past: [],
    future: [],
    dirty: false,
    lastRejection: null,
  };
}

export const useVehicleStore = create<VehicleStore>()((set, get) => {
  /** Ghi cấu hình mới vào lịch sử (đã kiểm tra hợp lệ trước đó). */
  const commit = (next: VehicleConfiguration) => {
    const { configuration, past, baseline } = get();
    if (sameConfiguration(configuration, next)) {
      set({ preview: null, lastRejection: null });
      return;
    }
    set({
      configuration: next,
      past: [...past, configuration].slice(-HISTORY_LIMIT),
      future: [],
      preview: null,
      lastRejection: null,
      dirty: !sameConfiguration(next, baseline),
    });
  };

  const tryChange = (slotId: string, variantId: string | null, next: VehicleConfiguration, issues: CompatibilityIssue[]): ChangeResult => {
    if (issues.length > 0) {
      // Từ chối có thông báo: giữ nguyên cấu hình, ghi lại lý do để UI hiển thị.
      set({ lastRejection: { slotId, variantId, issues } });
      return { ok: false, issues };
    }
    commit(next);
    return { ok: true };
  };

  return {
    ...initialValues(),

    checkChange: (slotId, variantId) => {
      const { configuration, catalog } = get();
      return newIssues(configuration, swapSlot(configuration, slotId, variantId), catalog);
    },

    startPreview: (slotId, variantId) => {
      const { configuration, catalog } = get();
      const next = swapSlot(configuration, slotId, variantId);
      const preview: PlacementPreview = {
        slotId,
        variantId,
        configuration: next,
        issues: newIssues(configuration, next, catalog),
      };
      set({ preview, lastRejection: null });
      return preview;
    },

    cancelPreview: () => set({ preview: null }),

    confirmPreview: () => {
      const { preview, configuration, catalog } = get();
      if (!preview) return { ok: true };
      // Kiểm tra lại với cấu hình hiện tại (phòng trường hợp đã thay đổi sau khi preview).
      const next = swapSlot(configuration, preview.slotId, preview.variantId);
      return tryChange(preview.slotId, preview.variantId, next, newIssues(configuration, next, catalog));
    },

    applyChange: (slotId, variantId) => {
      const { configuration, catalog } = get();
      const next = swapSlot(configuration, slotId, variantId);
      return tryChange(slotId, variantId, next, newIssues(configuration, next, catalog));
    },

    dismissRejection: () => set({ lastRejection: null }),

    undo: () => {
      const { past, future, configuration, baseline } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({
        configuration: previous,
        past: past.slice(0, -1),
        future: [configuration, ...future],
        preview: null,
        lastRejection: null,
        dirty: !sameConfiguration(previous, baseline),
      });
    },

    redo: () => {
      const { past, future, configuration, baseline } = get();
      const [next, ...rest] = future;
      if (!next) return;
      set({
        configuration: next,
        past: [...past, configuration].slice(-HISTORY_LIMIT),
        future: rest,
        preview: null,
        lastRejection: null,
        dirty: !sameConfiguration(next, baseline),
      });
    },

    load: (configuration) => set(initialValues(configuration, get().catalog)),

    markSaved: () => set((s) => ({ baseline: cloneConfiguration(s.configuration), dirty: false })),

    reset: () => set(initialValues(createDefaultConfiguration(), get().catalog)),
  };
});

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** Cấu hình đang hiển thị trên mô hình: preview nếu có, ngược lại cấu hình hiện tại. */
export const selectDisplayedConfiguration = (s: VehicleValues): VehicleConfiguration =>
  s.preview?.configuration ?? s.configuration;

export const selectCanUndo = (s: VehicleValues): boolean => s.past.length > 0;
export const selectCanRedo = (s: VehicleValues): boolean => s.future.length > 0;

export interface ScoreView {
  score: SimulatedRatings;
  /** Điểm để so sánh delta; null nếu chưa có cấu hình trước. */
  reference: SimulatedRatings | null;
  /** 'preview' = đang so preview với hiện tại; 'previous' = hiện tại so với cấu hình trước. */
  basis: 'preview' | 'previous' | 'none';
}

/** Điểm giả lập hiển thị + điểm tham chiếu để tính delta. */
export function computeScoreView(
  s: Pick<VehicleValues, 'configuration' | 'preview' | 'past' | 'catalog'>,
): ScoreView {
  if (s.preview) {
    return {
      score: computeScore(s.preview.configuration, s.catalog),
      reference: computeScore(s.configuration, s.catalog),
      basis: 'preview',
    };
  }
  const previous = s.past[s.past.length - 1];
  return {
    score: computeScore(s.configuration, s.catalog),
    reference: previous ? computeScore(previous, s.catalog) : null,
    basis: previous ? 'previous' : 'none',
  };
}
