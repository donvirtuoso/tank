import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
} from 'three';

/**
 * Shared, unit-sized geometries. Every mesh scales one of these instead of
 * building its own geometry, so changing variant dimensions never allocates new
 * GPU buffers. Same retain/release lifecycle as the shared materials.
 */
export type TankGeometryKey =
  | 'box'
  | 'cylinder'
  | 'wheel'
  | 'sphere'
  | 'hullBody'
  | 'turretCast'
  | 'turretWelded'
  | 'turretLow'
  | 'trackLink';

export type TankGeometries = Readonly<Record<TankGeometryKey, BufferGeometry>>;

/**
 * Hull side profile (X = length, Y = height), normalised to a 1×1 box centred
 * on X with the bottom at y=0: sloped upper/lower glacis at the front, small
 * slope at the rear. Extruded along Z (depth 1, centred).
 */
function createHullBody(): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.5, 0.12);
  s.lineTo(-0.46, 0);
  s.lineTo(0.36, 0);
  s.lineTo(0.5, 0.42);
  s.lineTo(0.38, 1);
  s.lineTo(-0.47, 1);
  s.lineTo(-0.5, 0.8);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.computeVertexNormals();
  return geo;
}

/** Welded turret: angular plan-view polygon (X/Z), extruded up along Y. */
function createWeldedTurret(): BufferGeometry {
  const s = new Shape();
  s.moveTo(0.5, -0.22);
  s.lineTo(0.5, 0.22);
  s.lineTo(0.2, 0.5);
  s.lineTo(-0.5, 0.5);
  s.lineTo(-0.5, -0.5);
  s.lineTo(0.2, -0.5);
  s.closePath();
  const geo = new ExtrudeGeometry(s, {
    depth: 1,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.06,
    bevelSegments: 1,
  });
  // Shape is in XY; rotate so extrusion (Z) becomes height (Y).
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.translate(0, -box.min.y, 0);
  geo.scale(1, 1 / (box.max.y - box.min.y), 1);
  return geo;
}

/** Cast turret: squashed hemisphere-like dome, unit size, base at y=0. */
function createCastTurret(): BufferGeometry {
  const geo = new SphereGeometry(0.5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, 2, 1);
  return geo;
}

/** Low-profile turret: truncated cone, unit size, base at y=0. */
function createLowTurret(): BufferGeometry {
  const geo = new CylinderGeometry(0.36, 0.5, 1, 40, 1);
  geo.translate(0, 0.5, 0);
  return geo;
}

function createAll(): TankGeometries {
  const wheel = new CylinderGeometry(0.5, 0.5, 1, 32);
  wheel.rotateX(Math.PI / 2); // axle along Z
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 24);
  return Object.freeze({
    box: new BoxGeometry(1, 1, 1),
    cylinder,
    wheel,
    sphere: new SphereGeometry(0.5, 24, 16),
    hullBody: createHullBody(),
    turretCast: createCastTurret(),
    turretWelded: createWeldedTurret(),
    turretLow: createLowTurret(),
    trackLink: new BoxGeometry(1, 1, 1),
  });
}

let cache: TankGeometries | null = null;
let refCount = 0;

export function getTankGeometries(): TankGeometries {
  if (!cache) cache = createAll();
  return cache;
}

export function retainTankGeometries(): TankGeometries {
  refCount += 1;
  return getTankGeometries();
}

export function releaseTankGeometries(): void {
  if (refCount === 0) return;
  refCount -= 1;
  if (refCount === 0 && cache) {
    for (const geometry of Object.values(cache)) geometry.dispose();
  }
}

export function getTankGeometryRefCount(): number {
  return refCount;
}
