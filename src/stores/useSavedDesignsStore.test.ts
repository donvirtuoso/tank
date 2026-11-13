import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfiguration } from '@/domain/defaultConfiguration';
import { SCHEMA_VERSION, type SavedDesign } from '@/domain/models/types';
import {
  DESIGNS_STORAGE_KEY,
  LocalStorageDesignRepository,
  createMemoryStorage,
} from '@/services/designRepository';
import { parseDesignJson, serializeDesign } from '@/services/importExport';
import {
  COPY_SUFFIX,
  CURRENT_DESIGN_ID_KEY,
  createCurrentIdStorage,
  createSavedDesignsStore,
  installStorageSync,
  installUnsavedChangesGuard,
  selectCurrentDesign,
} from './useSavedDesignsStore';
import { useVehicleStore, variantInSlot } from './useVehicleStore';

const vehicle = () => useVehicleStore.getState();

function setup(storage: Storage = createMemoryStorage()) {
  let n = 0;
  let t = 0;
  const store = createSavedDesignsStore({
    repository: new LocalStorageDesignRepository({ storage }),
    currentIdStorage: createCurrentIdStorage(storage),
    generateId: () => `id-${++n}`,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString(),
  });
  return { store, storage, s: () => store.getState() };
}

beforeEach(() => {
  vehicle().reset();
});

describe('useSavedDesignsStore — save / load', () => {
  it('save → load returns the exact same configuration', () => {
    const { s } = setup();
    expect(vehicle().applyChange('turret', 'turret-low-profile').ok).toBe(true);
    expect(vehicle().applyChange('side-skirt', 'skirt-plates').ok).toBe(true);
    const edited = structuredClone(vehicle().configuration);

    const saved = s().saveAs('Xe A');
    expect(saved?.configuration).toEqual(edited);
    expect(vehicle().dirty).toBe(false);

    vehicle().reset();
    expect(vehicle().configuration).not.toEqual(edited);
    expect(s().load(saved!.id)).toBe(true);
    expect(vehicle().configuration).toEqual(edited);
    expect(vehicle().dirty).toBe(false);
    expect(vehicle().past).toEqual([]);
    expect(s().currentId).toBe(saved!.id);
  });

  it('saveCurrent updates the open design instead of creating a new one', () => {
    const { s } = setup();
    const first = s().saveAs('Xe A')!;
    vehicle().applyChange('barrel', 'barrel-long');
    expect(vehicle().dirty).toBe(true);
    const second = s().saveCurrent({ thumbnailDataUrl: 'data:image/jpeg;base64,AA' })!;
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect(second.thumbnailDataUrl).toBe('data:image/jpeg;base64,AA');
    expect(s().designs).toHaveLength(1);
    expect(variantInSlot(s().designs[0]!.configuration, 'barrel')).toBe('barrel-long');
    expect(vehicle().dirty).toBe(false);
    // Lưu lại không truyền thumbnail → giữ thumbnail cũ.
    expect(s().saveCurrent()?.thumbnailDataUrl).toBe('data:image/jpeg;base64,AA');
  });

  it('saveCurrent without an open design creates one', () => {
    const { s } = setup();
    const saved = s().saveCurrent({ name: '  Xe   mới  ' });
    expect(saved?.name).toBe('Xe mới');
    expect(s().currentId).toBe(saved?.id);
    expect(selectCurrentDesign(s())?.id).toBe(saved?.id);
  });

  it('createNew saves a default design and opens it', () => {
    const { s } = setup();
    vehicle().applyChange('barrel', 'barrel-long');
    const created = s().createNew('Mẫu')!;
    expect(created.configuration).toEqual(createDefaultConfiguration());
    expect(vehicle().configuration).toEqual(createDefaultConfiguration());
    expect(vehicle().dirty).toBe(false);
    expect(s().currentId).toBe(created.id);
  });

  it('data survives a page reload (new store on the same storage)', () => {
    const storage = createMemoryStorage();
    const a = setup(storage);
    vehicle().applyChange('turret', 'turret-low-profile');
    const saved = a.s().saveAs('Xe bền')!;

    const b = setup(storage);
    expect(b.s().designs.map((d) => d.id)).toEqual([saved.id]);
    vehicle().reset();
    expect(b.s().load(saved.id)).toBe(true);
    expect(variantInSlot(vehicle().configuration, 'turret')).toBe('turret-low-profile');
  });

  it('remembers the open design across reloads so Save updates it (no duplicate)', () => {
    const storage = createMemoryStorage();
    const a = setup(storage);
    vehicle().applyChange('turret', 'turret-low-profile');
    const saved = a.s().saveAs('Xe A')!;
    expect(storage.getItem(CURRENT_DESIGN_ID_KEY)).toBe(saved.id);

    // "Tải lại trang": cấu hình trong bộ nhớ mất, store mới trên cùng storage.
    vehicle().reset();
    const b = setup(storage);
    expect(b.s().currentId).toBe(saved.id);
    expect(b.s().restoreCurrent()).toBe(true);
    expect(variantInSlot(vehicle().configuration, 'turret')).toBe('turret-low-profile');
    expect(vehicle().dirty).toBe(false);

    vehicle().applyChange('barrel', 'barrel-long');
    expect(b.s().saveCurrent()?.id).toBe(saved.id);
    expect(b.s().designs).toHaveLength(1);
  });

  it('restoreCurrent forgets a remembered design that no longer exists', () => {
    const storage = createMemoryStorage();
    storage.setItem(CURRENT_DESIGN_ID_KEY, 'gone');
    const { s } = setup(storage);
    expect(s().currentId).toBeNull();
    vehicle().applyChange('barrel', 'barrel-long');
    expect(s().restoreCurrent()).toBe(false);
    expect(storage.getItem(CURRENT_DESIGN_ID_KEY)).toBeNull();
    // Không đụng tới cấu hình đang sửa.
    expect(variantInSlot(vehicle().configuration, 'barrel')).toBe('barrel-long');
  });

  it('clears the remembered id when the open design is deleted', () => {
    const storage = createMemoryStorage();
    const { s } = setup(storage);
    const d = s().saveAs('A')!;
    s().remove(d.id);
    expect(storage.getItem(CURRENT_DESIGN_ID_KEY)).toBeNull();
  });
});

describe('useSavedDesignsStore — duplicate / rename / delete', () => {
  it('duplicate creates an independent copy with a new id', () => {
    const { s } = setup();
    const original = s().saveAs('Xe A')!;
    const copy = s().duplicate(original.id)!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe(`Xe A${COPY_SUFFIX}`);
    expect(copy.configuration).toEqual(original.configuration);
    expect(s().designs).toHaveLength(2);
    expect(s().currentId).toBe(original.id);
    s().rename(copy.id, 'Khác');
    expect(s().designs.find((d) => d.id === original.id)?.name).toBe('Xe A');
  });

  it('duplicate keeps names within the 80 character limit', () => {
    const { s } = setup();
    const original = s().saveAs('x'.repeat(80))!;
    const copy = s().duplicate(original.id)!;
    expect(copy.name.length).toBeLessThanOrEqual(80);
    expect(copy.name.endsWith(COPY_SUFFIX)).toBe(true);
  });

  it('rename trims, validates and persists', () => {
    const { s, storage } = setup();
    const d = s().saveAs('Xe A')!;
    expect(s().rename(d.id, '  Xe B ')).toBe(true);
    expect(s().designs[0]?.name).toBe('Xe B');
    expect(setup(storage).s().designs[0]?.name).toBe('Xe B');
    expect(s().rename(d.id, '   ')).toBe(false);
    expect(s().rename(d.id, 'y'.repeat(81))).toBe(false);
    expect(s().error).toMatch(/1 đến 80/);
    expect(s().designs[0]?.name).toBe('Xe B');
    expect(s().rename('missing', 'Z')).toBe(false);
  });

  it('remove deletes the design and clears currentId when it was open', () => {
    const { s } = setup();
    const a = s().saveAs('A')!;
    const b = s().saveAs('B')!;
    expect(s().currentId).toBe(b.id);
    expect(s().remove(b.id)).toBe(true);
    expect(s().currentId).toBeNull();
    expect(s().designs.map((d) => d.id)).toEqual([a.id]);
    expect(s().remove(b.id)).toBe(false);
    expect(s().load(b.id)).toBe(false);
    expect(s().error).toBeTruthy();
  });

  it('reports storage errors instead of throwing', () => {
    const storage = createMemoryStorage();
    const { s } = setup(storage);
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(s().saveAs('A')).toBeNull();
    expect(s().error).toMatch(/đầy/);
    s().clearError();
    expect(s().error).toBeNull();
  });
});

describe('useSavedDesignsStore — import', () => {
  const imported = (): SavedDesign => ({
    schemaVersion: SCHEMA_VERSION,
    id: 'shared-id',
    name: 'Nhập',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configuration: createDefaultConfiguration(),
  });

  it('adds imported designs and renames ids on collision', () => {
    const { s } = setup();
    const first = s().importDesign(imported())!;
    expect(first.id).toBe('shared-id');
    const second = s().importDesign(imported())!;
    expect(second.id).not.toBe('shared-id');
    expect(s().designs).toHaveLength(2);
  });

  it('import → open loads the (sanitised) configuration', () => {
    const { s } = setup();
    const d = imported();
    d.configuration.instances = d.configuration.instances.map((i) =>
      i.slotId === 'barrel' ? { ...i, variantId: 'barrel-unknown' } : i,
    );
    const result = parseDesignJson(serializeDesign(d));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === 'variant-replaced')).toBe(true);
    s().importDesign(result.design, { open: true });
    expect(variantInSlot(vehicle().configuration, 'barrel')).toBe('barrel-medium');
    expect(s().currentId).toBe('shared-id');
  });
});

describe('installStorageSync', () => {
  it('refreshes the list when another tab changes saved designs', () => {
    const storage = createMemoryStorage();
    const { store, s } = setup(storage);
    const other = setup(storage); // "tab khác" trên cùng storage
    other.s().saveAs('Từ tab khác');
    expect(s().designs).toHaveLength(0);

    const remove = installStorageSync(store, window);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(s().designs).toHaveLength(0);
    window.dispatchEvent(new StorageEvent('storage', { key: DESIGNS_STORAGE_KEY }));
    expect(s().designs.map((d) => d.name)).toEqual(['Từ tab khác']);

    remove();
    other.s().saveAs('Thêm nữa');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(s().designs).toHaveLength(1);
  });
});

describe('installUnsavedChangesGuard', () => {
  it('warns on beforeunload only while there are unsaved changes', () => {
    const remove = installUnsavedChangesGuard(window);
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);
    vehicle().applyChange('barrel', 'barrel-long');
    expect(fire()).toBe(true);
    vehicle().markSaved();
    expect(fire()).toBe(false);
    vehicle().applyChange('barrel', 'barrel-short');
    remove();
    expect(fire()).toBe(false);
  });

  it('accepts a custom target and dirty check', () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remove = installUnsavedChangesGuard(target, () => true);
    expect(target.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    remove();
    expect(target.removeEventListener).toHaveBeenCalledWith('beforeunload', target.addEventListener.mock.calls[0]![1]);
  });
});
