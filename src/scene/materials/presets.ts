import { Color, MeshStandardMaterial } from 'three';

/**
 * Shared material library for the procedural tank.
 *
 * Materials are created lazily ONCE and reused by every mesh (never per frame,
 * never per render). Consumers call `retainTankMaterials()` on mount and
 * `releaseTankMaterials()` on unmount; when the last consumer releases, the GPU
 * resources are disposed. Disposed three.js materials remain valid objects and are
 * re-uploaded automatically if used again, so the cache can be kept (this keeps
 * React StrictMode mount/unmount/mount cycles safe).
 */
export type TankMaterialKey =
  | 'olivePaint'
  | 'olivePaintDark'
  | 'steel'
  | 'rubber'
  | 'metallic'
  | 'engine'
  | 'lens';

export type TankMaterials = Readonly<Record<TankMaterialKey, MeshStandardMaterial>>;

interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export const MATERIAL_SPECS: Readonly<Record<TankMaterialKey, MaterialSpec>> = {
  olivePaint: { color: '#4b5320', roughness: 0.72, metalness: 0.18 },
  olivePaintDark: { color: '#3a4119', roughness: 0.78, metalness: 0.15 },
  steel: { color: '#8b8e90', roughness: 0.35, metalness: 0.85 },
  rubber: { color: '#1c1c1c', roughness: 0.95, metalness: 0.0 },
  metallic: { color: '#3d3d3b', roughness: 0.55, metalness: 0.7 },
  engine: { color: '#2b2b28', roughness: 0.6, metalness: 0.5 },
  lens: {
    color: '#fff6d8',
    roughness: 0.1,
    metalness: 0.2,
    emissive: '#fff1c2',
    emissiveIntensity: 0.6,
  },
};

let cache: TankMaterials | null = null;
let refCount = 0;

function createMaterial(key: TankMaterialKey, spec: MaterialSpec): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  if (spec.emissive) {
    material.emissive = new Color(spec.emissive);
    material.emissiveIntensity = spec.emissiveIntensity ?? 1;
  }
  material.name = `tank:${key}`;
  return material;
}

/** Returns the shared material set, creating it on first access only. */
export function getTankMaterials(): TankMaterials {
  if (!cache) {
    const entries = (Object.keys(MATERIAL_SPECS) as TankMaterialKey[]).map(
      (key) => [key, createMaterial(key, MATERIAL_SPECS[key])] as const,
    );
    cache = Object.freeze(Object.fromEntries(entries)) as TankMaterials;
  }
  return cache;
}

export function retainTankMaterials(): TankMaterials {
  refCount += 1;
  return getTankMaterials();
}

/** Releases one consumer; disposes GPU resources once nobody uses the materials. */
export function releaseTankMaterials(): void {
  if (refCount === 0) return;
  refCount -= 1;
  if (refCount === 0 && cache) {
    for (const material of Object.values(cache)) material.dispose();
  }
}

/** Test helper: number of active consumers. */
export function getTankMaterialRefCount(): number {
  return refCount;
}
