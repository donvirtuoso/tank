import { captureThumbnail, captureThumbnailAfterFrame, type ThumbnailOptions } from '@/services/importExport';

/**
 * Chụp ảnh mô hình 3D từ canvas cho báo cáo.
 *
 * Dùng chung cơ chế chụp với thumbnail thiết kế (`toDataURL` sau khung hình kế tiếp của
 * react-three-fiber), nhưng mặc định ảnh lớn hơn và định dạng PNG để in rõ nét.
 */

/**
 * Thuộc tính đánh dấu vùng chứa canvas 3D (đặt trên khung nhìn 3D). Trùng với thuộc tính
 * thumbnail của hộp thoại lưu thiết kế để chỉ chụp đúng canvas cảnh 3D, không chụp nhầm
 * canvas biểu đồ / minimap.
 */
export const SCENE_CANVAS_ATTR = 'data-design-thumbnail';

/** Cạnh dài tối đa mặc định của ảnh chụp báo cáo (px). */
export const REPORT_SCREENSHOT_MAX_SIZE = 1600;

const DEFAULT_OPTIONS: ThumbnailOptions = {
  maxSize: REPORT_SCREENSHOT_MAX_SIZE,
  type: 'image/png',
};

/** Tìm canvas cảnh 3D trong `root`; `null` nếu chưa có. */
export function findSceneCanvas(root: ParentNode | undefined = globalThis.document): HTMLCanvasElement | null {
  return root?.querySelector<HTMLCanvasElement>(`canvas[${SCENE_CANVAS_ATTR}], [${SCENE_CANVAS_ATTR}] canvas`) ?? null;
}

/** Chỉ chấp nhận data URL ảnh raster (dùng trước khi gán vào `<img src>`). */
export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** Chụp đồng bộ; trả về `undefined` nếu canvas rỗng / bị "tainted" / không hỗ trợ. */
export function captureCanvas(canvas: HTMLCanvasElement, options: ThumbnailOptions = {}): string | undefined {
  const url = captureThumbnail(canvas, { ...DEFAULT_OPTIONS, ...options });
  return isImageDataUrl(url) ? url : undefined;
}

/** Chụp trong khung hình kế tiếp (an toàn khi WebGL không bật `preserveDrawingBuffer`). */
export async function captureCanvasAfterFrame(
  canvas: HTMLCanvasElement,
  options: ThumbnailOptions = {},
): Promise<string | undefined> {
  const url = await captureThumbnailAfterFrame(canvas, { ...DEFAULT_OPTIONS, ...options });
  return isImageDataUrl(url) ? url : undefined;
}

/** Tìm canvas cảnh 3D rồi chụp; `undefined` nếu không có canvas hoặc chụp thất bại. */
export async function captureSceneScreenshot(
  getCanvas: () => HTMLCanvasElement | null = findSceneCanvas,
  options: ThumbnailOptions = {},
): Promise<string | undefined> {
  const canvas = getCanvas();
  return canvas ? captureCanvasAfterFrame(canvas, options) : undefined;
}
