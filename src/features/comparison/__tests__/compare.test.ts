import { describe, expect, it } from 'vitest';
import {
  buildCompareSummary,
  compareConfigurations,
  type CategoryDiff,
  compareSummaryFileName,
  compareWarnings,
  componentIdsForCategories,
  diffCategories,
  escapeHtml,
  formatSignedDelta,
  ratingDeltas,
  renderCompareSummaryHtml,
  serializeCompareSummary,
} from '@/domain/compare';
import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import {
  SCHEMA_VERSION,
  type Catalog,
  type ComponentVariant,
  type RatingModifiers,
  type VehicleConfiguration,
} from '@/domain/models/types';
import { placeVariant } from '@/domain/rules/compatibility';
import { CameraSyncHub } from '../CompareView';

// ---------------------------------------------------------------------------
// Catalog nhỏ để kiểm tra số liệu chính xác
// ---------------------------------------------------------------------------

function variant(id: string, categoryId: string, ratings: RatingModifiers, tags: string[] = []): ComponentVariant {
  return {
    id,
    categoryId,
    nameVi: `VI ${id}`,
    nameEn: `EN ${id}`,
    geometrySource: 'procedural',
    procedural: { primitive: 'box', dimensions: {} },
    attachmentAnchor: { parent: 'hull', position: [0, 0, 0], rotation: [0, 0, 0] },
    materialPreset: 'steel-matte',
    animationMetadata: { kind: 'none' },
    simulatedRatings: ratings,
    educationalNotes: { vi: '', en: '' },
    tags,
  };
}

const catalog: Catalog = {
  categories: [
    { id: 'hull', nameVi: 'Thân', nameEn: 'Hull', icon: 'box', sortOrder: 1 },
    { id: 'turret', nameVi: 'Tháp', nameEn: 'Turret', icon: 'turret', sortOrder: 2 },
    { id: 'storage', nameVi: 'Hộp đồ', nameEn: 'Storage', icon: 'crate', sortOrder: 3 },
    { id: 'antenna', nameVi: 'Ăng-ten', nameEn: 'Antenna', icon: 'antenna', sortOrder: 4 },
  ],
  variants: [
    variant('hull-s', 'hull', { mobility: 10, protection: -5 }, ['hull-small']),
    variant('hull-l', 'hull', { mobility: -10, protection: 20 }, ['hull-large']),
    variant('turret-s', 'turret', { firepower: 5 }),
    variant('turret-l', 'turret', { firepower: 15, concealment: -10 }, ['turret-large']),
    variant('box-a', 'storage', { reliability: 2 }),
    variant('box-b', 'storage', { reliability: 4 }),
    variant('ant', 'antenna', { concealment: -3 }),
  ],
  compatibility: {
    schemaVersion: SCHEMA_VERSION,
    slots: [
      { id: 'hull', nameVi: 'Thân', nameEn: 'Hull', acceptedCategories: ['hull'], required: true, maximumInstances: 1 },
      { id: 'turret', nameVi: 'Tháp', nameEn: 'Turret', acceptedCategories: ['turret'], required: true, maximumInstances: 1 },
      { id: 'storage', nameVi: 'Hộp', nameEn: 'Storage', acceptedCategories: ['storage'], required: false, maximumInstances: 3 },
      { id: 'antenna', nameVi: 'Ăng-ten', nameEn: 'Antenna', acceptedCategories: ['antenna'], required: false, maximumInstances: 1 },
    ],
    rules: [
      {
        id: 'large-turret-needs-large-hull',
        kind: 'requiresTag',
        source: { categoryId: 'turret', tag: 'turret-large' },
        target: { categoryId: 'hull', tags: ['hull-large'] },
        message: { vi: 'Tháp lớn cần thân lớn.', en: 'Large turret needs large hull.' },
      },
    ],
  },
};

function config(id: string, parts: [slotId: string, variantId: string][]): VehicleConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: id,
    instances: parts.map(([slotId, variantId], i) => ({ instanceId: `${slotId}-${i}`, slotId, variantId })),
  };
}

const A = config('A', [
  ['hull', 'hull-s'],
  ['turret', 'turret-s'],
  ['storage', 'box-a'],
  ['storage', 'box-b'],
  ['antenna', 'ant'],
]);
const B = config('B', [
  ['hull', 'hull-l'],
  ['turret', 'turret-s'],
  ['storage', 'box-b'],
  ['storage', 'box-a'],
  ['storage', 'box-a'],
]);

// ---------------------------------------------------------------------------
// diffCategories
// ---------------------------------------------------------------------------

describe('diffCategories', () => {
  const diff = diffCategories(A, B, catalog);
  const get = (id: string): CategoryDiff => {
    const found = diff.find((d) => d.categoryId === id);
    if (!found) throw new Error(`missing category ${id}`);
    return found;
  };
  const byId = { hull: get('hull'), turret: get('turret'), storage: get('storage'), antenna: get('antenna') };

  it('lists every category present on either side, sorted by sortOrder', () => {
    expect(diff.map((d) => d.categoryId)).toEqual(['hull', 'turret', 'storage', 'antenna']);
  });

  it('classifies same / changed / onlyA / onlyB', () => {
    expect(byId.hull.status).toBe('changed');
    expect(byId.turret.status).toBe('same');
    expect(byId.storage.status).toBe('changed');
    expect(byId.antenna.status).toBe('onlyA');
    expect(diffCategories(B, A, catalog).find((d) => d.categoryId === 'antenna')?.status).toBe('onlyB');
  });

  it('groups variants with counts, independent of instance order', () => {
    expect(byId.storage.a).toEqual([
      { variantId: 'box-a', name: { vi: 'VI box-a', en: 'EN box-a' }, count: 1 },
      { variantId: 'box-b', name: { vi: 'VI box-b', en: 'EN box-b' }, count: 1 },
    ]);
    expect(byId.storage.b.map((v) => [v.variantId, v.count])).toEqual([
      ['box-a', 2],
      ['box-b', 1],
    ]);
    const reordered = { ...A, instances: [...A.instances].reverse() };
    expect(diffCategories(A, reordered, catalog).every((d) => d.status === 'same')).toBe(true);
  });

  it('keeps unknown variants under the slot category', () => {
    const odd = config('odd', [['hull', 'ghost-hull']]);
    const d = diffCategories(odd, config('empty', []), catalog);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ categoryId: 'hull', status: 'onlyA' });
    expect(d[0]?.a[0]).toMatchObject({ variantId: 'ghost-hull', name: { vi: 'ghost-hull', en: 'ghost-hull' } });
  });

  it('does not mutate its inputs', () => {
    const snapshot = JSON.stringify([A, B]);
    compareConfigurations(A, B, catalog);
    expect(JSON.stringify([A, B])).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Chỉ số
// ---------------------------------------------------------------------------

describe('rating deltas', () => {
  it('computes b − a for each rating key in order', () => {
    const cmp = compareConfigurations(A, B, catalog);
    // A: base 50 + hull-s(+10 mob, −5 prot) + turret-s(+5 fire) + box-a(+2) + box-b(+4) + ant(−3 conc)
    expect(cmp.ratingsA).toEqual({ mobility: 60, protection: 45, firepower: 55, reliability: 56, concealment: 47 });
    // B: base 50 + hull-l(−10 mob, +20 prot) + turret-s(+5) + box-b(+4) + 2×box-a(+2)
    expect(cmp.ratingsB).toEqual({ mobility: 40, protection: 70, firepower: 55, reliability: 58, concealment: 50 });
    expect(cmp.ratings).toEqual([
      { key: 'mobility', a: 60, b: 40, delta: -20 },
      { key: 'protection', a: 45, b: 70, delta: 25 },
      { key: 'firepower', a: 55, b: 55, delta: 0 },
      { key: 'reliability', a: 56, b: 58, delta: 2 },
      { key: 'concealment', a: 47, b: 50, delta: 3 },
    ]);
  });

  it('ratingDeltas is antisymmetric', () => {
    const a = { mobility: 1, protection: 2, firepower: 3, reliability: 4, concealment: 5 };
    const b = { mobility: 5, protection: 4, firepower: 3, reliability: 2, concealment: 1 };
    const ab = ratingDeltas(a, b).map((r) => r.delta);
    const ba = ratingDeltas(b, a).map((r) => r.delta);
    expect(ab).toEqual([4, 2, 0, -2, -4]);
    expect(ba).toEqual(ab.map((x) => -x));
  });

  it('formats signed deltas', () => {
    expect(formatSignedDelta(5)).toBe('+5');
    expect(formatSignedDelta(-3)).toBe('−3');
    expect(formatSignedDelta(0)).toBe('±0');
  });
});

// ---------------------------------------------------------------------------
// Cảnh báo tương thích
// ---------------------------------------------------------------------------

describe('compatibility warnings', () => {
  it('reports issues per side and flags issues shared by both', () => {
    const badA = config('badA', [
      ['hull', 'hull-s'],
      ['turret', 'turret-l'],
    ]);
    const badB = config('badB', [['hull', 'hull-s']]); // thiếu tháp bắt buộc
    const w = compareWarnings(badA, badB, catalog);
    expect(w.a.map((x) => [x.code, x.ruleId, x.shared])).toEqual([
      ['rule-violation', 'large-turret-needs-large-hull', false],
    ]);
    expect(w.b.map((x) => [x.code, x.slotId, x.shared])).toEqual([['missing-required-slot', 'turret', false]]);
    expect(w.a[0]?.side).toBe('a');
    expect(w.b[0]?.side).toBe('b');

    const same = compareWarnings(badA, badA, catalog);
    expect(same.a.every((x) => x.shared)).toBe(true);
    expect(same.b.every((x) => x.shared)).toBe(true);
  });

  it('marks validity on the comparison', () => {
    const cmp = compareConfigurations(A, config('X', [['hull', 'hull-s']]), catalog);
    expect(cmp.validA).toBe(true);
    expect(cmp.validB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Highlight
// ---------------------------------------------------------------------------

describe('highlight component ids', () => {
  it('maps differing categories to scene component ids', () => {
    const cmp = compareConfigurations(A, B, catalog);
    expect(cmp.differences.map((d) => d.categoryId)).toEqual(['hull', 'storage', 'antenna']);
    expect(cmp.highlightComponentIds).toEqual(['antenna', 'hull', 'spare-tracks', 'toolbox']);
  });

  it('is empty for identical configurations and dedupes ids', () => {
    expect(compareConfigurations(A, A, catalog).highlightComponentIds).toEqual([]);
    expect(componentIdsForCategories(['hull', 'camouflage', 'unknown-cat'])).toEqual(['hull', 'turret']);
  });

  it('covers every category in the real catalog', () => {
    for (const c of defaultCatalog.categories) {
      expect(componentIdsForCategories([c.id]).length, c.id).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog thật
// ---------------------------------------------------------------------------

describe('with the default catalog', () => {
  it('detects a turret + barrel swap and matches modifier sums', () => {
    const base = createDefaultConfiguration();
    let other = placeVariant(base, defaultCatalog, 'turret', 'turret-large-welded');
    other = placeVariant(other, defaultCatalog, 'barrel', 'barrel-long');
    const cmp = compareConfigurations(base, other, defaultCatalog);
    expect(cmp.differences.map((d) => d.categoryId)).toEqual(['turret', 'barrel']);
    expect(cmp.differences.every((d) => d.status === 'changed')).toBe(true);

    const mod = (id: string) => defaultCatalog.variants.find((v) => v.id === id)!.simulatedRatings;
    for (const r of cmp.ratings) {
      const raw =
        (mod('turret-large-welded')[r.key] ?? 0) +
        (mod('barrel-long')[r.key] ?? 0) -
        (mod('turret-medium-cast')[r.key] ?? 0) -
        (mod('barrel-medium')[r.key] ?? 0);
      // Không bị kẹp ở [0,100] với cấu hình mặc định → delta = chênh lệch hệ số.
      if (r.a > 0 && r.a < 100 && r.b > 0 && r.b < 100) expect(r.delta, r.key).toBe(raw);
    }
    // Tháp lớn trên thân tiêu chuẩn vi phạm quy tắc → chỉ bên B có cảnh báo.
    expect(cmp.validA).toBe(true);
    expect(cmp.warnings.b.some((w) => w.ruleId === 'turret-large-needs-large-hull')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tóm tắt xuất file
// ---------------------------------------------------------------------------

describe('compare summary export', () => {
  const designA = { id: 'a1', name: 'Xe <A> & "đặc biệt"', updatedAt: '2026-01-01T00:00:00.000Z', configuration: A };
  const designB = { id: 'b1', name: 'Tank B', updatedAt: '2026-01-02T00:00:00.000Z', configuration: B };
  const summary = buildCompareSummary(designA, designB, catalog, { now: () => '2026-11-14T00:00:00.000Z' });

  it('builds a JSON-serialisable summary', () => {
    expect(summary).toMatchObject({
      format: 'tank-compare-summary',
      version: 1,
      generatedAt: '2026-11-14T00:00:00.000Z',
      a: { id: 'a1', valid: true },
      b: { id: 'b1', valid: true },
      identicalCategoryCount: 1,
    });
    expect(summary.differences.map((d) => d.categoryId)).toEqual(['hull', 'storage', 'antenna']);
    const text = serializeCompareSummary(summary);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(summary);
  });

  it('renders escaped, localised HTML', () => {
    const html = renderCompareSummaryHtml(summary, 'en');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Xe &lt;A&gt; &amp; &quot;đặc biệt&quot;');
    expect(html).not.toContain('<A>');
    expect(html).toContain('<td>Mobility</td><td>60</td><td>40</td><td class="down">−20</td>');
    expect(html).toContain('EN box-a ×2');
    expect(html).toContain('Only A');
    expect(renderCompareSummaryHtml(summary, 'vi')).toContain('Chỉ số giả lập');
  });

  it('builds safe file names', () => {
    expect(compareSummaryFileName(summary, 'json')).toBe('tank-compare-xe-a-dac-biet-vs-tank-b.json');
    expect(compareSummaryFileName({ a: { ...summary.a, name: '!!!' }, b: summary.b }, 'html')).toBe(
      'tank-compare-untitled-vs-tank-b.html',
    );
  });

  it('escapes all HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

// ---------------------------------------------------------------------------
// Đồng bộ camera
// ---------------------------------------------------------------------------

describe('CameraSyncHub', () => {
  const pose = (x: number) => ({ position: [x, 1, 1] as [number, number, number], target: [0, 0, 0] as [number, number, number] });

  it('propagates the leader pose to the other side when enabled', () => {
    const hub = new CameraSyncHub(true);
    expect(hub.alignRequest).toBe('a');
    hub.begin('a');
    expect(hub.publish('a', pose(3))).toBe(true);
    expect(hub.alignRequest).toBeNull();
    expect(hub.consume('b', 0)).toEqual(pose(3));
    // Bên ghi không tự nhận lại pose của mình.
    expect(hub.consume('a', 0)).toBeNull();
    // Đã áp dụng phiên bản hiện tại → không còn gì mới.
    expect(hub.consume('b', hub.version)).toBeNull();
  });

  it('ignores echo publishes from the follower', () => {
    const hub = new CameraSyncHub(true);
    hub.begin('a');
    hub.publish('a', pose(3));
    expect(hub.publish('b', pose(9))).toBe(false);
    expect(hub.pose).toEqual(pose(3));
    // Người dùng chuyển sang xoay bên B → B thành leader.
    hub.begin('b');
    expect(hub.publish('b', pose(9))).toBe(true);
    expect(hub.consume('a', 0)).toEqual(pose(9));
  });

  it('keeps both sides independent when disabled', () => {
    const hub = new CameraSyncHub(false);
    expect(hub.alignRequest).toBeNull();
    hub.begin('a');
    expect(hub.publish('a', pose(3))).toBe(false);
    expect(hub.consume('b', -1)).toBeNull();

    hub.setEnabled(true, 'b');
    expect(hub.alignRequest).toBe('b');
    hub.publish('b', pose(7));
    expect(hub.consume('a', -1)).toEqual(pose(7));

    hub.setEnabled(false);
    expect(hub.consume('a', -1)).toBeNull();
  });

  it('returns copies so callers cannot mutate shared state', () => {
    const hub = new CameraSyncHub(true);
    const p = pose(2);
    hub.publish('a', p);
    p.position[0] = 99;
    const got = hub.consume('b', 0)!;
    got.position[0] = 42;
    expect(hub.pose?.position[0]).toBe(2);
  });
});
