import { describe, expect, it } from 'vitest';
import {
  computeBoundingRadius,
  computeRunningGearLayout,
  computeTankLayout,
  computeTrackLinks,
  convexHull,
  DEFAULT_TANK_VARIANT,
  LIMITS,
  resolveArticulation,
  resolveVariant,
} from './variant';

describe('resolveVariant', () => {
  it('returns defaults for empty input', () => {
    expect(resolveVariant()).toEqual(DEFAULT_TANK_VARIANT);
  });

  it('merges partial input and clamps out-of-range values', () => {
    const v = resolveVariant({
      roadWheels: { count: 42 },
      barrel: { length: -3 },
      hull: { width: Number.NaN },
    });
    expect(v.roadWheels.count).toBe(LIMITS.roadWheelCount[1]);
    expect(v.roadWheels.diameter).toBe(DEFAULT_TANK_VARIANT.roadWheels.diameter);
    expect(v.barrel.length).toBe(LIMITS.barrelLength[0]);
    expect(v.hull.width).toBe(LIMITS.hullWidth[0]);
    expect(v.hull.length).toBe(DEFAULT_TANK_VARIANT.hull.length);
  });

  it('rejects unknown enum values', () => {
    const v = resolveVariant({
      turret: { style: 'banana' as never },
      skirts: 'x' as never,
      roadWheels: { layout: 'y' as never },
    });
    expect(v.turret.style).toBe(DEFAULT_TANK_VARIANT.turret.style);
    expect(v.skirts).toBe(DEFAULT_TANK_VARIANT.skirts);
    expect(v.roadWheels.layout).toBe(DEFAULT_TANK_VARIANT.roadWheels.layout);
  });

  it('rounds wheel count to an integer', () => {
    expect(resolveVariant({ roadWheels: { count: 5.6 } }).roadWheels.count).toBe(6);
  });
});

describe('resolveArticulation', () => {
  it('clamps hatch ratios and gun elevation', () => {
    const a = resolveArticulation({ driverHatchOpen: 3, gunElevation: 2, engineCoverOpen: -1 });
    expect(a.driverHatchOpen).toBe(1);
    expect(a.engineCoverOpen).toBe(0);
    expect(a.gunElevation).toBe(LIMITS.gunElevation[1]);
  });
});

describe('computeRunningGearLayout', () => {
  const sorted = (xs: number[]) => [...xs].sort((a, b) => b - a);

  it.each([4, 5, 6, 7, 8])('places %i evenly spaced wheels between idler and sprocket', (count) => {
    const g = computeRunningGearLayout(resolveVariant({ roadWheels: { count, layout: 'even' } }));
    expect(g.roadWheelX).toHaveLength(count);
    expect(g.roadWheelX).toEqual(sorted(g.roadWheelX));
    expect(g.roadWheelX[0] + g.wheelRadius).toBeLessThan(g.sprocket.x - g.sprocket.radius + 1e-9);
    expect(g.roadWheelX[count - 1] - g.wheelRadius).toBeGreaterThan(g.idler.x + g.idler.radius - 1e-9);
  });

  it.each([
    [4, 'even'],
    [8, 'even'],
    [6, 'paired'],
    [7, 'paired'],
    [8, 'paired'],
  ] as const)('does not overlap wheels (%i, %s) even on the shortest hull', (count, layout) => {
    const g = computeRunningGearLayout(
      resolveVariant({ hull: { length: 4.5 }, roadWheels: { count, layout, diameter: 0.95 } }),
    );
    expect(g.roadWheelX).toHaveLength(count);
    const xs = sorted(g.roadWheelX);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i - 1] - xs[i]).toBeGreaterThanOrEqual(g.wheelRadius * 2 - 1e-9);
    }
  });

  it('paired layout groups wheels tighter inside pairs than between pairs', () => {
    const g = computeRunningGearLayout(resolveVariant({ roadWheels: { count: 6, layout: 'paired' } }));
    const xs = g.roadWheelX;
    const inPair = xs[0] - xs[1];
    const betweenPairs = xs[1] - xs[2];
    expect(inPair).toBeLessThan(betweenPairs);
  });

  it('changes geometry when the layout changes', () => {
    const even = computeRunningGearLayout(resolveVariant({ roadWheels: { layout: 'even' } }));
    const paired = computeRunningGearLayout(resolveVariant({ roadWheels: { layout: 'paired' } }));
    expect(even.roadWheelX).not.toEqual(paired.roadWheelX);
  });
});

describe('track links', () => {
  it('computes a convex hull', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 0.5, y: 0.5 });
  });

  it('wraps a closed loop around all wheels, resting on the ground', () => {
    const g = computeRunningGearLayout(DEFAULT_TANK_VARIANT);
    const links = computeTrackLinks(g);
    expect(links.length).toBeGreaterThan(40);
    const ys = links.map((l) => l.y);
    const xs = links.map((l) => l.x);
    expect(Math.min(...ys)).toBeCloseTo(0.04, 2); // half track thickness
    expect(Math.max(...ys)).toBeGreaterThan(g.sprocket.y + g.sprocket.radius);
    expect(Math.max(...xs)).toBeGreaterThan(g.sprocket.x + g.sprocket.radius);
    expect(Math.min(...xs)).toBeLessThan(g.idler.x - g.idler.radius);
    for (const l of links) expect(Number.isFinite(l.angle)).toBe(true);
  });

  it('keeps link spacing close to the pitch', () => {
    const links = computeTrackLinks(computeRunningGearLayout(DEFAULT_TANK_VARIANT), 0.2);
    for (let i = 1; i < links.length; i += 1) {
      const d = Math.hypot(links[i].x - links[i - 1].x, links[i].y - links[i - 1].y);
      expect(d).toBeLessThan(0.21);
    }
  });
});

describe('computeTankLayout', () => {
  it('stacks hull above the running gear and keeps the engine deck behind the turret', () => {
    const l = computeTankLayout(DEFAULT_TANK_VARIANT);
    expect(l.hull.bottomY).toBeGreaterThan(0);
    expect(l.hull.lowerTopY).toBeGreaterThan(l.hull.bottomY);
    expect(l.hull.roofY).toBeGreaterThan(l.hull.lowerTopY);
    expect(l.engineDeckFrontX).toBeLessThanOrEqual(l.turret.ringX - l.turret.length / 2);
    expect(l.engineDeckFrontX).toBeGreaterThan(l.hull.roofRearX);
  });

  it('bounding radius grows with barrel length', () => {
    const short = computeBoundingRadius(resolveVariant({ barrel: { length: 2 } }));
    const long = computeBoundingRadius(resolveVariant({ barrel: { length: 7 } }));
    expect(long).toBeGreaterThan(short);
  });
});
