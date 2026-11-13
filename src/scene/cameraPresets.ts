/**
 * Camera preset definitions and interpolation (pure math, no React/three
 * runtime objects, so it is unit-testable).
 * Tank convention: +X front, +Y up, +Z left.
 */
export type CameraPresetId = 'front' | 'side' | 'rear' | 'top' | 'iso' | 'reset';

export const CAMERA_PRESET_IDS: readonly CameraPresetId[] = ['front', 'side', 'rear', 'top', 'iso', 'reset'];

export const CAMERA_PRESET_LABELS: Readonly<Record<CameraPresetId, string>> = {
  front: 'Trước',
  side: 'Hông',
  rear: 'Sau',
  top: 'Trên',
  iso: 'Iso',
  reset: 'Reset',
};

export type Vec3Tuple = [number, number, number];

export interface CameraPose {
  position: Vec3Tuple;
  target: Vec3Tuple;
}

/** Unit-ish view directions (from target towards camera) per preset. */
const DIRECTIONS: Readonly<Record<CameraPresetId, Vec3Tuple>> = {
  front: [1, 0.18, 0],
  side: [0, 0.18, 1],
  rear: [-1, 0.2, 0],
  // Tiny horizontal offset avoids the OrbitControls pole singularity.
  top: [-0.001, 1, 0.0005],
  iso: [0.9, 0.75, 0.9],
  reset: [0.85, 0.45, 1],
};

const DISTANCE_FACTOR: Readonly<Record<CameraPresetId, number>> = {
  front: 2.4,
  side: 2.4,
  rear: 2.4,
  top: 2.6,
  iso: 2.3,
  reset: 2.6,
};

/** Computes the camera pose for a preset framing a sphere (target, radius). */
export function getPresetPose(id: CameraPresetId, target: Vec3Tuple, radius: number): CameraPose {
  const [dx, dy, dz] = DIRECTIONS[id];
  const len = Math.hypot(dx, dy, dz);
  const dist = radius * DISTANCE_FACTOR[id];
  return {
    target: [...target],
    position: [
      target[0] + (dx / len) * dist,
      target[1] + (dy / len) * dist,
      target[2] + (dz / len) * dist,
    ],
  };
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Spherical {
  radius: number;
  /** Polar angle from +Y. */
  phi: number;
  /** Azimuth around Y (atan2(x, z)). */
  theta: number;
}

function toSpherical(offset: Vec3Tuple): Spherical {
  const [x, y, z] = offset;
  const radius = Math.hypot(x, y, z);
  if (radius === 0) return { radius: 0, phi: 0, theta: 0 };
  return {
    radius,
    phi: Math.acos(Math.min(1, Math.max(-1, y / radius))),
    theta: Math.atan2(x, z),
  };
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Interpolates between two poses. The target moves linearly; the camera orbits
 * around it in spherical coordinates (shortest azimuth) so it never cuts
 * through the model when going e.g. front → rear.
 */
export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = Math.min(1, Math.max(0, t));
  const target: Vec3Tuple = [
    lerp(from.target[0], to.target[0], k),
    lerp(from.target[1], to.target[1], k),
    lerp(from.target[2], to.target[2], k),
  ];
  const a = toSpherical([
    from.position[0] - from.target[0],
    from.position[1] - from.target[1],
    from.position[2] - from.target[2],
  ]);
  const b = toSpherical([
    to.position[0] - to.target[0],
    to.position[1] - to.target[1],
    to.position[2] - to.target[2],
  ]);
  if (k === 1) return { target: [...to.target], position: [...to.position] };
  const radius = lerp(a.radius, b.radius, k);
  const phi = lerp(a.phi, b.phi, k);
  const theta = a.theta + shortestAngle(a.theta, b.theta) * k;
  const sinPhi = Math.sin(phi);
  return {
    target,
    position: [
      target[0] + radius * sinPhi * Math.sin(theta),
      target[1] + radius * Math.cos(phi),
      target[2] + radius * sinPhi * Math.cos(theta),
    ],
  };
}
