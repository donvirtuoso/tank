import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfiguration } from '@/domain/defaultConfiguration';
import { SCHEMA_VERSION, type SavedDesign } from '@/domain/models/types';
import {
  BACKUP_SUFFIX,
  DESIGNS_STORAGE_KEY,
  DesignRepositoryError,
  LocalStorageDesignRepository,
  MAX_BACKUPS_PER_KEY,
  createMemoryStorage,
  listBackupKeys,
  storageKeyFor,
} from './designRepository';

const design = (id: string, updatedAt = '2026-01-01T00:00:00.000Z'): SavedDesign => ({
  schemaVersion: SCHEMA_VERSION,
  id,
  name: `Design ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  configuration: createDefaultConfiguration(),
});

describe('LocalStorageDesignRepository', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryStorage();
  });
  /** Nội dung các bản sao lưu của `key`, cũ trước. */
  const backups = (key = DESIGNS_STORAGE_KEY) =>
    listBackupKeys(storage, key).map((k) => storage.getItem(k));

  it('uses a versioned storage key', () => {
    expect(DESIGNS_STORAGE_KEY).toBe(`tank.savedDesigns.v${SCHEMA_VERSION}`);
    new LocalStorageDesignRepository({ storage }).save(design('a'));
    const payload = JSON.parse(storage.getItem(DESIGNS_STORAGE_KEY) ?? 'null');
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
    expect(payload.designs).toHaveLength(1);
  });

  it('save → get returns an identical design; save overwrites by id', () => {
    const repo = new LocalStorageDesignRepository({ storage });
    const a = design('a');
    repo.save(a);
    expect(repo.get('a')).toEqual(a);
    repo.save({ ...a, name: 'Renamed' });
    expect(repo.list()).toHaveLength(1);
    expect(repo.get('a')?.name).toBe('Renamed');
  });

  it('persists across repository instances (page reload)', () => {
    new LocalStorageDesignRepository({ storage }).save(design('a'));
    expect(new LocalStorageDesignRepository({ storage }).get('a')).toEqual(design('a'));
  });

  it('lists newest first and removes by id', () => {
    const repo = new LocalStorageDesignRepository({ storage });
    repo.save(design('old', '2026-01-01T00:00:00.000Z'));
    repo.save(design('new', '2026-02-01T00:00:00.000Z'));
    expect(repo.list().map((d) => d.id)).toEqual(['new', 'old']);
    expect(repo.remove('old')).toBe(true);
    expect(repo.remove('old')).toBe(false);
    expect(repo.list().map((d) => d.id)).toEqual(['new']);
  });

  it('returns copies so callers cannot mutate stored data', () => {
    const repo = new LocalStorageDesignRepository({ storage });
    const saved = repo.save(design('a'));
    saved.configuration.instances.length = 0;
    expect(repo.get('a')?.configuration.instances.length).toBeGreaterThan(0);
  });

  it('rejects invalid designs', () => {
    const repo = new LocalStorageDesignRepository({ storage });
    expect(() => repo.save({ ...design('a'), name: '' })).toThrow(DesignRepositoryError);
    expect(repo.list()).toEqual([]);
  });

  it('migrates data from an older versioned key', () => {
    const { schemaVersion: _omit, ...legacy } = design('legacy');
    void _omit;
    const legacyConfig = { ...legacy.configuration } as Record<string, unknown>;
    delete legacyConfig.schemaVersion;
    const legacyKey = storageKeyFor(SCHEMA_VERSION - 1);
    storage.setItem(legacyKey, JSON.stringify([{ ...legacy, configuration: legacyConfig }]));
    const repo = new LocalStorageDesignRepository({ storage });
    expect(repo.get('legacy')?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(storage.getItem(DESIGNS_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(legacyKey)).toBeNull();
    expect(backups(legacyKey)).toHaveLength(1);
  });

  it('skips corrupt entries, reports them and backs up the raw data', () => {
    const onCorruptEntry = vi.fn();
    storage.setItem(
      DESIGNS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, designs: [design('ok'), { id: 42 }] }),
    );
    const repo = new LocalStorageDesignRepository({ storage, onCorruptEntry });
    expect(repo.list().map((d) => d.id)).toEqual(['ok']);
    expect(onCorruptEntry).toHaveBeenCalled();
    expect(backups()).toHaveLength(1);
    expect(backups()[0]).toContain('"id":42');
    // Đọc lại cùng dữ liệu hỏng không tạo thêm bản sao lưu trùng.
    repo.list();
    expect(backups()).toHaveLength(1);
  });

  it('backs up each new batch of corrupt data under a timestamped key', () => {
    let t = 1000;
    const repo = new LocalStorageDesignRepository({ storage, now: () => t++ });
    const write = (bad: unknown) =>
      storage.setItem(DESIGNS_STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, designs: [bad] }));

    write({ id: 'first-bad' });
    repo.list();
    repo.save(design('a')); // ghi đè key chính, bản ghi hỏng đầu tiên bị loại bỏ
    write({ id: 'second-bad' });
    repo.list();

    const keys = listBackupKeys(storage, DESIGNS_STORAGE_KEY);
    expect(keys).toEqual([`${DESIGNS_STORAGE_KEY}${BACKUP_SUFFIX}.1000`, `${DESIGNS_STORAGE_KEY}${BACKUP_SUFFIX}.1001`]);
    expect(backups()[0]).toContain('first-bad');
    expect(backups()[1]).toContain('second-bad');
  });

  it(`keeps at most ${MAX_BACKUPS_PER_KEY} backups per key (oldest dropped)`, () => {
    const repo = new LocalStorageDesignRepository({ storage, now: () => 5 });
    for (let i = 0; i < MAX_BACKUPS_PER_KEY + 2; i += 1) {
      storage.setItem(DESIGNS_STORAGE_KEY, `{broken ${i}`);
      repo.list();
    }
    const kept = backups();
    expect(kept).toHaveLength(MAX_BACKUPS_PER_KEY);
    expect(kept[0]).toBe('{broken 2');
    expect(kept.at(-1)).toBe(`{broken ${MAX_BACKUPS_PER_KEY + 1}`);
  });

  it('handles non-JSON storage content', () => {
    storage.setItem(DESIGNS_STORAGE_KEY, '{not json');
    const repo = new LocalStorageDesignRepository({ storage });
    expect(repo.list()).toEqual([]);
    expect(backups()).toEqual(['{not json']);
  });

  it('maps quota errors to a DesignRepositoryError', () => {
    const full = createMemoryStorage();
    full.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const repo = new LocalStorageDesignRepository({ storage: full });
    try {
      repo.save(design('a'));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DesignRepositoryError);
      expect((error as DesignRepositoryError).code).toBe('quota-exceeded');
    }
  });

  it('works with window.localStorage by default', () => {
    window.localStorage.clear();
    new LocalStorageDesignRepository().save(design('a'));
    expect(new LocalStorageDesignRepository().list()).toHaveLength(1);
    window.localStorage.clear();
  });
});
