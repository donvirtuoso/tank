import type { SavedDesign } from '@/domain/models/types';
import { CURRENT_SCHEMA_VERSION, isJsonObject, migrateDesign } from '@/domain/validators/migrations';
import { savedDesignSchema } from '@/domain/validators/schemas';

/**
 * Kho lưu thiết kế. Giao diện đồng bộ, đủ cho LocalStorage; nguồn khác (IndexedDB, server)
 * có thể cài đặt lại cùng giao diện ở tầng adapter.
 */
export interface DesignRepository {
  /** Mọi thiết kế hợp lệ, mới cập nhật trước. */
  list(): SavedDesign[];
  get(id: string): SavedDesign | null;
  /** Thêm mới hoặc ghi đè thiết kế cùng `id`. Ném {@link DesignRepositoryError} nếu lỗi. */
  save(design: SavedDesign): SavedDesign;
  /** Trả về `true` nếu đã xoá. */
  remove(id: string): boolean;
}

export type DesignRepositoryErrorCode = 'invalid-design' | 'quota-exceeded' | 'storage-unavailable';

export class DesignRepositoryError extends Error {
  readonly code: DesignRepositoryErrorCode;
  constructor(code: DesignRepositoryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DesignRepositoryError';
    this.code = code;
  }
}

/** Tiền tố key; key thực tế có hậu tố phiên bản schema, ví dụ `tank.savedDesigns.v1`. */
export const STORAGE_KEY_PREFIX = 'tank.savedDesigns';

export const storageKeyFor = (version: number): string => `${STORAGE_KEY_PREFIX}.v${version}`;

export const DESIGNS_STORAGE_KEY = storageKeyFor(CURRENT_SCHEMA_VERSION);

/**
 * Hậu tố key sao lưu dữ liệu hỏng / dữ liệu phiên bản cũ. Key thực tế có thêm dấu thời gian:
 * `<key>.backup.<ms>` (không ghi đè mất dữ liệu người dùng).
 */
export const BACKUP_SUFFIX = '.backup';

/** Số bản sao lưu tối đa giữ lại cho mỗi key (xoá bản cũ nhất khi vượt). */
export const MAX_BACKUPS_PER_KEY = 5;

/** Tiền tố key của mọi bản sao lưu cho `key`. */
export const backupKeyPrefix = (key: string): string => `${key}${BACKUP_SUFFIX}.`;

/** Tách `<ms>[-<seq>]` ở cuối key sao lưu. */
function parseBackupStamp(prefix: string, k: string): [ms: number, seq: number] {
  const [ms = '0', seq = '0'] = k.slice(prefix.length).split('-');
  return [Number(ms) || 0, Number(seq) || 0];
}

/** Liệt kê key sao lưu của `key`, cũ trước. */
export function listBackupKeys(storage: Storage, key: string): string[] {
  const prefix = backupKeyPrefix(key);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(prefix)) keys.push(k);
  }
  return keys.sort((a, b) => {
    const [am, as] = parseBackupStamp(prefix, a);
    const [bm, bs] = parseBackupStamp(prefix, b);
    return am - bm || as - bs;
  });
}

interface StoragePayload {
  schemaVersion: number;
  designs: unknown[];
}

export interface LocalStorageDesignRepositoryOptions {
  /** Mặc định `window.localStorage`. */
  storage?: Storage;
  /** Gọi khi gặp bản ghi hỏng / không migrate được (bản ghi bị bỏ qua, dữ liệu gốc được sao lưu). */
  onCorruptEntry?: (reason: string) => void;
  /** Đồng hồ (ms) cho dấu thời gian sao lưu; mặc định `Date.now`. */
  now?: () => number;
}

function sortByUpdatedDesc(designs: SavedDesign[]): SavedDesign[] {
  return [...designs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)
  );
}

/**
 * Cài đặt {@link DesignRepository} trên `localStorage`.
 *
 * - Key có phiên bản (`tank.savedDesigns.v<schemaVersion>`). Khi key hiện tại chưa tồn tại,
 *   dữ liệu ở key phiên bản cũ được migrate (theo `schemaVersion` từng thiết kế) rồi chuyển sang key mới.
 * - Mỗi bản ghi được migrate + kiểm tra Zod khi đọc; bản ghi hỏng bị bỏ qua và dữ liệu gốc
 *   được sao lưu sang `<key>.backup.<ms>` (mỗi nội dung khác nhau một bản, tối đa
 *   {@link MAX_BACKUPS_PER_KEY}) trước lần ghi kế tiếp.
 * - Không giữ cache: mỗi thao tác đọc lại storage (đồng bộ giữa nhiều tab).
 */
export class LocalStorageDesignRepository implements DesignRepository {
  private readonly storageOverride?: Storage;
  private readonly onCorruptEntry?: (reason: string) => void;
  private readonly now: () => number;

  constructor(options: LocalStorageDesignRepositoryOptions = {}) {
    this.storageOverride = options.storage;
    this.onCorruptEntry = options.onCorruptEntry;
    this.now = options.now ?? Date.now;
  }

  list(): SavedDesign[] {
    return sortByUpdatedDesc(this.readAll());
  }

  get(id: string): SavedDesign | null {
    return this.readAll().find((d) => d.id === id) ?? null;
  }

  save(design: SavedDesign): SavedDesign {
    const parsed = savedDesignSchema.safeParse(design);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.join('.') || '(gốc)';
      throw new DesignRepositoryError('invalid-design', `Thiết kế không hợp lệ tại ${where}: ${first?.message ?? ''}`);
    }
    const next = clone(parsed.data);
    const all = this.readAll();
    const index = all.findIndex((d) => d.id === next.id);
    if (index >= 0) all[index] = next;
    else all.push(next);
    this.writeAll(all);
    return clone(next);
  }

  remove(id: string): boolean {
    const all = this.readAll();
    const next = all.filter((d) => d.id !== id);
    if (next.length === all.length) return false;
    this.writeAll(next);
    return true;
  }

  // -------------------------------------------------------------------------

  private get storage(): Storage {
    const storage = this.storageOverride ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!storage) throw new DesignRepositoryError('storage-unavailable', 'LocalStorage không khả dụng.');
    return storage;
  }

  /**
   * Sao lưu `raw` sang `<key>.backup.<ms>`. Bỏ qua nếu nội dung y hệt đã được sao lưu (tránh
   * nhân bản mỗi lần đọc); giữ tối đa {@link MAX_BACKUPS_PER_KEY} bản mới nhất.
   */
  private backup(key: string, raw: string): boolean {
    try {
      const storage = this.storage;
      const existing = listBackupKeys(storage, key);
      if (existing.some((k) => storage.getItem(k) === raw)) return true;
      const prefix = backupKeyPrefix(key);
      // Không lùi về trước bản mới nhất (đồng hồ trùng / chạy lùi) để thứ tự luôn đúng.
      const [lastMs, lastSeq] = existing.length > 0 ? parseBackupStamp(prefix, existing.at(-1)!) : [-1, 0];
      const ms = this.now();
      const target = ms > lastMs ? `${prefix}${ms}` : `${prefix}${lastMs}-${lastSeq + 1}`;
      storage.setItem(target, raw);
      const all = [...existing, target];
      for (const old of all.slice(0, Math.max(0, all.length - MAX_BACKUPS_PER_KEY))) storage.removeItem(old);
      return true;
    } catch {
      /* bỏ qua: sao lưu chỉ là best-effort */
      return false;
    }
  }

  private corrupt(reason: string, key: string, raw: string): void {
    this.backup(key, raw);
    this.onCorruptEntry?.(reason);
  }

  /** Đọc raw payload ở key hiện tại, hoặc migrate từ key phiên bản cũ nếu chưa có. */
  private readRaw(): { key: string; raw: string; legacy: boolean } | null {
    const current = this.storage.getItem(DESIGNS_STORAGE_KEY);
    if (current !== null) return { key: DESIGNS_STORAGE_KEY, raw: current, legacy: false };
    for (let v = CURRENT_SCHEMA_VERSION - 1; v >= 0; v -= 1) {
      const key = storageKeyFor(v);
      const raw = this.storage.getItem(key);
      if (raw !== null) return { key, raw, legacy: true };
    }
    return null;
  }

  private readAll(): SavedDesign[] {
    const source = this.readRaw();
    if (!source) return [];
    const { key, raw, legacy } = source;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.corrupt('Dữ liệu LocalStorage không phải JSON hợp lệ.', key, raw);
      return [];
    }
    // Phiên bản 0 có thể lưu trực tiếp mảng thiết kế.
    const entries: unknown[] | null = Array.isArray(payload)
      ? payload
      : isJsonObject(payload) && Array.isArray(payload.designs)
        ? payload.designs
        : null;
    if (!entries) {
      this.corrupt('Cấu trúc dữ liệu LocalStorage không đúng.', key, raw);
      return [];
    }

    const designs: SavedDesign[] = [];
    let hadCorrupt = false;
    for (const entry of entries) {
      const migrated = migrateDesign(entry);
      if (!migrated.ok) {
        hadCorrupt = true;
        this.onCorruptEntry?.(migrated.message);
        continue;
      }
      const parsed = savedDesignSchema.safeParse(migrated.value);
      if (!parsed.success) {
        hadCorrupt = true;
        this.onCorruptEntry?.(parsed.error.issues[0]?.message ?? 'Bản ghi không hợp lệ.');
        continue;
      }
      designs.push(parsed.data);
    }
    if (hadCorrupt) this.corrupt('Một số thiết kế đã lưu bị hỏng và đã được bỏ qua.', key, raw);

    if (legacy) {
      // Chuyển sang key phiên bản mới; giữ key cũ dưới dạng sao lưu.
      try {
        this.writeAll(designs);
        // Chỉ xoá key cũ khi đã sao lưu được dữ liệu gốc.
        if (this.backup(key, raw)) this.storage.removeItem(key);
      } catch {
        /* nếu không ghi được, vẫn trả về dữ liệu đã migrate trong bộ nhớ */
      }
    }
    return designs;
  }

  private writeAll(designs: SavedDesign[]): void {
    const payload: StoragePayload = { schemaVersion: CURRENT_SCHEMA_VERSION, designs };
    try {
      this.storage.setItem(DESIGNS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      if (isQuotaError(error)) {
        throw new DesignRepositoryError(
          'quota-exceeded',
          'Bộ nhớ trình duyệt đã đầy. Hãy xoá bớt thiết kế hoặc xuất ra JSON.',
          { cause: error },
        );
      }
      throw new DesignRepositoryError('storage-unavailable', 'Không ghi được vào LocalStorage.', { cause: error });
    }
  }
}

/** Storage trong bộ nhớ (cho test hoặc khi LocalStorage bị chặn). */
export function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}
