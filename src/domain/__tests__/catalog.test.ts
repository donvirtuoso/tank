import { describe, expect, it } from 'vitest';
import categoriesJson from '../../data/categories.json';
import variantsJson from '../../data/variants.json';
import compatibilityJson from '../../data/compatibility.json';
import {
  categoriesFileSchema,
  compatibilityFileSchema,
  savedDesignSchema,
  variantsFileSchema,
  vehicleConfigurationSchema,
} from '../validators/schemas';
import { createDefaultConfiguration, defaultCatalog } from '../defaultConfiguration';
import {
  checkPlacement,
  isConfigurationValid,
  listCompatibleVariants,
  placeVariant,
  validateConfiguration,
} from '../rules/compatibility';
import { computeScore } from '../scoring/score';
import { RATING_KEYS, SCHEMA_VERSION, type VehicleConfiguration } from '../models/types';

const catalog = defaultCatalog;

function withVariant(config: VehicleConfiguration, slotId: string, variantId: string) {
  return placeVariant(config, catalog, slotId, variantId);
}

function without(config: VehicleConfiguration, slotId: string): VehicleConfiguration {
  return { ...config, instances: config.instances.filter((i) => i.slotId !== slotId) };
}

describe('catalog seed data', () => {
  it('passes Zod validation for every data file', () => {
    expect(categoriesFileSchema.safeParse(categoriesJson).success).toBe(true);
    expect(variantsFileSchema.safeParse(variantsJson).success).toBe(true);
    expect(compatibilityFileSchema.safeParse(compatibilityJson).success).toBe(true);
  });

  it('has exactly 20 categories with unique ids and sortOrder', () => {
    expect(catalog.categories).toHaveLength(20);
    expect(new Set(catalog.categories.map((c) => c.id)).size).toBe(20);
    expect(new Set(catalog.categories.map((c) => c.sortOrder)).size).toBe(20);
  });

  it('has at least 62 variants with unique ids and valid categoryId', () => {
    expect(catalog.variants.length).toBeGreaterThanOrEqual(62);
    const ids = catalog.variants.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categoryIds = new Set(catalog.categories.map((c) => c.id));
    for (const v of catalog.variants) {
      expect(categoryIds.has(v.categoryId), `${v.id} -> ${v.categoryId}`).toBe(true);
      expect(v.geometrySource).toBe('procedural');
    }
  });

  it('gives every category at least one variant', () => {
    for (const c of catalog.categories) {
      expect(catalog.variants.some((v) => v.categoryId === c.id), c.id).toBe(true);
    }
  });

  it('has compatibility data that references existing categories, variants and tags', () => {
    const categoryIds = new Set(catalog.categories.map((c) => c.id));
    const variantById = new Map(catalog.variants.map((v) => [v.id, v]));
    const allTags = new Set(catalog.variants.flatMap((v) => v.tags));
    const slotIds = catalog.compatibility.slots.map((s) => s.id);
    expect(new Set(slotIds).size).toBe(slotIds.length);
    for (const slot of catalog.compatibility.slots) {
      for (const cat of slot.acceptedCategories) expect(categoryIds.has(cat), cat).toBe(true);
      for (const vid of slot.acceptedVariantIds ?? []) {
        const v = variantById.get(vid);
        expect(v, vid).toBeDefined();
        expect(slot.acceptedCategories).toContain(v!.categoryId);
      }
    }
    const ruleIds = catalog.compatibility.rules.map((r) => r.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    for (const rule of catalog.compatibility.rules) {
      expect(categoryIds.has(rule.source.categoryId)).toBe(true);
      expect(categoryIds.has(rule.target.categoryId)).toBe(true);
      expect(allTags.has(rule.source.tag), rule.source.tag).toBe(true);
      for (const t of rule.target.tags) expect(allTags.has(t), t).toBe(true);
    }
  });

  it('rejects malformed variants', () => {
    const bad = { ...variantsJson, variants: [{ ...variantsJson.variants[0], geometrySource: 'gltf' }] };
    expect(variantsFileSchema.safeParse(bad).success).toBe(false);
    const badRating = {
      ...variantsJson,
      variants: [{ ...variantsJson.variants[0], simulatedRatings: { mobility: 99 } }],
    };
    expect(variantsFileSchema.safeParse(badRating).success).toBe(false);
  });
});

describe('default configuration "Medium tank"', () => {
  it('is schema-valid and passes all compatibility rules', () => {
    const config = createDefaultConfiguration();
    expect(config.name).toBe('Medium tank');
    expect(vehicleConfigurationSchema.safeParse(config).success).toBe(true);
    expect(validateConfiguration(config, catalog)).toEqual([]);
    expect(isConfigurationValid(config, catalog)).toBe(true);
  });

  it('can be wrapped in a SavedDesign with schemaVersion', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const design = {
      schemaVersion: SCHEMA_VERSION,
      id: 'd1',
      name: 'My tank',
      createdAt: now,
      updatedAt: now,
      configuration: createDefaultConfiguration(),
    };
    expect(savedDesignSchema.safeParse(design).success).toBe(true);
    expect(savedDesignSchema.safeParse({ ...design, schemaVersion: 999 }).success).toBe(false);
  });

  it('returns a fresh copy each call', () => {
    const a = createDefaultConfiguration();
    a.instances.pop();
    expect(createDefaultConfiguration().instances.length).toBe(a.instances.length + 1);
  });
});

describe('compatibility rules', () => {
  const base = createDefaultConfiguration();

  it('accepts compatible variants', () => {
    expect(checkPlacement(base, catalog, 'turret', 'turret-small-round')).toEqual([]);
    expect(checkPlacement(base, catalog, 'barrel', 'barrel-long')).toEqual([]);
    expect(checkPlacement(base, catalog, 'suspension', 'suspension-coil')).toEqual([]);
    expect(checkPlacement(base, catalog, 'drivetrain', 'drivetrain-front-shaft')).toEqual([]);
    expect(checkPlacement(base, catalog, 'turret-hatch', 'hatch-split')).toEqual([]);
    expect(checkPlacement(base, catalog, 'hull-hatch', 'hatch-split')).toEqual([]);
  });

  it('rejects a large turret on a medium hull (turret ↔ hull)', () => {
    const issues = checkPlacement(base, catalog, 'turret', 'turret-large-welded');
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('rule-violation');
    expect(issues[0].ruleId).toBe('turret-large-needs-large-hull');
    expect(issues[0].messageKey).toBe('compatibility.rule.turret-large-needs-large-hull');
    expect(issues[0].message.vi.length).toBeGreaterThan(0);
    expect(issues[0].message.en.length).toBeGreaterThan(0);
  });

  it('rejects a compact hull under a medium turret', () => {
    const issues = checkPlacement(base, catalog, 'hull', 'hull-compact');
    expect(issues.map((i) => i.ruleId)).toContain('turret-medium-needs-medium-hull');
  });

  it('accepts a large turret once hull and track are upgraded', () => {
    let cfg = withVariant(base, 'hull', 'hull-heavy');
    cfg = withVariant(cfg, 'track', 'track-wide');
    cfg = withVariant(cfg, 'turret', 'turret-large-welded');
    expect(validateConfiguration(cfg, catalog)).toEqual([]);
  });

  it('enforces wheel layout ↔ suspension and track', () => {
    const issues = checkPlacement(base, catalog, 'road-wheels', 'wheels-small-bogie');
    expect(issues.map((i) => i.ruleId)).toEqual(['small-wheels-need-bogie-or-coil']);

    const interleaved = withVariant(base, 'road-wheels', 'wheels-interleaved');
    expect(validateConfiguration(interleaved, catalog)).toEqual([]);
    const narrow = checkPlacement(interleaved, catalog, 'track', 'track-narrow');
    expect(narrow.map((i) => i.ruleId)).toEqual(['interleaved-wheels-forbid-narrow-track']);
    const bogie = checkPlacement(interleaved, catalog, 'suspension', 'suspension-bogie');
    expect(bogie.map((i) => i.ruleId)).toEqual(['interleaved-wheels-need-torsion']);
  });

  it('enforces hatch ↔ slot', () => {
    const issues = checkPlacement(base, catalog, 'turret-hatch', 'hatch-square');
    expect(issues.map((i) => i.code)).toContain('variant-not-accepted');
    expect(issues[0].message.en).toContain('Turret');
  });

  it('enforces engine ↔ drivetrain layout', () => {
    const front = checkPlacement(base, catalog, 'engine', 'engine-front');
    expect(front.map((i) => i.ruleId)).toEqual(['front-engine-needs-front-drive']);
    const direct = checkPlacement(base, catalog, 'drivetrain', 'drivetrain-front-direct');
    expect(direct.map((i) => i.ruleId)).toEqual(['rear-engine-needs-rear-or-shaft-drive']);
    let cfg = withVariant(base, 'engine', 'engine-front');
    cfg = withVariant(cfg, 'drivetrain', 'drivetrain-front-direct');
    expect(validateConfiguration(cfg, catalog)).toEqual([]);
  });

  it('rejects a variant from the wrong category', () => {
    const issues = checkPlacement(base, catalog, 'turret', 'hull-heavy');
    expect(issues.some((i) => i.code === 'category-not-accepted')).toBe(true);
  });

  it('reports missing required slots', () => {
    const issues = validateConfiguration(without(base, 'track'), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'missing-required-slot',
      slotId: 'track',
      messageKey: 'compatibility.missing-required-slot',
    });
    expect(issues[0].message.vi).toContain('Xích');
    expect(issues[0].message.en).toContain('Track');
  });

  it('reports every missing required slot on an empty configuration', () => {
    const empty: VehicleConfiguration = { ...base, instances: [] };
    const required = catalog.compatibility.slots.filter((s) => s.required).map((s) => s.id);
    const issues = validateConfiguration(empty, catalog);
    expect(issues.map((i) => i.slotId).sort()).toEqual([...required].sort());
  });

  it('reports exceeding maximumInstances, unknown ids and duplicates', () => {
    const cfg: VehicleConfiguration = {
      ...base,
      instances: [
        ...base.instances,
        { instanceId: 'extra-hull', slotId: 'hull', variantId: 'hull-standard' },
        { instanceId: 'x1', slotId: 'nope', variantId: 'hull-standard' },
        { instanceId: 'x2', slotId: 'storage', variantId: 'nope' },
        { instanceId: 'x2', slotId: 'storage', variantId: 'storage-side-crate' },
      ],
    };
    const codes = validateConfiguration(cfg, catalog).map((i) => i.code);
    expect(codes).toContain('too-many-instances');
    expect(codes).toContain('unknown-slot');
    expect(codes).toContain('unknown-variant');
    expect(codes).toContain('duplicate-instance-id');
  });

  it('does not mutate its input', () => {
    const cfg = createDefaultConfiguration();
    const snapshot = JSON.stringify(cfg);
    validateConfiguration(cfg, catalog);
    checkPlacement(cfg, catalog, 'turret', 'turret-large-welded');
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });

  it('lists compatible variants for a slot', () => {
    const ids = listCompatibleVariants(base, catalog, 'turret').map((v) => v.id);
    expect(ids).toContain('turret-medium-cast');
    expect(ids).toContain('turret-small-round');
    expect(ids).not.toContain('turret-large-welded');
    expect(ids.every((id) => id.startsWith('turret-'))).toBe(true);
  });
});

describe('simulated scoring', () => {
  const base = createDefaultConfiguration();

  it('is deterministic', () => {
    expect(computeScore(base, catalog)).toEqual(computeScore(createDefaultConfiguration(), catalog));
  });

  it('keeps all 5 ratings as integers in [0, 100]', () => {
    const configs: VehicleConfiguration[] = [base, { ...base, instances: [] }];
    // cấu hình cực đoan: gắn mọi biến thể cùng lúc
    configs.push({
      ...base,
      instances: catalog.variants.map((v, i) => ({ instanceId: `i${i}`, slotId: v.categoryId, variantId: v.id })),
    });
    for (const cfg of configs) {
      const score = computeScore(cfg, catalog);
      expect(Object.keys(score).sort()).toEqual([...RATING_KEYS].sort());
      for (const k of RATING_KEYS) {
        expect(Number.isInteger(score[k])).toBe(true);
        expect(score[k]).toBeGreaterThanOrEqual(0);
        expect(score[k]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('clamps extreme values', () => {
    const many: VehicleConfiguration = {
      ...base,
      instances: Array.from({ length: 20 }, (_, i) => ({
        instanceId: `h${i}`,
        slotId: 'hull',
        variantId: 'hull-heavy',
      })),
    };
    const score = computeScore(many, catalog);
    expect(score.protection).toBe(100);
    expect(score.mobility).toBe(0);
  });

  it('moves ratings in the expected direction when swapping variants', () => {
    const before = computeScore(base, catalog);

    const heavy = computeScore(withVariant(base, 'hull', 'hull-heavy'), catalog);
    expect(heavy.protection).toBeGreaterThan(before.protection);
    expect(heavy.mobility).toBeLessThan(before.mobility);

    const longBarrel = computeScore(withVariant(base, 'barrel', 'barrel-long'), catalog);
    expect(longBarrel.firepower).toBeGreaterThan(before.firepower);

    const lowTurret = computeScore(withVariant(base, 'turret', 'turret-low-profile'), catalog);
    expect(lowTurret.concealment).toBeGreaterThan(before.concealment);

    const camo = computeScore(withVariant(base, 'camouflage', 'camo-disruptive'), catalog);
    expect(camo.concealment).toBeGreaterThan(before.concealment);

    const wide = computeScore(withVariant(base, 'track', 'track-wide'), catalog);
    expect(wide.mobility).toBeGreaterThan(before.mobility);
  });
});
