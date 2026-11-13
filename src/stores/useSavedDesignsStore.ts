import { create } from 'zustand';
import { createDefaultConfiguration } from '@/domain/defaultConfiguration';
import { SCHEMA_VERSION, type SavedDesign, type VehicleConfiguration } from '@/domain/models/types';
import {
  DesignRepositoryError,
  LocalStorageDesignRepository,
  STORAGE_KEY_PREFIX,
  type DesignRepository,
} from '@/services/designRepository';
import { cloneConfiguration, useVehicleStore, type VehicleStore } from './useVehicleStore';

/**
 * Store quản lý danh sách thiết kế đã lưu (CRUD) và liên kết với cấu hình đang chỉnh sửa
 * trong {@link useVehicleStore}. Dữ liệu bền vững nằm ở {@link DesignRepository}
 * (mặc định LocalStorage) nên vẫn còn sau khi tải lại trang.
 */

export const DESIGN_NAME_MAX_LENGTH = 80;
export const COPY_SUFFIX = ' (bản sao)';

export interface SaveOptions {
  name?: string;
  /** `undefined` = giữ thumbnail cũ (nếu có). */
  thumbnailDataUrl?: string;
}

export interface SavedDesignsValues {
  designs: SavedDesign[];
  /** Thiết kế đang mở trong trình chỉnh sửa; `null` = chưa lưu lần nào. */
  currentId: string | null;
  /** Lỗi gần nhất (ví dụ LocalStorage đầy) để UI hiển thị. */
  error: string | null;
}

export interface SavedDesignsActions {
  /** Đọc lại danh sách từ kho lưu. */
  refresh: () => void;
  /** Tạo thiết kế mới từ cấu hình mặc định, lưu ngay và mở trong trình chỉnh sửa. */
  createNew: (name?: string) => SavedDesign | null;
  /** Lưu cấu hình đang chỉnh sửa vào thiết kế hiện tại (hoặc tạo mới nếu chưa có). */
  saveCurrent: (options?: SaveOptions) => SavedDesign | null;
  /** Lưu cấu hình đang chỉnh sửa thành một thiết kế MỚI và chuyển sang thiết kế đó. */
  saveAs: (name: string, thumbnailDataUrl?: string) => SavedDesign | null;
  /** Nạp thiết kế vào trình chỉnh sửa (xoá lịch sử undo, trạng thái sạch). */
  load: (id: string) => boolean;
  rename: (id: string, name: string) => boolean;
  duplicate: (id: string) => SavedDesign | null;
  remove: (id: string) => boolean;
  /** Thêm thiết kế đã nhập (đổi id nếu trùng); `open` = nạp luôn vào trình chỉnh sửa. */
  importDesign: (design: SavedDesign, options?: { open?: boolean }) => SavedDesign | null;
  /**
   * Khi khởi động: nạp lại thiết kế đang mở ở phiên trước (theo `currentId` đã lưu) vào trình
   * chỉnh sửa, để "Lưu" tiếp tục cập nhật đúng thiết kế đó. Trả về `false` nếu không có / đã bị xoá.
   */
  restoreCurrent: () => boolean;
  clearError: () => void;
}

export type SavedDesignsStore = SavedDesignsValues & SavedDesignsActions;

/** Nơi ghi nhớ id thiết kế đang mở giữa các lần tải trang. */
export interface CurrentIdStorage {
  get: () => string | null;
  set: (id: string | null) => void;
}

/** Key LocalStorage lưu id thiết kế đang mở (dùng chung giữa các tab; tab ghi sau cùng thắng). */
export const CURRENT_DESIGN_ID_KEY = 'tank.currentDesignId';

/** {@link CurrentIdStorage} trên `Storage` (mặc định `window.localStorage`); lỗi storage bị bỏ qua. */
export function createCurrentIdStorage(storage?: Storage): CurrentIdStorage {
  const resolve = (): Storage | undefined =>
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  return {
    get: () => {
      try {
        return resolve()?.getItem(CURRENT_DESIGN_ID_KEY) ?? null;
      } catch {
        return null;
      }
    },
    set: (id) => {
      try {
        const s = resolve();
        if (id === null) s?.removeItem(CURRENT_DESIGN_ID_KEY);
        else s?.setItem(CURRENT_DESIGN_ID_KEY, id);
      } catch {
        /* best-effort */
      }
    },
  };
}

export interface SavedDesignsDeps {
  repository: DesignRepository;
  vehicle?: { getState: () => Pick<VehicleStore, 'configuration' | 'load' | 'markSaved'> };
  /** Mặc định `localStorage[CURRENT_DESIGN_ID_KEY]`. */
  currentIdStorage?: CurrentIdStorage;
  generateId?: () => string;
  now?: () => string;
}

export function defaultGenerateId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Chuẩn hoá tên: bỏ khoảng trắng thừa; `null` nếu rỗng hoặc quá dài. */
export function normalizeDesignName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > DESIGN_NAME_MAX_LENGTH) return null;
  return trimmed;
}

export function copyName(name: string): string {
  return name.slice(0, DESIGN_NAME_MAX_LENGTH - COPY_SUFFIX.length).trimEnd() + COPY_SUFFIX;
}

const errorMessage = (error: unknown): string =>
  error instanceof DesignRepositoryError || error instanceof Error ? error.message : String(error);

export function createSavedDesignsStore({
  repository,
  vehicle = useVehicleStore,
  currentIdStorage = createCurrentIdStorage(),
  generateId = defaultGenerateId,
  now = () => new Date().toISOString(),
}: SavedDesignsDeps) {
  return create<SavedDesignsStore>()((set, get) => {
    /** Đặt thiết kế đang mở và ghi nhớ cho lần tải trang sau. */
    const setCurrent = (id: string | null) => {
      currentIdStorage.set(id);
      set({ currentId: id });
    };

    const safeList = (): SavedDesign[] => {
      try {
        return repository.list();
      } catch {
        return [];
      }
    };

    const safeGet = (id: string): SavedDesign | null => {
      try {
        return repository.get(id);
      } catch {
        return null;
      }
    };

    /** Gọi kho lưu; lỗi được ghi vào `error` thay vì ném ra UI. */
    const attempt = <T>(fn: () => T, fallback: T): T => {
      try {
        const result = fn();
        set({ designs: repository.list(), error: null });
        return result;
      } catch (error) {
        set({ error: errorMessage(error) });
        return fallback;
      }
    };

    const uniqueId = (): string => {
      const taken = new Set(get().designs.map((d) => d.id));
      let id = generateId();
      while (taken.has(id) || safeGet(id)) id = generateId();
      return id;
    };

    const buildDesign = (
      configuration: VehicleConfiguration,
      name: string,
      thumbnailDataUrl?: string,
    ): SavedDesign => {
      const timestamp = now();
      return {
        schemaVersion: SCHEMA_VERSION,
        id: uniqueId(),
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        configuration: cloneConfiguration(configuration),
        ...(thumbnailDataUrl && { thumbnailDataUrl }),
      };
    };

    const invalidName = () => {
      set({ error: `Tên thiết kế phải từ 1 đến ${DESIGN_NAME_MAX_LENGTH} ký tự.` });
    };

    const initialDesigns = safeList();
    const storedId = currentIdStorage.get();

    return {
      designs: initialDesigns,
      // Chỉ nhận id đã ghi nhớ nếu thiết kế vẫn còn; cấu hình được nạp lại qua `restoreCurrent`.
      currentId: storedId && initialDesigns.some((d) => d.id === storedId) ? storedId : null,
      error: null,

      refresh: () => set({ designs: safeList() }),

      createNew: (name) => {
        const finalName = normalizeDesignName(name ?? '') ?? 'Thiết kế mới';
        const configuration = createDefaultConfiguration();
        return attempt(() => {
          const saved = repository.save(buildDesign(configuration, finalName));
          vehicle.getState().load(saved.configuration);
          setCurrent(saved.id);
          return saved;
        }, null);
      },

      saveCurrent: (options = {}) => {
        const { configuration, markSaved } = vehicle.getState();
        const { currentId } = get();
        const existing = currentId ? safeGet(currentId) : null;
        const requested = options.name === undefined ? undefined : normalizeDesignName(options.name);
        if (requested === null) {
          invalidName();
          return null;
        }
        if (!existing) {
          return get().saveAs(requested ?? normalizeDesignName(configuration.name) ?? 'Thiết kế mới', options.thumbnailDataUrl);
        }
        return attempt(() => {
          const thumbnailDataUrl = options.thumbnailDataUrl ?? existing.thumbnailDataUrl;
          const next: SavedDesign = {
            ...existing,
            name: requested ?? existing.name,
            updatedAt: now(),
            configuration: cloneConfiguration(configuration),
            ...(thumbnailDataUrl && { thumbnailDataUrl }),
          };
          const saved = repository.save(next);
          markSaved();
          return saved;
        }, null);
      },

      saveAs: (name, thumbnailDataUrl) => {
        const finalName = normalizeDesignName(name);
        if (!finalName) {
          invalidName();
          return null;
        }
        const { configuration, markSaved } = vehicle.getState();
        return attempt(() => {
          const saved = repository.save(buildDesign(configuration, finalName, thumbnailDataUrl));
          markSaved();
          setCurrent(saved.id);
          return saved;
        }, null);
      },

      load: (id) => {
        const design = safeGet(id);
        if (!design) {
          set({ error: 'Không tìm thấy thiết kế.', designs: safeList() });
          return false;
        }
        vehicle.getState().load(design.configuration);
        setCurrent(id);
        set({ error: null });
        return true;
      },

      rename: (id, name) => {
        const finalName = normalizeDesignName(name);
        if (!finalName) {
          invalidName();
          return false;
        }
        const design = safeGet(id);
        if (!design) {
          set({ error: 'Không tìm thấy thiết kế.' });
          return false;
        }
        return attempt(() => {
          repository.save({ ...design, name: finalName, updatedAt: now() });
          return true;
        }, false);
      },

      duplicate: (id) => {
        const design = safeGet(id);
        if (!design) {
          set({ error: 'Không tìm thấy thiết kế.' });
          return null;
        }
        return attempt(
          () => repository.save(buildDesign(design.configuration, copyName(design.name), design.thumbnailDataUrl)),
          null,
        );
      },

      remove: (id) =>
        attempt(() => {
          const removed = repository.remove(id);
          if (removed && get().currentId === id) setCurrent(null);
          return removed;
        }, false),

      importDesign: (design, options = {}) =>
        attempt(() => {
          const collides = !!safeGet(design.id);
          const saved = repository.save({
            ...design,
            id: collides ? uniqueId() : design.id,
            configuration: cloneConfiguration(design.configuration),
          });
          if (options.open) {
            vehicle.getState().load(saved.configuration);
            setCurrent(saved.id);
          }
          return saved;
        }, null),

      restoreCurrent: () => {
        const id = get().currentId ?? currentIdStorage.get();
        const design = id ? safeGet(id) : null;
        set({ designs: safeList() });
        if (!design) {
          if (id) setCurrent(null);
          return false;
        }
        vehicle.getState().load(design.configuration);
        setCurrent(design.id);
        return true;
      },

      clearError: () => set({ error: null }),
    };
  });
}

export const useSavedDesignsStore = createSavedDesignsStore({
  repository: new LocalStorageDesignRepository(),
});

export const UNSAVED_CHANGES_MESSAGE = 'Thiết kế hiện tại có thay đổi chưa lưu. Bạn có chắc muốn rời đi?';

/**
 * Cảnh báo khi rời / tải lại trang lúc thiết kế còn thay đổi chưa lưu (sự kiện `beforeunload`).
 * Trả về hàm gỡ listener.
 */
export function installUnsavedChangesGuard(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  isDirty: () => boolean = () => useVehicleStore.getState().dirty,
): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return undefined;
    event.preventDefault();
    // Trình duyệt cũ cần returnValue; nội dung thực tế do trình duyệt quyết định.
    event.returnValue = UNSAVED_CHANGES_MESSAGE;
    return UNSAVED_CHANGES_MESSAGE;
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}

/**
 * Tự `refresh` danh sách khi tab khác thay đổi LocalStorage (sự kiện `storage`) để UI không bị cũ.
 * Trả về hàm gỡ listener.
 */
export function installStorageSync(
  store: { getState: () => Pick<SavedDesignsActions, 'refresh'> } = useSavedDesignsStore,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onStorage = (event: StorageEvent) => {
    // `key === null` khi tab khác gọi `localStorage.clear()`.
    if (event.key === null || event.key.startsWith(STORAGE_KEY_PREFIX)) store.getState().refresh();
  };
  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}

export const selectCurrentDesign = (s: SavedDesignsValues): SavedDesign | null =>
  s.designs.find((d) => d.id === s.currentId) ?? null;
