/**
 * Tank variant configuration consumed by the procedural model, plus the pure
 * layout math derived from it (no three.js / React dependency → unit-testable).
 *
 * Coordinate convention (metres): +X = front of the tank, +Y = up,
 * +Z = left side (viewed from the driver's seat), origin at ground centre.
 */

export type TurretStyle = 'cast' | 'welded' | 'lowProfile';
export type RoadWheelLayout = 'even' | 'paired';
export type SkirtStyle = 'none' | 'full' | 'segmented';

export interface HullConfig {
  length: number;
  width: number;
  height: number;
}

export interface RoadWheelConfig {
  count: number;
  diameter: number;
  layout: RoadWheelLayout;
}

export interface BarrelConfig {
  length: number;
  caliber: number;
  muzzleBrake: boolean;
  fumeExtractor: boolean;
}

export interface TurretConfig {
  style: TurretStyle;
}

export interface AccessoryConfig {
  smokeLaunchers: boolean;
  toolbox: boolean;
  antenna: boolean;
  headlights: boolean;
  spareTracks: boolean;
}

export interface TankVariantConfig {
  id: string;
  hull: HullConfig;
  roadWheels: RoadWheelConfig;
  turret: TurretConfig;
  barrel: BarrelConfig;
  skirts: SkirtStyle;
  accessories: AccessoryConfig;
}

/** Runtime pose of the articulated pivots (radians / 0..1 open ratio). */
export interface TankArticulation {
  turretYaw: number;
  gunElevation: number;
  driverHatchOpen: number;
  commanderHatchOpen: number;
  engineCoverOpen: number;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULT_TANK_VARIANT: TankVariantConfig = Object.freeze({
  id: 'default',
  hull: { length: 6.8, width: 2.3, height: 1.1 },
  roadWheels: { count: 6, diameter: 0.75, layout: 'even' },
  turret: { style: 'cast' },
  barrel: { length: 4.8, caliber: 0.12, muzzleBrake: false, fumeExtractor: true },
  skirts: 'segmented',
  accessories: {
    smokeLaunchers: true,
    toolbox: true,
    antenna: true,
    headlights: true,
    spareTracks: true,
  },
}) as TankVariantConfig;

export const DEFAULT_ARTICULATION: TankArticulation = Object.freeze({
  turretYaw: 0,
  gunElevation: 0,
  driverHatchOpen: 0,
  commanderHatchOpen: 0,
  engineCoverOpen: 0,
});

export const LIMITS = {
  hullLength: [4.5, 9] as const,
  hullWidth: [1.8, 3] as const,
  hullHeight: [0.8, 1.5] as const,
  roadWheelCount: [4, 8] as const,
  roadWheelDiameter: [0.5, 0.95] as const,
  barrelLength: [2, 7] as const,
  barrelCaliber: [0.075, 0.14] as const,
  gunElevation: [-0.15, 0.35] as const,
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const TURRET_STYLES: readonly TurretStyle[] = ['cast', 'welded', 'lowProfile'];
const LAYOUTS: readonly RoadWheelLayout[] = ['even', 'paired'];
const SKIRTS: readonly SkirtStyle[] = ['none', 'full', 'segmented'];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Merges a partial config with defaults and clamps every value to safe ranges. */
export function resolveVariant(input: DeepPartial<TankVariantConfig> = {}): TankVariantConfig {
  const d = DEFAULT_TANK_VARIANT;
  const hull = { ...d.hull, ...input.hull };
  const wheels = { ...d.roadWheels, ...input.roadWheels };
  const barrel = { ...d.barrel, ...input.barrel };
  const acc = { ...d.accessories, ...input.accessories };
  return {
    id: input.id ?? d.id,
    hull: {
      length: clamp(hull.length, ...LIMITS.hullLength),
      width: clamp(hull.width, ...LIMITS.hullWidth),
      height: clamp(hull.height, ...LIMITS.hullHeight),
    },
    roadWheels: {
      count: Math.round(clamp(wheels.count, ...LIMITS.roadWheelCount)),
      diameter: clamp(wheels.diameter, ...LIMITS.roadWheelDiameter),
      layout: pick(wheels.layout, LAYOUTS, d.roadWheels.layout),
    },
    turret: { style: pick(input.turret?.style, TURRET_STYLES, d.turret.style) },
    barrel: {
      length: clamp(barrel.length, ...LIMITS.barrelLength),
      caliber: clamp(barrel.caliber, ...LIMITS.barrelCaliber),
      muzzleBrake: Boolean(barrel.muzzleBrake),
      fumeExtractor: Boolean(barrel.fumeExtractor),
    },
    skirts: pick(input.skirts, SKIRTS, d.skirts),
    accessories: {
      smokeLaunchers: Boolean(acc.smokeLaunchers),
      toolbox: Boolean(acc.toolbox),
      antenna: Boolean(acc.antenna),
      headlights: Boolean(acc.headlights),
      spareTracks: Boolean(acc.spareTracks),
    },
  };
}

export function resolveArticulation(input: Partial<TankArticulation> = {}): TankArticulation {
  const a = { ...DEFAULT_ARTICULATION, ...input };
  return {
    turretYaw: Number.isFinite(a.turretYaw) ? a.turretYaw : 0,
    gunElevation: clamp(a.gunElevation, ...LIMITS.gunElevation),
    driverHatchOpen: clamp(a.driverHatchOpen, 0, 1),
    commanderHatchOpen: clamp(a.commanderHatchOpen, 0, 1),
    engineCoverOpen: clamp(a.engineCoverOpen, 0, 1),
  };
}

// ---------------------------------------------------------------------------
// Derived layout
// ---------------------------------------------------------------------------

export const TRACK_THICKNESS = 0.08;
export const TRACK_LINK_PITCH = 0.16;

export interface RunningGearLayout {
  /** Width of a single track (Z). */
  trackWidth: number;
  /** |Z| of the track / wheel centre plane. */
  sideOffset: number;
  wheelRadius: number;
  wheelCentreY: number;
  /** X positions of road wheels, front to rear. */
  roadWheelX: number[];
  sprocket: { x: number; y: number; radius: number };
  idler: { x: number; y: number; radius: number };
  /** X positions of return rollers along the top run. */
  returnRollerX: number[];
  returnRollerY: number;
  returnRollerRadius: number;
  /** Top of the track loop (used to seat the hull / skirts). */
  trackTopY: number;
}

export function computeRunningGearLayout(variant: TankVariantConfig): RunningGearLayout {
  const { hull, roadWheels } = variant;
  const requestedRadius = roadWheels.diameter / 2;
  const trackWidth = clamp(hull.width * 0.24, 0.45, 0.7);
  const sideOffset = hull.width / 2 - trackWidth / 2 + 0.05;
  const sprocketRadius = clamp(requestedRadius * 0.85, 0.28, 0.4);
  const idlerRadius = sprocketRadius * 0.92;
  // Raised sprocket/idler: their tops clear the road wheels so the upper track
  // run rides on the return rollers, not on the wheels.
  const raise = 2 * requestedRadius + TRACK_THICKNESS + 0.25 - sprocketRadius;
  const sprocket = { x: hull.length / 2 - sprocketRadius * 0.6, y: raise, radius: sprocketRadius };
  const idler = { x: -hull.length / 2 + idlerRadius * 0.6, y: raise, radius: idlerRadius };

  // Road wheels occupy the span between sprocket and idler.
  const spanFront = sprocket.x - sprocketRadius - requestedRadius * 0.35;
  const spanRear = idler.x + idlerRadius + requestedRadius * 0.35;
  const n = roadWheels.count;
  // Shrink wheels if the requested count does not fit on this hull length.
  const span = spanFront - spanRear;
  const paired = roadWheels.layout === 'paired' && n >= 4;
  const pairs = Math.ceil(n / 2);
  // Each pair needs ~4.08 r of length (two wheels + gaps), each even wheel ~2 r.
  const maxRadius = paired ? span / (4.1 * pairs) : (span / n) * 0.49;
  const wheelRadius = Math.min(requestedRadius, maxRadius);
  const wheelCentreY = wheelRadius + TRACK_THICKNESS;
  const roadWheelX: number[] = [];
  if (paired) {
    // Bogie pairs: wheels grouped in twos with a tight gap inside each pair.
    const pairGap = wheelRadius * 2.08;
    const firstCentre = spanFront - wheelRadius - pairGap / 2;
    const lastCentre = spanRear + wheelRadius + pairGap / 2;
    const pitch = pairs > 1 ? (firstCentre - lastCentre) / (pairs - 1) : 0;
    for (let p = 0; p < pairs; p += 1) {
      const centre = pairs > 1 ? firstCentre - p * pitch : (spanFront + spanRear) / 2;
      const remaining = n - p * 2;
      if (remaining >= 2) roadWheelX.push(centre + pairGap / 2, centre - pairGap / 2);
      else roadWheelX.push(centre);
    }
  } else {
    const first = spanFront - wheelRadius;
    const last = spanRear + wheelRadius;
    const step = n > 1 ? (first - last) / (n - 1) : 0;
    for (let i = 0; i < n; i += 1) roadWheelX.push(first - i * step);
  }

  const trackTopY = raise + sprocketRadius + TRACK_THICKNESS;
  const returnRollerRadius = 0.11;
  const returnRollerY = trackTopY - TRACK_THICKNESS - returnRollerRadius;
  const rollerCount = n >= 6 ? 3 : 2;
  const returnRollerX: number[] = [];
  for (let i = 0; i < rollerCount; i += 1) {
    const t = (i + 1) / (rollerCount + 1);
    returnRollerX.push(spanFront - t * (spanFront - spanRear));
  }

  return {
    trackWidth,
    sideOffset,
    wheelRadius,
    wheelCentreY,
    roadWheelX,
    sprocket,
    idler,
    returnRollerX,
    returnRollerY,
    returnRollerRadius,
    trackTopY,
  };
}

export interface Point2 {
  x: number;
  y: number;
}

/** Andrew's monotone chain convex hull (counter-clockwise, no duplicate end). */
export function convexHull(points: Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export interface TrackLinkTransform {
  x: number;
  y: number;
  /** Rotation about Z so the link lies tangent to the loop. */
  angle: number;
}

/**
 * Places track links along the loop wrapped around sprocket, idler and road
 * wheels (convex hull of their outlines offset by half the track thickness),
 * evenly by arc length.
 */
export function computeTrackLinks(layout: RunningGearLayout, pitch = TRACK_LINK_PITCH): TrackLinkTransform[] {
  const offset = TRACK_THICKNESS / 2;
  const circles = [
    { x: layout.sprocket.x, y: layout.sprocket.y, r: layout.sprocket.radius + offset },
    { x: layout.idler.x, y: layout.idler.y, r: layout.idler.radius + offset },
    ...layout.roadWheelX.map((x) => ({ x, y: layout.wheelCentreY, r: layout.wheelRadius + offset })),
  ];
  const samples: Point2[] = [];
  const segments = 48;
  for (const c of circles) {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      samples.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
  }
  const loop = convexHull(samples);
  const cumulative: number[] = [0];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(8, Math.round(total / pitch));
  const step = total / count;
  const links: TrackLinkTransform[] = [];
  let seg = 0;
  for (let k = 0; k < count; k += 1) {
    const d = k * step;
    while (seg < loop.length - 1 && cumulative[seg + 1] < d) seg += 1;
    const a = loop[seg];
    const b = loop[(seg + 1) % loop.length];
    const len = cumulative[seg + 1] - cumulative[seg] || 1;
    const t = (d - cumulative[seg]) / len;
    links.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
  return links;
}

export interface HullLayout {
  /** Bottom of the lower hull (belly). */
  bottomY: number;
  /** Top of the lower hull tub = where the upper hull/sponsons start. */
  lowerTopY: number;
  /** Hull roof height (turret ring sits here). */
  roofY: number;
  /** Width of the lower hull tub between the tracks. */
  innerWidth: number;
  upperHeight: number;
  /** Roof extent along X (front/rear edges of the flat roof). */
  roofFrontX: number;
  roofRearX: number;
}

/** Must match the normalised profile in geometries.ts (createHullBody). */
export const HULL_PROFILE = { roofFront: 0.38, roofRear: -0.47 } as const;

export function computeHullLayout(variant: TankVariantConfig, gear: RunningGearLayout): HullLayout {
  const { hull } = variant;
  const bottomY = gear.wheelCentreY * 0.8;
  const lowerTopY = gear.trackTopY;
  const upperHeight = Math.max(0.4, hull.height - (lowerTopY - bottomY));
  return {
    bottomY,
    lowerTopY,
    roofY: lowerTopY + upperHeight,
    innerWidth: Math.max(0.6, hull.width - 2 * gear.trackWidth - 0.04),
    upperHeight,
    roofFrontX: hull.length * HULL_PROFILE.roofFront,
    roofRearX: hull.length * HULL_PROFILE.roofRear,
  };
}

export interface TurretDimensions {
  length: number;
  width: number;
  height: number;
  /** Turret ring centre X on the hull roof. */
  ringX: number;
  /** Mantlet/trunnion X relative to the turret ring centre. */
  trunnionX: number;
  trunnionY: number;
}

export function computeTurretDimensions(variant: TankVariantConfig): TurretDimensions {
  const { hull, turret } = variant;
  const width = hull.width * (turret.style === 'lowProfile' ? 0.82 : 0.74);
  const length = hull.length * (turret.style === 'welded' ? 0.5 : 0.44);
  const height = turret.style === 'lowProfile' ? 0.52 : turret.style === 'welded' ? 0.72 : 0.68;
  return {
    length,
    width,
    height,
    ringX: -hull.length * 0.04,
    trunnionX: length * 0.48,
    trunnionY: height * 0.5,
  };
}

export interface TankLayout {
  variant: TankVariantConfig;
  gear: RunningGearLayout;
  hull: HullLayout;
  turret: TurretDimensions;
  /** X where the engine deck starts (front edge of the engine cover). */
  engineDeckFrontX: number;
}

export function computeTankLayout(variant: TankVariantConfig): TankLayout {
  const gear = computeRunningGearLayout(variant);
  const hull = computeHullLayout(variant, gear);
  const turret = computeTurretDimensions(variant);
  const engineDeckFrontX = Math.min(
    turret.ringX - turret.length * 0.5 - 0.05,
    hull.roofRearX + variant.hull.length * 0.3,
  );
  return { variant, gear, hull, turret, engineDeckFrontX };
}

/** Overall bounding radius (used to frame camera presets). */
export function computeBoundingRadius(variant: TankVariantConfig): number {
  const turret = computeTurretDimensions(variant);
  const frontReach = Math.max(
    variant.hull.length / 2,
    turret.ringX + turret.trunnionX + variant.barrel.length,
  );
  const halfLength = (frontReach + variant.hull.length / 2) / 2;
  return Math.hypot(halfLength, variant.hull.width / 2, 1.5);
}
