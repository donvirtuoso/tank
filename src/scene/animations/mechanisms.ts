/**
 * Cơ cấu chuyển động: hinge, double-hinge, slide, lift, detach/reattach, turret yaw,
 * gun elevation (chỉ hình ảnh).
 *
 * Mỗi cơ cấu là dữ liệu thuần (`MechanismDef`). `poseAt(def, value)` tính pose tuyệt đối
 * từ `def.original` – không cộng dồn – nên lặp lại bao nhiêu lần cũng không trôi.
 */
import {
  type CanonicalRegistry,
  type MechanismState,
  type ScalarAnimator,
  type Transform,
  type TweenDriver,
  type Vec3,
  addVec3,
  clamp,
  clamp01,
  cloneTransform,
  createScalarAnimator,
  mulVec3,
  normalizeVec3,
  registerCanonical,
  rotateAboutPivot,
  rotateVec3,
  scaleVec3,
  transition,
  translateTransform,
} from './transformEngine';

/** 'parent': pivot/trục tính trong không gian cha. 'local': trong không gian cục bộ của part. */
export type Space = 'parent' | 'local';

export interface HingeSpec {
  kind: 'hinge';
  pivot: Vec3;
  axis: Vec3;
  /** Góc mở (radian). */
  angle: number;
  space?: Space;
}

export interface SlideSpec {
  kind: 'slide';
  direction: Vec3;
  distance: number;
  space?: Space;
}

/** Nâng thẳng lên rồi (tùy chọn) trượt ngang – 2 pha. */
export interface LiftSpec {
  kind: 'lift';
  height: number;
  up?: Vec3;
  slide?: { direction: Vec3; distance: number };
  /** Tỉ lệ progress dành cho pha nâng (mặc định 0.5 nếu có slide, 1 nếu không). */
  split?: number;
  space?: Space;
}

/** Tháo rời: nhấc lên khỏi bệ (clearance) rồi đưa ra vị trí tháo (offset, tùy chọn xoay). */
export interface DetachSpec {
  kind: 'detach';
  clearance: number;
  up?: Vec3;
  offset: Vec3;
  rotation?: { axis: Vec3; angle: number };
  split?: number;
  space?: Space;
}

/** Xoay theo giá trị góc tuyệt đối (turret yaw, gun elevation). */
export interface RotarySpec {
  kind: 'rotary';
  pivot: Vec3;
  axis: Vec3;
  min: number;
  max: number;
  space?: Space;
}

export type MechanismSpec = HingeSpec | SlideSpec | LiftSpec | DetachSpec | RotarySpec;
export type MechanismKind = MechanismSpec['kind'];

export interface MechanismDef<S extends MechanismSpec = MechanismSpec> {
  id: string;
  label?: string;
  spec: S;
  original: Transform;
  /** Giây cho toàn bộ hành trình (progress 0→1, hoặc min→max với rotary). */
  duration?: number;
}

// ---------------------------------------------------------------------------
// Chuyển đổi không gian
// ---------------------------------------------------------------------------

function toParentPoint(original: Transform, p: Vec3, space: Space | undefined): Vec3 {
  if (space !== 'local') return p;
  return addVec3(original.position, rotateVec3(original.quaternion, mulVec3(p, original.scale)));
}

function toParentDir(original: Transform, d: Vec3, space: Space | undefined): Vec3 {
  const v = space === 'local' ? rotateVec3(original.quaternion, d) : d;
  return normalizeVec3(v);
}

const phase = (p: number, start: number, end: number): number =>
  end <= start ? (p >= end ? 1 : 0) : clamp01((p - start) / (end - start));

// ---------------------------------------------------------------------------
// Pose thuần
// ---------------------------------------------------------------------------

/**
 * Pose của cơ cấu tại `value`.
 *  - hinge/slide/lift/detach: value = progress 0..1 (0 = đóng/lắp, 1 = mở/tháo).
 *  - rotary: value = góc (radian), kẹp trong [min, max].
 */
export function poseAt(def: MechanismDef, value: number): Transform {
  const { original, spec } = def;

  if (spec.kind === 'rotary') {
    const angle = clamp(value, spec.min, spec.max);
    if (angle === 0) return cloneTransform(original);
    return rotateAboutPivot(
      original,
      toParentPoint(original, spec.pivot, spec.space),
      toParentDir(original, spec.axis, spec.space),
      angle,
    );
  }

  const p = clamp01(value);
  if (p === 0) return cloneTransform(original);

  switch (spec.kind) {
    case 'hinge':
      return rotateAboutPivot(
        original,
        toParentPoint(original, spec.pivot, spec.space),
        toParentDir(original, spec.axis, spec.space),
        spec.angle * p,
      );

    case 'slide': {
      const dir = toParentDir(original, spec.direction, spec.space);
      return translateTransform(original, scaleVec3(dir, spec.distance * p));
    }

    case 'lift': {
      const up = toParentDir(original, spec.up ?? [0, 1, 0], spec.space);
      const split = spec.slide ? (spec.split ?? 0.5) : 1;
      let offset = scaleVec3(up, spec.height * phase(p, 0, split));
      if (spec.slide) {
        const dir = toParentDir(original, spec.slide.direction, spec.space);
        offset = addVec3(offset, scaleVec3(dir, spec.slide.distance * phase(p, split, 1)));
      }
      return translateTransform(original, offset);
    }

    case 'detach': {
      const up = toParentDir(original, spec.up ?? [0, 1, 0], spec.space);
      const split = spec.split ?? 0.35;
      const p1 = phase(p, 0, split);
      const p2 = phase(p, split, 1);
      const offsetDir =
        spec.space === 'local' ? rotateVec3(original.quaternion, spec.offset) : spec.offset;
      let pose = original;
      if (spec.rotation && p2 > 0) {
        pose = rotateAboutPivot(
          original,
          original.position,
          toParentDir(original, spec.rotation.axis, spec.space),
          spec.rotation.angle * p2,
        );
      }
      const offset = addVec3(scaleVec3(up, spec.clearance * p1), scaleVec3(offsetDir, p2));
      return translateTransform(pose, offset);
    }
  }
}

/** Đăng ký transform chuẩn (original/closed/open) của các cơ cấu vào registry. */
export function registerMechanisms(registry: CanonicalRegistry, defs: readonly MechanismDef[]): CanonicalRegistry {
  let next = registry;
  for (const def of defs) {
    const open =
      def.spec.kind === 'rotary' ? cloneTransform(def.original) : poseAt(def, 1);
    next = registerCanonical(next, def.id, { original: def.original, closed: def.original, open });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Factory tiện dụng
// ---------------------------------------------------------------------------

export const hinge = (
  id: string,
  original: Transform,
  spec: Omit<HingeSpec, 'kind'>,
  duration = 0.8,
): MechanismDef<HingeSpec> => ({ id, original, spec: { kind: 'hinge', ...spec }, duration });

/**
 * Double-hinge: hai cánh mở ngược chiều (vd. nắp khoang động cơ kép).
 * Trả về hai MechanismDef; trục cánh phải đảo dấu góc.
 */
export function doubleHinge(
  ids: { left: string; right: string },
  originals: { left: Transform; right: Transform },
  spec: { leftPivot: Vec3; rightPivot: Vec3; axis: Vec3; angle: number; space?: Space },
  duration = 0.9,
): [MechanismDef<HingeSpec>, MechanismDef<HingeSpec>] {
  return [
    hinge(ids.left, originals.left, { pivot: spec.leftPivot, axis: spec.axis, angle: spec.angle, space: spec.space }, duration),
    hinge(ids.right, originals.right, { pivot: spec.rightPivot, axis: spec.axis, angle: -spec.angle, space: spec.space }, duration),
  ];
}

export const slide = (
  id: string,
  original: Transform,
  spec: Omit<SlideSpec, 'kind'>,
  duration = 0.7,
): MechanismDef<SlideSpec> => ({ id, original, spec: { kind: 'slide', ...spec }, duration });

export const lift = (
  id: string,
  original: Transform,
  spec: Omit<LiftSpec, 'kind'>,
  duration = 0.9,
): MechanismDef<LiftSpec> => ({ id, original, spec: { kind: 'lift', ...spec }, duration });

export const detach = (
  id: string,
  original: Transform,
  spec: Omit<DetachSpec, 'kind'>,
  duration = 1.4,
): MechanismDef<DetachSpec> => ({ id, original, spec: { kind: 'detach', ...spec }, duration });

export const rotary = (
  id: string,
  original: Transform,
  spec: Omit<RotarySpec, 'kind'>,
  duration = 2,
): MechanismDef<RotarySpec> => ({ id, original, spec: { kind: 'rotary', ...spec }, duration });

// ---------------------------------------------------------------------------
// Controller: state machine + tween progress
// ---------------------------------------------------------------------------

export interface MechanismController {
  readonly id: string;
  readonly state: MechanismState;
  readonly progress: number;
  open(): void;
  close(): void;
  /** Click liên tục: đảo chiều từ vị trí hiện tại. */
  toggle(): void;
  /** Đặt progress tức thì (scrub), trạng thái suy ra từ giá trị. */
  setProgress(p: number): void;
  /** Về pose chuẩn đóng, hủy tween. */
  reset(): void;
  dispose(): void;
}

export interface ControllerOptions {
  driver: TweenDriver;
  apply: (pose: Transform) => void;
  onStateChange?: (state: MechanismState, id: string) => void;
}

export function createMechanismController(def: MechanismDef, opts: ControllerOptions): MechanismController {
  if (def.spec.kind === 'rotary') throw new Error(`"${def.id}" là rotary – dùng createRotaryController`);
  let state: MechanismState = 'CLOSED';

  const setState = (s: MechanismState) => {
    if (s === state) return;
    state = s;
    opts.onStateChange?.(s, def.id);
  };

  const anim: ScalarAnimator = createScalarAnimator({
    initial: 0,
    duration: def.duration ?? 0.8,
    driver: opts.driver,
    onUpdate: (v) => opts.apply(poseAt(def, v)),
  });

  const run = (event: 'OPEN' | 'CLOSE' | 'TOGGLE') => {
    const next = transition(state, event);
    if (next === state) return; // đã đang đi/đứng đúng hướng
    setState(next);
    const target = next === 'OPENING' ? 1 : 0;
    anim.animateTo(target, () => setState(transition(next, 'FINISHED')));
  };

  return {
    id: def.id,
    get state() {
      return state;
    },
    get progress() {
      return anim.value;
    },
    open: () => run('OPEN'),
    close: () => run('CLOSE'),
    toggle: () => run('TOGGLE'),
    setProgress(p) {
      const v = clamp01(p);
      anim.set(v);
      setState(v === 0 ? 'CLOSED' : v === 1 ? 'OPEN' : state === 'CLOSING' ? 'CLOSING' : 'OPENING');
    },
    reset() {
      anim.set(0);
      setState('CLOSED');
    },
    dispose: () => anim.stop(),
  };
}

export interface RotaryController {
  readonly id: string;
  readonly value: number;
  /** Tween tới góc tuyệt đối (kẹp trong [min, max]). */
  rotateTo(angle: number): void;
  set(angle: number): void;
  reset(): void;
  dispose(): void;
}

export function createRotaryController(
  def: MechanismDef<RotarySpec>,
  opts: { driver: TweenDriver; apply: (pose: Transform) => void },
): RotaryController {
  const { min, max } = def.spec;
  const anim = createScalarAnimator({
    initial: 0,
    duration: def.duration ?? 2,
    span: Math.max(max - min, 1e-6),
    driver: opts.driver,
    onUpdate: (v) => opts.apply(poseAt(def, v)),
  });
  return {
    id: def.id,
    get value() {
      return anim.value;
    },
    rotateTo: (a) => anim.animateTo(clamp(a, min, max)),
    set: (a) => anim.set(clamp(a, min, max)),
    reset: () => anim.set(0),
    dispose: () => anim.stop(),
  };
}

// ---------------------------------------------------------------------------
// Preset cho xe tăng
// ---------------------------------------------------------------------------

export const TANK_COMPONENTS = {
  driverHatch: 'driver_hatch',
  commanderHatch: 'commander_hatch',
  engineCoverLeft: 'engine_cover_left',
  engineCoverRight: 'engine_cover_right',
  engineAccessPanel: 'engine_access_panel',
  powerpack: 'powerpack',
  turret: 'turret',
  gun: 'gun',
} as const;

export type TankComponentId = (typeof TANK_COMPONENTS)[keyof typeof TANK_COMPONENTS];

const deg = (d: number) => (d * Math.PI) / 180;

/** Giới hạn hình ảnh của nòng (không mô phỏng cơ khí thật). */
export const GUN_ELEVATION_LIMITS = { min: deg(-8), max: deg(20) } as const;
export const TURRET_YAW_LIMITS = { min: -Math.PI, max: Math.PI } as const;

export interface MechanismInfo {
  id: string;
  label: string;
  kind: MechanismKind;
}

export const TANK_MECHANISM_LIST: readonly MechanismInfo[] = [
  { id: TANK_COMPONENTS.driverHatch, label: 'Nắp lái xe', kind: 'hinge' },
  { id: TANK_COMPONENTS.commanderHatch, label: 'Nắp trưởng xe', kind: 'hinge' },
  { id: TANK_COMPONENTS.engineCoverLeft, label: 'Nắp động cơ (trái)', kind: 'hinge' },
  { id: TANK_COMPONENTS.engineCoverRight, label: 'Nắp động cơ (phải)', kind: 'hinge' },
  { id: TANK_COMPONENTS.engineAccessPanel, label: 'Tấm thăm động cơ', kind: 'lift' },
  { id: TANK_COMPONENTS.powerpack, label: 'Cụm động lực (tháo/lắp)', kind: 'detach' },
];

/**
 * Tạo các cơ cấu mặc định cho xe tăng từ transform gốc đọc được trong model.
 * Chỉ tạo cho component có mặt. Pivot tính trong không gian cục bộ của part
 * (giả định: +X sang phải, +Y lên, +Z ra trước) – có thể override qua `overrides`.
 */
export function createTankMechanismDefs(
  originals: Partial<Record<TankComponentId, Transform>>,
  overrides: Partial<Record<TankComponentId, Partial<MechanismDef>>> = {},
): MechanismDef[] {
  const C = TANK_COMPONENTS;
  const defs: MechanismDef[] = [];
  const driver = originals[C.driverHatch];
  const commander = originals[C.commanderHatch];
  const coverL = originals[C.engineCoverLeft];
  const coverR = originals[C.engineCoverRight];
  const access = originals[C.engineAccessPanel];
  const powerpack = originals[C.powerpack];
  const turret = originals[C.turret];
  const gun = originals[C.gun];

  if (driver) {
    defs.push(hinge(C.driverHatch, driver, { pivot: [0, 0, -0.25], axis: [1, 0, 0], angle: deg(-100), space: 'local' }));
  }
  if (commander) {
    defs.push(hinge(C.commanderHatch, commander, { pivot: [0, 0, 0.3], axis: [1, 0, 0], angle: deg(110), space: 'local' }));
  }
  if (coverL && coverR) {
    defs.push(
      ...doubleHinge(
        { left: C.engineCoverLeft, right: C.engineCoverRight },
        { left: coverL, right: coverR },
        { leftPivot: [-0.5, 0, 0], rightPivot: [0.5, 0, 0], axis: [0, 0, 1], angle: deg(-95), space: 'local' },
      ),
    );
  }
  if (access) {
    defs.push(lift(C.engineAccessPanel, access, { height: 0.15, slide: { direction: [0, 0, -1], distance: 0.8 }, space: 'local' }));
  }
  if (powerpack) {
    defs.push(detach(C.powerpack, powerpack, { clearance: 1.2, offset: [0, 0, -3], split: 0.4 }));
  }
  if (turret) {
    defs.push(rotary(C.turret, turret, { pivot: [0, 0, 0], axis: [0, 1, 0], ...TURRET_YAW_LIMITS, space: 'local' }, 4));
  }
  if (gun) {
    // Trục ngang của nòng; góc dương = nâng nòng (giả định nòng hướng +Z).
    defs.push(rotary(C.gun, gun, { pivot: [0, 0, 0], axis: [-1, 0, 0], ...GUN_ELEVATION_LIMITS, space: 'local' }, 1));
  }

  return defs.map((d) => {
    const ov = overrides[d.id as TankComponentId];
    return ov ? ({ ...d, ...ov, id: d.id } as MechanismDef) : d;
  });
}
