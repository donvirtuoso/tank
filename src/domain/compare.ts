import {
  RATING_KEYS,
  type Catalog,
  type ComponentInstance,
  type Locale,
  type LocalizedText,
  type RatingKey,
  type SavedDesign,
  type SimulatedRatings,
  type VehicleConfiguration,
} from './models/types';
import { validateConfiguration, type CompatibilityIssueCode } from './rules/compatibility';
import { computeScore } from './scoring/score';

/**
 * So sánh hai cấu hình xe (hàm thuần, không phụ thuộc React/three.js):
 * - khác biệt chi tiết theo nhóm (category),
 * - chênh lệch chỉ số giả lập (b − a),
 * - cảnh báo tương thích của từng bên,
 * - bản tóm tắt xuất ra JSON / HTML.
 */

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

/** `onlyA` / `onlyB`: nhóm chỉ có chi tiết ở một bên. */
export type CategoryDiffStatus = 'same' | 'changed' | 'onlyA' | 'onlyB';

export interface VariantCount {
  variantId: string;
  name: LocalizedText;
  count: number;
}

export interface CategoryDiff {
  categoryId: string;
  name: LocalizedText;
  sortOrder: number;
  status: CategoryDiffStatus;
  /** Biến thể bên A (sắp theo variantId, gộp số lượng). */
  a: VariantCount[];
  b: VariantCount[];
}

export interface RatingDelta {
  key: RatingKey;
  a: number;
  b: number;
  /** b − a */
  delta: number;
}

export type CompareSide = 'a' | 'b';

export interface CompareWarning {
  side: CompareSide;
  code: CompatibilityIssueCode;
  messageKey: string;
  message: LocalizedText;
  ruleId?: string;
  slotId?: string;
  variantId?: string;
  /** Bên kia cũng có đúng lỗi này. */
  shared: boolean;
}

export interface ConfigurationComparison {
  /** Mọi nhóm có chi tiết ở ít nhất một bên, theo `sortOrder`. */
  categories: CategoryDiff[];
  /** Chỉ các nhóm khác nhau (status ≠ 'same'). */
  differences: CategoryDiff[];
  ratingsA: SimulatedRatings;
  ratingsB: SimulatedRatings;
  ratings: RatingDelta[];
  warnings: { a: CompareWarning[]; b: CompareWarning[] };
  validA: boolean;
  validB: boolean;
  /** componentId của mô hình 3D cần highlight (nhóm khác nhau). */
  highlightComponentIds: string[];
}

// ---------------------------------------------------------------------------
// Ánh xạ nhóm → componentId trên mô hình procedural
// ---------------------------------------------------------------------------

/**
 * Nhóm catalog → các node (componentId, xem `scene/components/componentIds.ts`) đại diện cho
 * nhóm đó trên mô hình. Nhóm không có node riêng được gắn vào node cha gần nhất.
 */
export const CATEGORY_COMPONENT_IDS: Readonly<Record<string, readonly string[]>> = {
  hull: ['hull'],
  turret: ['turret'],
  barrel: ['barrel'],
  mantlet: ['gun'],
  hatch: ['driver-hatch', 'commander-hatch'],
  cupola: ['commander-hatch'],
  engine: ['engine-compartment'],
  drivetrain: ['sprocket-left', 'sprocket-right'],
  suspension: ['road-wheels-left', 'road-wheels-right'],
  'road-wheels': ['road-wheels-left', 'road-wheels-right'],
  track: ['track-left', 'track-right'],
  fender: ['skirt-left', 'skirt-right'],
  'side-skirt': ['skirt-left', 'skirt-right'],
  exhaust: ['engine-compartment'],
  headlight: ['headlights'],
  storage: ['toolbox', 'spare-tracks'],
  antenna: ['antenna'],
  periscope: ['turret'],
  camouflage: ['hull', 'turret'],
  insignia: ['turret'],
};

export function componentIdsForCategories(categoryIds: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const id of categoryIds) for (const c of CATEGORY_COMPONENT_IDS[id] ?? []) out.add(c);
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// So sánh
// ---------------------------------------------------------------------------

const UNKNOWN_CATEGORY = 'unknown';
const UNKNOWN_NAME: LocalizedText = { vi: 'Không xác định', en: 'Unknown' };

/** Nhóm của một chi tiết: theo biến thể; biến thể lạ → nhóm đầu tiên slot chấp nhận. */
function categoryOf(inst: ComponentInstance, catalog: Catalog): string {
  const variant = catalog.variants.find((v) => v.id === inst.variantId);
  if (variant) return variant.categoryId;
  const slot = catalog.compatibility.slots.find((s) => s.id === inst.slotId);
  return slot?.acceptedCategories[0] ?? UNKNOWN_CATEGORY;
}

function groupByCategory(config: VehicleConfiguration, catalog: Catalog): Map<string, Map<string, number>> {
  const groups = new Map<string, Map<string, number>>();
  for (const inst of config.instances) {
    const cat = categoryOf(inst, catalog);
    const counts = groups.get(cat) ?? new Map<string, number>();
    counts.set(inst.variantId, (counts.get(inst.variantId) ?? 0) + 1);
    groups.set(cat, counts);
  }
  return groups;
}

function toVariantCounts(counts: Map<string, number> | undefined, catalog: Catalog): VariantCount[] {
  if (!counts) return [];
  return [...counts.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([variantId, count]) => {
      const v = catalog.variants.find((item) => item.id === variantId);
      return { variantId, name: v ? { vi: v.nameVi, en: v.nameEn } : { vi: variantId, en: variantId }, count };
    });
}

function sameCounts(a: VariantCount[], b: VariantCount[]): boolean {
  return a.length === b.length && a.every((x, i) => x.variantId === b[i]?.variantId && x.count === b[i]?.count);
}

function statusOf(a: VariantCount[], b: VariantCount[]): CategoryDiffStatus {
  if (a.length === 0) return 'onlyB';
  if (b.length === 0) return 'onlyA';
  return sameCounts(a, b) ? 'same' : 'changed';
}

/** Khác biệt chi tiết theo nhóm, sắp theo `sortOrder` của catalog (nhóm lạ xếp cuối). */
export function diffCategories(
  a: VehicleConfiguration,
  b: VehicleConfiguration,
  catalog: Catalog,
): CategoryDiff[] {
  const ga = groupByCategory(a, catalog);
  const gb = groupByCategory(b, catalog);
  const ids = new Set([...ga.keys(), ...gb.keys()]);
  const result: CategoryDiff[] = [];
  for (const categoryId of ids) {
    const cat = catalog.categories.find((c) => c.id === categoryId);
    const va = toVariantCounts(ga.get(categoryId), catalog);
    const vb = toVariantCounts(gb.get(categoryId), catalog);
    result.push({
      categoryId,
      name: cat ? { vi: cat.nameVi, en: cat.nameEn } : UNKNOWN_NAME,
      sortOrder: cat?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      status: statusOf(va, vb),
      a: va,
      b: vb,
    });
  }
  return result.sort(
    (x, y) => x.sortOrder - y.sortOrder || (x.categoryId < y.categoryId ? -1 : x.categoryId > y.categoryId ? 1 : 0),
  );
}

/** Chênh lệch từng chỉ số giả lập, theo thứ tự {@link RATING_KEYS}. */
export function ratingDeltas(a: SimulatedRatings, b: SimulatedRatings): RatingDelta[] {
  return RATING_KEYS.map((key) => ({ key, a: a[key], b: b[key], delta: b[key] - a[key] }));
}

function warningKey(w: Pick<CompareWarning, 'code' | 'ruleId' | 'slotId' | 'variantId'>): string {
  return [w.code, w.ruleId ?? '', w.slotId ?? '', w.variantId ?? ''].join('|');
}

function warningsFor(config: VehicleConfiguration, catalog: Catalog, side: CompareSide): CompareWarning[] {
  return validateConfiguration(config, catalog).map((issue) => ({
    side,
    code: issue.code,
    messageKey: issue.messageKey,
    message: { ...issue.message },
    ...(issue.ruleId !== undefined && { ruleId: issue.ruleId }),
    ...(issue.slotId !== undefined && { slotId: issue.slotId }),
    ...(issue.variantId !== undefined && { variantId: issue.variantId }),
    shared: false,
  }));
}

/** Cảnh báo tương thích của cả hai bên; `shared` = bên kia có cùng lỗi. */
export function compareWarnings(
  a: VehicleConfiguration,
  b: VehicleConfiguration,
  catalog: Catalog,
): { a: CompareWarning[]; b: CompareWarning[] } {
  const wa = warningsFor(a, catalog, 'a');
  const wb = warningsFor(b, catalog, 'b');
  const ka = new Set(wa.map(warningKey));
  const kb = new Set(wb.map(warningKey));
  return {
    a: wa.map((w) => ({ ...w, shared: kb.has(warningKey(w)) })),
    b: wb.map((w) => ({ ...w, shared: ka.has(warningKey(w)) })),
  };
}

/** So sánh đầy đủ hai cấu hình. Hàm thuần: không thay đổi đầu vào. */
export function compareConfigurations(
  a: VehicleConfiguration,
  b: VehicleConfiguration,
  catalog: Catalog,
): ConfigurationComparison {
  const categories = diffCategories(a, b, catalog);
  const differences = categories.filter((c) => c.status !== 'same');
  const ratingsA = computeScore(a, catalog);
  const ratingsB = computeScore(b, catalog);
  const warnings = compareWarnings(a, b, catalog);
  return {
    categories,
    differences,
    ratingsA,
    ratingsB,
    ratings: ratingDeltas(ratingsA, ratingsB),
    warnings,
    validA: warnings.a.length === 0,
    validB: warnings.b.length === 0,
    highlightComponentIds: componentIdsForCategories(differences.map((d) => d.categoryId)),
  };
}

// ---------------------------------------------------------------------------
// Tóm tắt xuất file
// ---------------------------------------------------------------------------

export const COMPARE_SUMMARY_FORMAT = 'tank-compare-summary' as const;
export const COMPARE_SUMMARY_VERSION = 1 as const;

export const COMPARE_DISCLAIMER: LocalizedText = {
  vi: 'Chỉ số giả lập, chỉ mang tính minh hoạ cho trò chơi/giáo dục, không phản ánh thông số kỹ thuật thực tế.',
  en: 'Simulated ratings for game/educational illustration only; not real-world specifications.',
};

export const RATING_LABELS: Readonly<Record<RatingKey, LocalizedText>> = {
  mobility: { vi: 'Cơ động', en: 'Mobility' },
  protection: { vi: 'Bảo vệ', en: 'Protection' },
  firepower: { vi: 'Hoả lực', en: 'Firepower' },
  reliability: { vi: 'Độ tin cậy', en: 'Reliability' },
  concealment: { vi: 'Ngụy trang', en: 'Concealment' },
};

export interface CompareSummaryDesign {
  id: string;
  name: string;
  updatedAt: string;
  valid: boolean;
}

export interface CompareSummary {
  format: typeof COMPARE_SUMMARY_FORMAT;
  version: typeof COMPARE_SUMMARY_VERSION;
  generatedAt: string;
  disclaimer: LocalizedText;
  a: CompareSummaryDesign;
  b: CompareSummaryDesign;
  ratings: RatingDelta[];
  differences: CategoryDiff[];
  identicalCategoryCount: number;
  warnings: { a: CompareWarning[]; b: CompareWarning[] };
}

type DesignLike = Pick<SavedDesign, 'id' | 'name' | 'updatedAt' | 'configuration'>;

export function buildCompareSummary(
  designA: DesignLike,
  designB: DesignLike,
  catalog: Catalog,
  options: { now?: () => string } = {},
): CompareSummary {
  const now = options.now ?? (() => new Date().toISOString());
  const cmp = compareConfigurations(designA.configuration, designB.configuration, catalog);
  return {
    format: COMPARE_SUMMARY_FORMAT,
    version: COMPARE_SUMMARY_VERSION,
    generatedAt: now(),
    disclaimer: { ...COMPARE_DISCLAIMER },
    a: { id: designA.id, name: designA.name, updatedAt: designA.updatedAt, valid: cmp.validA },
    b: { id: designB.id, name: designB.name, updatedAt: designB.updatedAt, valid: cmp.validB },
    ratings: cmp.ratings,
    differences: cmp.differences,
    identicalCategoryCount: cmp.categories.length - cmp.differences.length,
    warnings: cmp.warnings,
  };
}

export function serializeCompareSummary(summary: CompareSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `+5`, `−3`, `±0` (dấu trừ Unicode, giống StatsPanel). */
export function formatSignedDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '±0';
}

const HTML_COPY = {
  vi: {
    title: 'So sánh thiết kế',
    generated: 'Tạo lúc',
    ratings: 'Chỉ số giả lập',
    rating: 'Chỉ số',
    delta: 'Chênh lệch (B − A)',
    differences: 'Khác biệt chi tiết',
    category: 'Nhóm',
    noDifferences: 'Hai thiết kế giống nhau về chi tiết.',
    identical: 'Số nhóm giống nhau',
    warnings: 'Cảnh báo tương thích',
    noWarnings: 'Không có cảnh báo.',
    valid: 'Hợp lệ',
    invalid: 'Có lỗi tương thích',
    none: '—',
    status: { same: 'Giống', changed: 'Khác', onlyA: 'Chỉ A', onlyB: 'Chỉ B' },
  },
  en: {
    title: 'Design comparison',
    generated: 'Generated at',
    ratings: 'Simulated ratings',
    rating: 'Rating',
    delta: 'Delta (B − A)',
    differences: 'Part differences',
    category: 'Category',
    noDifferences: 'Both designs use the same parts.',
    identical: 'Identical categories',
    warnings: 'Compatibility warnings',
    noWarnings: 'No warnings.',
    valid: 'Valid',
    invalid: 'Has compatibility issues',
    none: '—',
    status: { same: 'Same', changed: 'Changed', onlyA: 'Only A', onlyB: 'Only B' },
  },
} as const;

function variantsText(list: VariantCount[], locale: Locale, none: string): string {
  if (list.length === 0) return none;
  return list.map((v) => (v.count > 1 ? `${v.name[locale]} ×${v.count}` : v.name[locale])).join(', ');
}

/** Tài liệu HTML độc lập (inline CSS), mọi chuỗi người dùng đều được escape. */
export function renderCompareSummaryHtml(summary: CompareSummary, locale: Locale = 'vi'): string {
  const t = HTML_COPY[locale];
  const e = escapeHtml;
  const A = e(summary.a.name);
  const B = e(summary.b.name);
  const ratingRows = summary.ratings
    .map(
      (r) =>
        `<tr><td>${e(RATING_LABELS[r.key][locale])}</td><td>${r.a}</td><td>${r.b}</td>` +
        `<td class="${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}">${e(formatSignedDelta(r.delta))}</td></tr>`,
    )
    .join('\n');
  const diffRows = summary.differences
    .map(
      (d) =>
        `<tr><td>${e(d.name[locale])}</td><td>${e(t.status[d.status])}</td>` +
        `<td>${e(variantsText(d.a, locale, t.none))}</td><td>${e(variantsText(d.b, locale, t.none))}</td></tr>`,
    )
    .join('\n');
  const warningItems = [...summary.warnings.a, ...summary.warnings.b]
    .map((w) => `<li><strong>${w.side === 'a' ? A : B}:</strong> ${e(w.message[locale])}</li>`)
    .join('\n');
  const validity = (d: CompareSummaryDesign) => (d.valid ? t.valid : t.invalid);

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<title>${e(t.title)}: ${A} / ${B}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#1f2328}
table{border-collapse:collapse;margin:8px 0 16px}
th,td{border:1px solid #d0d7de;padding:4px 10px;text-align:left}
th{background:#f3f4f6}
.up{color:#15803d}.down{color:#b91c1c}
.note{font-style:italic;color:#57606a}
</style>
</head>
<body>
<h1>${e(t.title)}</h1>
<p>A: <strong>${A}</strong> (${e(validity(summary.a))}) — B: <strong>${B}</strong> (${e(validity(summary.b))})</p>
<p>${e(t.generated)}: ${e(summary.generatedAt)}</p>
<h2>${e(t.ratings)}</h2>
<table>
<thead><tr><th>${e(t.rating)}</th><th>A</th><th>B</th><th>${e(t.delta)}</th></tr></thead>
<tbody>
${ratingRows}
</tbody>
</table>
<h2>${e(t.differences)}</h2>
${
  summary.differences.length === 0
    ? `<p>${e(t.noDifferences)}</p>`
    : `<table>
<thead><tr><th>${e(t.category)}</th><th></th><th>A</th><th>B</th></tr></thead>
<tbody>
${diffRows}
</tbody>
</table>`
}
<p>${e(t.identical)}: ${summary.identicalCategoryCount}</p>
<h2>${e(t.warnings)}</h2>
${warningItems ? `<ul>\n${warningItems}\n</ul>` : `<p>${e(t.noWarnings)}</p>`}
<p class="note">${e(summary.disclaimer[locale])}</p>
</body>
</html>
`;
}

export function compareSummaryFileName(
  summary: Pick<CompareSummary, 'a' | 'b'>,
  extension: 'json' | 'html',
): string {
  const slug = (name: string) =>
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'untitled';
  return `tank-compare-${slug(summary.a.name)}-vs-${slug(summary.b.name)}.${extension}`;
}
