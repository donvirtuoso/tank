import {
  RATING_KEYS,
  type Catalog,
  type RatingKey,
  type SimulatedRatings,
  type VehicleConfiguration,
} from '../models/types';

/**
 * Chấm điểm GIẢ LẬP cho trò chơi/giáo dục. Không mô phỏng thông số thực.
 *
 * Công thức (tất định):
 *   điểm[k] = clamp(round(BASE + Σ modifier[k] của các biến thể hợp lệ), 0, 100)
 * Biến thể không tồn tại trong catalog bị bỏ qua.
 */
export const BASE_RATING = 50;
export const MIN_RATING = 0;
export const MAX_RATING = 100;

export function clampRating(value: number): number {
  if (Number.isNaN(value)) return MIN_RATING;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(value)));
}

export function computeRawRatings(
  config: VehicleConfiguration,
  catalog: Catalog,
): SimulatedRatings {
  const variants = new Map(catalog.variants.map((v) => [v.id, v]));
  const totals = Object.fromEntries(RATING_KEYS.map((k) => [k, BASE_RATING])) as SimulatedRatings;
  for (const inst of config.instances) {
    const variant = variants.get(inst.variantId);
    if (!variant) continue;
    for (const key of RATING_KEYS) {
      totals[key] += variant.simulatedRatings[key] ?? 0;
    }
  }
  return totals;
}

export function computeScore(config: VehicleConfiguration, catalog: Catalog): SimulatedRatings {
  const raw = computeRawRatings(config, catalog);
  const result = {} as SimulatedRatings;
  for (const key of RATING_KEYS) {
    result[key] = clampRating(raw[key]);
  }
  return result;
}

/** Chênh lệch điểm giữa hai cấu hình (b - a), hữu ích cho UI so sánh. */
export function diffScores(a: SimulatedRatings, b: SimulatedRatings): Record<RatingKey, number> {
  const out = {} as Record<RatingKey, number>;
  for (const key of RATING_KEYS) out[key] = b[key] - a[key];
  return out;
}
