/**
 * Exploded view theo 6 giai đoạn.
 *
 *  - Vector explode tất định: lấy từ metadata (`direction`/`distance`) nếu có, nếu không
 *    suy ra từ bounds (tâm part − tâm cụm). Không dùng ngẫu nhiên.
 *  - Slider 0–100 chia đều cho 6 giai đoạn; giai đoạn k chạy trong [(k-1)/6, k/6].
 *  - Offset luôn cộng vào transform `original` → kéo 0→100→0 trả về đúng nguyên trạng.
 */
import {
  type Transform,
  type Vec3,
  addVec3,
  clamp,
  clamp01,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  translateTransform,
} from './transformEngine';

export type ExplodeStage = 1 | 2 | 3 | 4 | 5 | 6;

export const EXPLODE_STAGES = [
  { stage: 1, key: 'hatches', label: 'Nắp & cửa' },
  { stage: 2, key: 'externalPanels', label: 'Tấm ốp ngoài / váy xích' },
  { stage: 3, key: 'gun', label: 'Nòng pháo' },
  { stage: 4, key: 'turret', label: 'Tháp pháo' },
  { stage: 5, key: 'powerpack', label: 'Động cơ & truyền động' },
  { stage: 6, key: 'runningGear', label: 'Xích & hệ treo' },
] as const satisfies readonly { stage: ExplodeStage; key: string; label: string }[];

export type ExplodeStageKey = (typeof EXPLODE_STAGES)[number]['key'];
export const STAGE_COUNT = EXPLODE_STAGES.length;

export const stageKeyOf = (stage: ExplodeStage): ExplodeStageKey => EXPLODE_STAGES[stage - 1].key;

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface ExplodePartSpec {
  id: string;
  stage: ExplodeStage;
  /** Nhóm để "explode nhóm chọn" (mặc định = key của stage). */
  group?: string;
  /** Hướng từ metadata (không gian cha). */
  direction?: Vec3;
  /** Khoảng tách từ metadata. */
  distance?: number;
  /** Bounds của part (không gian cha) để suy hướng nếu thiếu metadata. */
  bounds?: Bounds;
}

export interface ExplodePlanEntry {
  id: string;
  stage: ExplodeStage;
  group: string;
  vector: Vec3;
}

export interface ExplodePlan {
  readonly entries: readonly ExplodePlanEntry[];
}

export const boundsCenter = (b: Bounds): Vec3 => scaleVec3(addVec3(b.min, b.max), 0.5);
export const boundsSize = (b: Bounds): Vec3 => subVec3(b.max, b.min);

export function unionBounds(list: readonly Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of list) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/**
 * Vector explode tất định cho một part.
 * Ưu tiên metadata; nếu không thì hướng = tâm part − tâm cụm; nếu trùng tâm thì +Y.
 * Khoảng cách mặc định = `distanceScale` × đường chéo bounds của part (tối thiểu `minDistance`).
 */
export function computeExplodeVector(
  part: ExplodePartSpec,
  assemblyCenter: Vec3,
  options: { distanceScale?: number; minDistance?: number } = {},
): Vec3 {
  const scale = options.distanceScale ?? 1.5;
  const minDistance = options.minDistance ?? 0.5;

  let dir: Vec3;
  if (part.direction) {
    dir = normalizeVec3(part.direction);
  } else if (part.bounds) {
    dir = normalizeVec3(subVec3(boundsCenter(part.bounds), assemblyCenter), [0, 1, 0]);
  } else {
    dir = [0, 1, 0];
  }

  const distance =
    part.distance ??
    Math.max(minDistance, part.bounds ? lengthVec3(boundsSize(part.bounds)) * scale : minDistance);

  return scaleVec3(dir, distance);
}

export function buildExplodePlan(
  parts: readonly ExplodePartSpec[],
  options: { center?: Vec3; distanceScale?: number; minDistance?: number } = {},
): ExplodePlan {
  const all = unionBounds(parts.flatMap((p) => (p.bounds ? [p.bounds] : [])));
  const center = options.center ?? (all ? boundsCenter(all) : [0, 0, 0]);
  const entries = [...parts]
    .sort((a, b) => a.stage - b.stage || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map<ExplodePlanEntry>((p) => ({
      id: p.id,
      stage: p.stage,
      group: p.group ?? stageKeyOf(p.stage),
      vector: computeExplodeVector(p, center, options),
    }));
  return { entries };
}

/** smoothstep: đơn điệu, f(0)=0 và f(1)=1 chính xác. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Tiến độ (0..1) của một giai đoạn tại giá trị slider 0–100.
 * Giai đoạn k bắt đầu khi giai đoạn k−1 đã xong → tách đúng thứ tự.
 */
export function stageProgress(value: number, stage: ExplodeStage): number {
  const global = (clamp(value, 0, 100) / 100) * STAGE_COUNT;
  return clamp01(global - (stage - 1));
}

/** Giai đoạn đang chạy tại giá trị slider (0 nếu chưa tách). */
export function activeStage(value: number): 0 | ExplodeStage {
  const v = clamp(value, 0, 100);
  if (v === 0) return 0;
  return Math.min(STAGE_COUNT, Math.ceil((v / 100) * STAGE_COUNT)) as ExplodeStage;
}

export function isSelected(entry: ExplodePlanEntry, selection: ReadonlySet<string> | readonly string[] | undefined): boolean {
  if (!selection) return true;
  const set = selection instanceof Set ? selection : new Set(selection as readonly string[]);
  if (set.size === 0) return true;
  return set.has(entry.id) || set.has(entry.group) || set.has(stageKeyOf(entry.stage));
}

/**
 * Offset của từng part tại giá trị slider. Nếu có `selection` (khác rỗng) thì chỉ các part
 * được chọn (theo id / group / stage key) mới tách, các part khác offset 0.
 */
export function computeExplodeOffsets(
  plan: ExplodePlan,
  value: number,
  selection?: ReadonlySet<string> | readonly string[],
): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const e of plan.entries) {
    const t = isSelected(e, selection) ? smooth(stageProgress(value, e.stage)) : 0;
    out.set(e.id, t === 0 ? [0, 0, 0] : scaleVec3(e.vector, t));
  }
  return out;
}

/** Transform cuối = original (hoặc pose cơ cấu) + offset; không đọc transform hiện tại. */
export function explodedTransform(base: Transform, offset: Vec3 | undefined): Transform {
  return translateTransform(base, offset ?? [0, 0, 0]);
}

export function computeExplodedTransforms(
  plan: ExplodePlan,
  originals: ReadonlyMap<string, Transform>,
  value: number,
  selection?: ReadonlySet<string> | readonly string[],
): Map<string, Transform> {
  const offsets = computeExplodeOffsets(plan, value, selection);
  const out = new Map<string, Transform>();
  for (const [id, original] of originals) out.set(id, explodedTransform(original, offsets.get(id)));
  return out;
}
