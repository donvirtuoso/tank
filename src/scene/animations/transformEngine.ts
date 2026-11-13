/**
 * Transform engine – hàm thuần cho transform chuẩn (canonical) và nội suy.
 *
 * Nguyên tắc chống trôi (drift):
 *  - Mỗi component có transform chuẩn `original` / `closed` / `open` được lưu theo componentId.
 *  - Mọi pose trung gian được TÍNH LẠI từ transform chuẩn + một tham số progress 0..1,
 *    không bao giờ cộng dồn delta lên transform hiện tại của object.
 *  - Tại progress = 0 / 1 trả về đúng bản sao của transform chuẩn (snap tuyệt đối).
 *
 * GSAP chỉ dùng để tween MỘT số vô hướng (progress); xem `createGsapDriver`.
 */
import gsap from 'gsap';

export type Vec3 = readonly [number, number, number];
/** Quaternion dạng [x, y, z, w] (cùng quy ước với three.js). */
export type Quat = readonly [number, number, number, number];

export interface Transform {
  readonly position: Vec3;
  readonly quaternion: Quat;
  readonly scale: Vec3;
}

export const IDENTITY_TRANSFORM: Transform = Object.freeze({
  position: [0, 0, 0] as Vec3,
  quaternion: [0, 0, 0, 1] as Quat,
  scale: [1, 1, 1] as Vec3,
});

export function makeTransform(
  position: Vec3 = [0, 0, 0],
  quaternion: Quat = [0, 0, 0, 1],
  scale: Vec3 = [1, 1, 1],
): Transform {
  return {
    position: [position[0], position[1], position[2]],
    quaternion: [quaternion[0], quaternion[1], quaternion[2], quaternion[3]],
    scale: [scale[0], scale[1], scale[2]],
  };
}

export function cloneTransform(t: Transform): Transform {
  return makeTransform(t.position, t.quaternion, t.scale);
}

// ---------------------------------------------------------------------------
// Vec3 / Quat math (thuần, không phụ thuộc three)
// ---------------------------------------------------------------------------

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function mulVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export function lengthVec3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalizeVec3(a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const len = lengthVec3(a);
  if (len < 1e-12) return [fallback[0], fallback[1], fallback[2]];
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalizeVec3(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(half)];
}

/** Tích Hamilton a * b (áp b trước, rồi a). */
export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len < 1e-12) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const t = scaleVec3(crossVec3(u, v), 2);
  return addVec3(addVec3(v, scaleVec3(t, w)), crossVec3(u, t));
}

export function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return normalizeQuat([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/**
 * Nội suy giữa hai transform chuẩn. t được kẹp 0..1; tại 0/1 trả về bản sao chính xác
 * của đầu mút để không tích lũy sai số dấu phẩy động.
 */
export function interpolateTransform(a: Transform, b: Transform, t: number): Transform {
  const k = clamp01(t);
  if (k === 0) return cloneTransform(a);
  if (k === 1) return cloneTransform(b);
  return {
    position: lerpVec3(a.position, b.position, k),
    quaternion: slerpQuat(a.quaternion, b.quaternion, k),
    scale: lerpVec3(a.scale, b.scale, k),
  };
}

/**
 * Xoay transform quanh một trục đi qua `pivot` (cả hai trong không gian cha).
 * Kết quả luôn tính từ `base`, không phụ thuộc trạng thái trước.
 */
export function rotateAboutPivot(base: Transform, pivot: Vec3, axis: Vec3, angle: number): Transform {
  if (angle === 0) return cloneTransform(base);
  const r = quatFromAxisAngle(axis, angle);
  const rel = subVec3(base.position, pivot);
  return {
    position: addVec3(pivot, rotateVec3(r, rel)),
    quaternion: normalizeQuat(multiplyQuat(r, base.quaternion)),
    scale: [base.scale[0], base.scale[1], base.scale[2]],
  };
}

export function translateTransform(base: Transform, offset: Vec3): Transform {
  return {
    position: addVec3(base.position, offset),
    quaternion: [base.quaternion[0], base.quaternion[1], base.quaternion[2], base.quaternion[3]],
    scale: [base.scale[0], base.scale[1], base.scale[2]],
  };
}

/** Ma trận 4x4 column-major (cùng layout `Matrix4.elements` của three.js). */
export function composeMatrix(t: Transform): number[] {
  const [x, y, z, w] = t.quaternion;
  const [sx, sy, sz] = t.scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    t.position[0],
    t.position[1],
    t.position[2],
    1,
  ];
}

/** Sai lệch tuyệt đối lớn nhất giữa hai ma trận của hai transform. */
export function matrixMaxDiff(a: Transform, b: Transform): number {
  const ma = composeMatrix(a);
  const mb = composeMatrix(b);
  let max = 0;
  for (let i = 0; i < 16; i++) max = Math.max(max, Math.abs(ma[i] - mb[i]));
  return max;
}

// ---------------------------------------------------------------------------
// Canonical registry: transform chuẩn theo componentId
// ---------------------------------------------------------------------------

export interface CanonicalTransforms {
  /** Transform gốc lúc nạp model – mốc cho explode và reset. */
  readonly original: Transform;
  /** Pose đóng/lắp (thường trùng original). */
  readonly closed: Transform;
  /** Pose mở/tháo hoàn toàn. */
  readonly open: Transform;
}

export type CanonicalRegistry = ReadonlyMap<string, CanonicalTransforms>;

export const createCanonicalRegistry = (): CanonicalRegistry => new Map();

export function registerCanonical(
  registry: CanonicalRegistry,
  componentId: string,
  canonical: { original: Transform; closed?: Transform; open?: Transform },
): CanonicalRegistry {
  const next = new Map(registry);
  const original = cloneTransform(canonical.original);
  next.set(componentId, {
    original,
    closed: cloneTransform(canonical.closed ?? original),
    open: cloneTransform(canonical.open ?? original),
  });
  return next;
}

export function getCanonical(registry: CanonicalRegistry, componentId: string): CanonicalTransforms {
  const c = registry.get(componentId);
  if (!c) throw new Error(`Không có transform chuẩn cho component "${componentId}"`);
  return c;
}

/** Pose tuyến tính closed→open theo progress (dùng khi không cần đường đi đặc thù). */
export function canonicalPoseAt(registry: CanonicalRegistry, componentId: string, progress: number): Transform {
  const c = getCanonical(registry, componentId);
  return interpolateTransform(c.closed, c.open, progress);
}

// ---------------------------------------------------------------------------
// State machine CLOSED / OPENING / OPEN / CLOSING
// ---------------------------------------------------------------------------

export type MechanismState = 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING';
export type MechanismEvent = 'OPEN' | 'CLOSE' | 'TOGGLE' | 'FINISHED';

/** Chuyển trạng thái thuần. Cho phép đảo chiều giữa chừng (OPENING⇄CLOSING). */
export function transition(state: MechanismState, event: MechanismEvent): MechanismState {
  switch (event) {
    case 'OPEN':
      return state === 'OPEN' || state === 'OPENING' ? state : 'OPENING';
    case 'CLOSE':
      return state === 'CLOSED' || state === 'CLOSING' ? state : 'CLOSING';
    case 'TOGGLE':
      return state === 'CLOSED' || state === 'CLOSING' ? 'OPENING' : 'CLOSING';
    case 'FINISHED':
      if (state === 'OPENING') return 'OPEN';
      if (state === 'CLOSING') return 'CLOSED';
      return state;
    default:
      return state;
  }
}

/** Đích progress tương ứng một trạng thái. */
export const targetProgressOf = (state: MechanismState): 0 | 1 =>
  state === 'OPEN' || state === 'OPENING' ? 1 : 0;

// ---------------------------------------------------------------------------
// Tween driver (GSAP) – chỉ tween một số vô hướng
// ---------------------------------------------------------------------------

export interface TweenHandle {
  kill(): void;
}

export interface TweenDriver {
  tween(
    from: number,
    to: number,
    durationSec: number,
    onUpdate: (value: number) => void,
    onComplete: () => void,
  ): TweenHandle;
}

export function createGsapDriver(ease = 'power2.inOut'): TweenDriver {
  return {
    tween(from, to, durationSec, onUpdate, onComplete) {
      const proxy = { value: from };
      const tw = gsap.to(proxy, {
        value: to,
        duration: durationSec,
        ease,
        onUpdate: () => onUpdate(proxy.value),
        onComplete: () => {
          onUpdate(to); // snap đúng đích, tránh sai số ease
          onComplete();
        },
      });
      return { kill: () => void tw.kill() };
    },
  };
}

/** Driver hoàn tất ngay lập tức (dùng cho reduced-motion hoặc test). */
export const instantDriver: TweenDriver = {
  tween(_from, to, _d, onUpdate, onComplete) {
    onUpdate(to);
    onComplete();
    return { kill: () => undefined };
  },
};

// ---------------------------------------------------------------------------
// Scalar animator: tween một giá trị tuyệt đối, có thể ngắt/đảo chiều
// ---------------------------------------------------------------------------

export interface ScalarAnimator {
  readonly value: number;
  readonly animating: boolean;
  /** Tween tới `target`; thời lượng tỉ lệ với quãng còn lại. */
  animateTo(target: number, onDone?: () => void): void;
  /** Đặt ngay (hủy tween đang chạy). */
  set(value: number): void;
  stop(): void;
}

export function createScalarAnimator(opts: {
  initial: number;
  /** Giây cho quãng `span` đầy đủ. */
  duration: number;
  /** Độ dài quãng ứng với `duration` (mặc định 1, tức progress 0..1). */
  span?: number;
  driver: TweenDriver;
  onUpdate: (value: number) => void;
}): ScalarAnimator {
  let value = opts.initial;
  let handle: TweenHandle | null = null;
  const span = opts.span ?? 1;

  const stop = () => {
    handle?.kill();
    handle = null;
  };

  return {
    get value() {
      return value;
    },
    get animating() {
      return handle !== null;
    },
    animateTo(target, onDone) {
      stop();
      const distance = Math.abs(target - value);
      const finish = () => {
        handle = null;
        value = target;
        opts.onUpdate(target);
        onDone?.();
      };
      if (distance === 0 || opts.duration <= 0) {
        finish();
        return;
      }
      const dur = (opts.duration * distance) / span;
      let completed = false;
      const h = opts.driver.tween(
        value,
        target,
        dur,
        (v) => {
          value = v;
          opts.onUpdate(v);
        },
        () => {
          completed = true;
          if (handle === h || handle === null) finish();
        },
      );
      // Driver đồng bộ có thể hoàn tất ngay trong lời gọi tween.
      handle = completed ? null : h;
    },
    set(v) {
      stop();
      value = v;
      opts.onUpdate(v);
    },
    stop,
  };
}

// ---------------------------------------------------------------------------
// Áp transform lên Object3D (structural typing để không phụ thuộc three)
// ---------------------------------------------------------------------------

export interface TransformTarget {
  position: { set(x: number, y: number, z: number): unknown };
  quaternion: { set(x: number, y: number, z: number, w: number): unknown };
  scale: { set(x: number, y: number, z: number): unknown };
}

export function applyTransform(target: TransformTarget, t: Transform): void {
  target.position.set(t.position[0], t.position[1], t.position[2]);
  target.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
  target.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

export interface TransformSource {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

export function readTransform(src: TransformSource): Transform {
  return makeTransform(
    [src.position.x, src.position.y, src.position.z],
    [src.quaternion.x, src.quaternion.y, src.quaternion.z, src.quaternion.w],
    [src.scale.x, src.scale.y, src.scale.z],
  );
}
