import { describe, expect, it } from 'vitest';
import { createDefaultConfiguration } from '../defaultConfiguration';
import { SCHEMA_VERSION } from '../models/types';
import { CURRENT_SCHEMA_VERSION, migrateDesign, readSchemaVersion } from './migrations';
import { savedDesignSchema } from './schemas';

const TS = '2026-01-01T00:00:00.000Z';

describe('migrateDesign', () => {
  it('leaves current-version data untouched', () => {
    const design = {
      schemaVersion: SCHEMA_VERSION,
      id: 'a',
      name: 'A',
      createdAt: TS,
      updatedAt: TS,
      configuration: createDefaultConfiguration(),
    };
    const result = migrateDesign(design);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(false);
    expect(result.value).toEqual(design);
  });

  it('migrates v0 (no schemaVersion) design to the current version', () => {
    const { schemaVersion: _omit, ...config } = createDefaultConfiguration();
    void _omit;
    const result = migrateDesign({ id: 'a', name: 'A', createdAt: TS, updatedAt: TS, configuration: config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fromVersion).toBe(0);
    expect(result.migrated).toBe(true);
    expect(savedDesignSchema.safeParse(result.value).success).toBe(true);
  });

  it('migrates a v0 bare configuration into a design record', () => {
    const { schemaVersion: _omit, ...config } = createDefaultConfiguration();
    void _omit;
    const result = migrateDesign({ ...config, createdAt: TS, updatedAt: TS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = savedDesignSchema.safeParse(result.value);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.configuration.instances).toEqual(config.instances);
  });

  it('rejects future, invalid versions and non-objects', () => {
    expect(migrateDesign({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toMatchObject({ ok: false, code: 'future-version' });
    expect(migrateDesign({ schemaVersion: 'one' })).toMatchObject({ ok: false, code: 'invalid-version' });
    expect(migrateDesign([1, 2])).toMatchObject({ ok: false, code: 'not-object' });
    expect(migrateDesign(null)).toMatchObject({ ok: false, code: 'not-object' });
    expect(readSchemaVersion({ schemaVersion: -1 })).toBeNull();
  });
});
