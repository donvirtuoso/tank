import { describe, expect, it, vi } from 'vitest';
import {
  getTankMaterialRefCount,
  getTankMaterials,
  MATERIAL_SPECS,
  releaseTankMaterials,
  retainTankMaterials,
} from './presets';

describe('shared tank materials', () => {
  it('creates every preset once and returns the same instances', () => {
    const a = getTankMaterials();
    const b = getTankMaterials();
    expect(a).toBe(b);
    expect(Object.keys(a).sort()).toEqual(Object.keys(MATERIAL_SPECS).sort());
    expect(a.olivePaint).toBe(b.olivePaint);
    for (const key of ['olivePaint', 'steel', 'rubber', 'metallic'] as const) {
      expect(a[key].name).toBe(`tank:${key}`);
    }
  });

  it('disposes only when the last consumer releases', () => {
    const mats = getTankMaterials();
    const spy = vi.spyOn(mats.steel, 'dispose');
    retainTankMaterials();
    retainTankMaterials();
    releaseTankMaterials();
    expect(spy).not.toHaveBeenCalled();
    releaseTankMaterials();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getTankMaterialRefCount()).toBe(0);
    // Extra release is a no-op.
    releaseTankMaterials();
    expect(getTankMaterialRefCount()).toBe(0);
    expect(getTankMaterials().steel).toBe(mats.steel);
    spy.mockRestore();
  });
});
