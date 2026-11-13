import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import type { Catalog, ComponentInstance, SavedDesign, VehicleConfiguration } from '@/domain/models/types';
import { validateConfiguration } from '@/domain/rules/compatibility';
import { isJsonObject, migrateDesign } from '@/domain/validators/migrations';
import { savedDesignSchema } from '@/domain/validators/schemas';
import type { ZodIssue } from 'zod';

/** Giới hạn kích thước tệp JSON nhập vào (byte). */
export const MAX_IMPORT_BYTES = 1_000_000;

export const DESIGN_FILE_MIME = 'application/json';

export interface ImportError {
  /** Đường dẫn tới trường lỗi, ví dụ `configuration.instances[2].variantId`; `''` = toàn bộ tệp. */
  path: string;
  message: string;
}

export type ImportWarningCode =
  | 'migrated'
  | 'variant-replaced'
  | 'instance-removed'
  | 'required-slot-added'
  | 'compatibility';

export interface ImportWarning {
  code: ImportWarningCode;
  path: string;
  message: string;
}

export type ImportResult =
  | { ok: true; design: SavedDesign; warnings: ImportWarning[] }
  | { ok: false; errors: ImportError[] };

export interface ImportOptions {
  catalog?: Catalog;
  /** Cấu hình cung cấp biến thể mặc định an toàn cho từng slot. */
  defaults?: VehicleConfiguration;
  /** Thời điểm hiện tại (ISO) dùng khi tệp thiếu mốc thời gian. */
  now?: () => string;
}

// ---------------------------------------------------------------------------
// Định dạng lỗi
// ---------------------------------------------------------------------------

/** `['configuration', 'instances', 2, 'variantId']` → `configuration.instances[2].variantId`. */
export function formatIssuePath(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>((acc, part) => {
    if (typeof part === 'number') return `${acc}[${part}]`;
    return acc ? `${acc}.${part}` : part;
  }, '');
}

function zodIssuesToErrors(issues: ZodIssue[]): ImportError[] {
  return issues.map((issue) => ({ path: formatIssuePath(issue.path), message: issue.message }));
}

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

const sizeError = (bytes: number): ImportError => ({
  path: '',
  message: `Tệp quá lớn (${Math.ceil(bytes / 1024)} KB). Giới hạn ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB.`,
});

// ---------------------------------------------------------------------------
// Làm sạch theo catalog: thay biến thể không tồn tại bằng mặc định an toàn
// ---------------------------------------------------------------------------

export interface SanitizeResult {
  configuration: VehicleConfiguration;
  warnings: ImportWarning[];
}

/**
 * Đối chiếu cấu hình với catalog hiện tại:
 * - slot không tồn tại → bỏ chi tiết;
 * - biến thể không tồn tại / không gắn được vào slot → thay bằng biến thể mặc định của slot
 *   (hoặc bỏ nếu slot không có mặc định);
 * - vượt số lượng tối đa của slot → bỏ phần dư;
 * - slot bắt buộc còn trống → thêm biến thể mặc định.
 * Mọi thay đổi đều kèm cảnh báo. Không thay đổi đầu vào.
 */
export function sanitizeConfiguration(
  config: VehicleConfiguration,
  catalog: Catalog = defaultCatalog,
  defaults: VehicleConfiguration = createDefaultConfiguration(),
): SanitizeResult {
  const warnings: ImportWarning[] = [];
  const variants = new Map(catalog.variants.map((v) => [v.id, v]));
  const slots = new Map(catalog.compatibility.slots.map((s) => [s.id, s]));
  const defaultFor = (slotId: string) => {
    const id = defaults.instances.find((i) => i.slotId === slotId)?.variantId;
    return id && variants.has(id) ? id : null;
  };
  const accepts = (slotId: string, variantId: string) => {
    const slot = slots.get(slotId);
    const variant = variants.get(variantId);
    return (
      !!slot &&
      !!variant &&
      slot.acceptedCategories.includes(variant.categoryId) &&
      (!slot.acceptedVariantIds || slot.acceptedVariantIds.includes(variant.id))
    );
  };

  const kept: ComponentInstance[] = [];
  const countBySlot = new Map<string, number>();
  config.instances.forEach((inst, index) => {
    const base = `configuration.instances[${index}]`;
    const slot = slots.get(inst.slotId);
    if (!slot) {
      warnings.push({
        code: 'instance-removed',
        path: `${base}.slotId`,
        message: `Vị trí gắn "${inst.slotId}" không tồn tại; đã bỏ chi tiết "${inst.variantId}".`,
      });
      return;
    }
    let next = { ...inst };
    if (!accepts(slot.id, inst.variantId)) {
      const fallback = defaultFor(slot.id);
      const reason = variants.has(inst.variantId)
        ? `Biến thể "${inst.variantId}" không gắn được vào vị trí "${slot.nameVi}"`
        : `Biến thể "${inst.variantId}" không tồn tại`;
      if (!fallback || !accepts(slot.id, fallback)) {
        warnings.push({
          code: 'instance-removed',
          path: `${base}.variantId`,
          message: `${reason}; đã bỏ chi tiết khỏi "${slot.nameVi}".`,
        });
        return;
      }
      warnings.push({
        code: 'variant-replaced',
        path: `${base}.variantId`,
        message: `${reason}; đã thay bằng biến thể mặc định "${fallback}".`,
      });
      next = { ...next, variantId: fallback };
    }
    const count = countBySlot.get(slot.id) ?? 0;
    if (count >= slot.maximumInstances) {
      warnings.push({
        code: 'instance-removed',
        path: base,
        message: `Vị trí "${slot.nameVi}" chỉ nhận tối đa ${slot.maximumInstances} chi tiết; đã bỏ phần dư.`,
      });
      return;
    }
    countBySlot.set(slot.id, count + 1);
    kept.push(next);
  });

  const usedIds = new Set(kept.map((i) => i.instanceId));
  for (const slot of catalog.compatibility.slots) {
    if (!slot.required || countBySlot.has(slot.id)) continue;
    const fallback = defaultFor(slot.id);
    if (!fallback) continue;
    let n = 1;
    while (usedIds.has(`${slot.id}-${n}`)) n += 1;
    const instanceId = `${slot.id}-${n}`;
    usedIds.add(instanceId);
    kept.push({ instanceId, slotId: slot.id, variantId: fallback });
    warnings.push({
      code: 'required-slot-added',
      path: 'configuration.instances',
      message: `Thiếu chi tiết bắt buộc "${slot.nameVi}"; đã thêm biến thể mặc định "${fallback}".`,
    });
  }

  const configuration = { ...config, instances: kept };
  for (const issue of validateConfiguration(configuration, catalog)) {
    warnings.push({ code: 'compatibility', path: 'configuration', message: issue.message.vi });
  }
  return { configuration, warnings };
}

// ---------------------------------------------------------------------------
// Nhập JSON
// ---------------------------------------------------------------------------

/** Bọc một VehicleConfiguration "trần" thành bản ghi thiết kế. */
function wrapBareConfiguration(input: Record<string, unknown>, now: string): Record<string, unknown> {
  if (isJsonObject(input.configuration) || !Array.isArray(input.instances)) return input;
  return {
    ...(input.schemaVersion !== undefined && { schemaVersion: input.schemaVersion }),
    id: input.id,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    configuration: input,
  };
}

/** Phân tích chuỗi JSON thành thiết kế đã kiểm tra (Zod) và làm sạch theo catalog. */
export function parseDesignJson(text: string, options: ImportOptions = {}): ImportResult {
  const now = options.now ?? (() => new Date().toISOString());
  const bytes = byteLength(text);
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, errors: [sizeError(bytes)] };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ path: '', message: `JSON không hợp lệ: ${detail}` }] };
  }
  if (!isJsonObject(raw)) {
    return { ok: false, errors: [{ path: '', message: 'Tệp phải chứa một đối tượng thiết kế JSON.' }] };
  }

  const timestamp = now();
  const migrated = migrateDesign(wrapBareConfiguration(raw, timestamp));
  if (!migrated.ok) return { ok: false, errors: [{ path: 'schemaVersion', message: migrated.message }] };
  const shaped = { ...migrated.value };
  if (shaped.createdAt === undefined) shaped.createdAt = timestamp;
  if (shaped.updatedAt === undefined) shaped.updatedAt = shaped.createdAt;

  const parsed = savedDesignSchema.safeParse(shaped);
  if (!parsed.success) return { ok: false, errors: zodIssuesToErrors(parsed.error.issues) };

  const warnings: ImportWarning[] = [];
  if (migrated.migrated) {
    warnings.push({
      code: 'migrated',
      path: 'schemaVersion',
      message: `Đã nâng cấp dữ liệu từ schemaVersion ${migrated.fromVersion} lên ${parsed.data.schemaVersion}.`,
    });
  }
  const sanitized = sanitizeConfiguration(parsed.data.configuration, options.catalog, options.defaults);
  warnings.push(...sanitized.warnings);
  return { ok: true, design: { ...parsed.data, configuration: sanitized.configuration }, warnings };
}

/** Đọc tệp người dùng chọn; kiểm tra kích thước TRƯỚC khi đọc nội dung. */
export async function readDesignFile(file: Blob, options: ImportOptions = {}): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, errors: [sizeError(file.size)] };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, errors: [{ path: '', message: 'Không đọc được tệp.' }] };
  }
  return parseDesignJson(text, options);
}

// ---------------------------------------------------------------------------
// Xuất JSON
// ---------------------------------------------------------------------------

export function serializeDesign(design: SavedDesign): string {
  return `${JSON.stringify(design, null, 2)}\n`;
}

export function designFileName(design: Pick<SavedDesign, 'name'>): string {
  const slug = design.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `tank-design-${slug || 'untitled'}.json`;
}

/** Tải thiết kế xuống dưới dạng tệp JSON (Blob + thẻ <a download>). */
export function downloadDesign(design: SavedDesign, doc: Document = document): void {
  const blob = new Blob([serializeDesign(design)], { type: DESIGN_FILE_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = designFileName(design);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Thu hồi sau khi trình duyệt đã bắt đầu tải.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

export interface ThumbnailOptions {
  /** Cạnh dài tối đa của ảnh thu nhỏ (px). */
  maxSize?: number;
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
  /**
   * Vẽ lại khung hình ngay trước khi chụp (ví dụ `() => gl.render(scene, camera)`), cần khi
   * WebGL không bật `preserveDrawingBuffer` vì drawing buffer bị xoá sau mỗi lần hiển thị.
   */
  render?: () => void;
}

/**
 * Chụp ảnh thu nhỏ từ canvas (WebGL hoặc 2D) bằng `toDataURL`.
 * Trả về `undefined` nếu canvas rỗng, bị "tainted" hoặc trình duyệt không hỗ trợ.
 */
export function captureThumbnail(canvas: HTMLCanvasElement, options: ThumbnailOptions = {}): string | undefined {
  const { maxSize = 256, type = 'image/jpeg', quality = 0.8, render } = options;
  try {
    render?.();
    const { width, height } = canvas;
    if (!width || !height) return undefined;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    const target = canvas.ownerDocument.createElement('canvas');
    target.width = Math.max(1, Math.round(width * scale));
    target.height = Math.max(1, Math.round(height * scale));
    const ctx = target.getContext('2d');
    let url: string;
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, target.width, target.height);
      url = target.toDataURL(type, quality);
    } else {
      url = canvas.toDataURL(type, quality);
    }
    return url.startsWith('data:image/') ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Chụp trong callback `requestAnimationFrame` kế tiếp: callback này chạy SAU vòng render của
 * react-three-fiber trong cùng khung hình, nên drawing buffer vẫn còn nội dung dù không bật
 * `preserveDrawingBuffer`.
 */
export function captureThumbnailAfterFrame(
  canvas: HTMLCanvasElement,
  options: ThumbnailOptions = {},
): Promise<string | undefined> {
  const view = canvas.ownerDocument.defaultView;
  if (!view || typeof view.requestAnimationFrame !== 'function') {
    return Promise.resolve(captureThumbnail(canvas, options));
  }
  return new Promise((resolve) => {
    view.requestAnimationFrame(() => resolve(captureThumbnail(canvas, options)));
  });
}
