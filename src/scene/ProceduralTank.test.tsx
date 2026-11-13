import ReactThreeTestRenderer from '@react-three/test-renderer';
import { InstancedMesh, Mesh, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TANK_COMPONENTS } from './components/componentIds';
import { getTankGeometries } from './components/geometries';
import { DEFAULT_TANK_VARIANT, type DeepPartial, type TankVariantConfig } from './components/variant';
import { getTankMaterials } from './materials/presets';
import { ProceduralTank } from './ProceduralTank';
import { SceneRegistry } from './sceneRegistry';

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;
let renderer: Renderer | null = null;

afterEach(async () => {
  if (renderer) await renderer.unmount();
  renderer = null;
});

async function renderTank(variant?: DeepPartial<TankVariantConfig>, registry = new SceneRegistry()) {
  renderer = await ReactThreeTestRenderer.create(<ProceduralTank variant={variant} registry={registry} />);
  return { renderer, registry, root: renderer.scene.instance as Object3D };
}

function byName(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`node ${name} not found`);
  return found;
}

function componentIds(root: Object3D): string[] {
  const ids: string[] = [];
  root.traverse((o) => {
    if (typeof o.userData.componentId === 'string') ids.push(o.userData.componentId);
  });
  return ids;
}

describe('ProceduralTank', () => {
  it('builds ≥12 distinct components, each a separate group with a stable id', async () => {
    const { root, registry } = await renderTank();
    const ids = componentIds(root);
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const required of [
      'TankRoot',
      'Chassis',
      'Hull',
      'DriverHatchPivot',
      'EngineCompartment',
      'EngineCoverPivot',
      'TurretRotationPivot',
      'GunElevationPivot',
      'CommanderHatchPivot',
      'RunningGearLeft',
      'RunningGearRight',
      'Accessories',
    ]) {
      const node = byName(root, required);
      expect(node.type).toBe('Group');
      expect(node.userData.componentId).toBeTruthy();
      expect(registry.get(node.userData.componentId)).toBe(node);
    }
    expect(registry.size).toBe(ids.length);
  });

  it('nests the gun under the turret and the engine cover under the engine compartment', async () => {
    const { root } = await renderTank();
    expect(byName(root, 'GunElevationPivot').parent?.name).toBe('TurretRotationPivot');
    expect(byName(root, 'EngineCoverPivot').parent?.name).toBe('EngineCompartment');
    expect(byName(root, 'Barrel').parent?.name).toBe('GunElevationPivot');
  });

  it('uses shared materials and geometries across meshes', async () => {
    const { root } = await renderTank();
    const mats = new Set(Object.values(getTankMaterials()));
    const geos = new Set(Object.values(getTankGeometries()));
    root.traverse((o) => {
      if (o instanceof Mesh) {
        expect(mats.has(o.material)).toBe(true);
        expect(geos.has(o.geometry)).toBe(true);
      }
    });
  });

  it('instances road wheels and track links and follows the wheel count', async () => {
    const { root, renderer: r } = await renderTank({ roadWheels: { count: 5 } });
    const tyres = byName(root, 'RoadWheelTyresLeft') as InstancedMesh;
    expect(tyres).toBeInstanceOf(InstancedMesh);
    expect(tyres.count).toBe(5);
    const links = byName(root, 'TrackLinksLeft') as InstancedMesh;
    expect(links.count).toBeGreaterThan(40);

    await r.update(<ProceduralTank variant={{ roadWheels: { count: 8 } }} registry={new SceneRegistry()} />);
    const root2 = r.scene.instance as Object3D;
    expect((byName(root2, 'RoadWheelTyresLeft') as InstancedMesh).count).toBe(8);
    expect((byName(root2, 'RoadWheelTyresRight') as InstancedMesh).count).toBe(8);
  });

  it('updates turret style, barrel length and skirts from the config', async () => {
    const registry = new SceneRegistry();
    const { root, renderer: r } = await renderTank({ turret: { style: 'cast' }, skirts: 'full' }, registry);
    const geos = getTankGeometries();
    expect((byName(root, 'TurretBody') as Mesh).geometry).toBe(geos.turretCast);
    expect(byName(root, 'SideSkirtLeft').children).toHaveLength(1);
    const shortScale = byName(root, 'BarrelTube').scale.y;

    const next: DeepPartial<TankVariantConfig> = {
      turret: { style: 'welded' },
      skirts: 'none',
      barrel: { length: DEFAULT_TANK_VARIANT.barrel.length + 1.5, muzzleBrake: true },
    };
    await r.update(<ProceduralTank variant={next} registry={registry} />);
    const root2 = r.scene.instance as Object3D;
    expect((byName(root2, 'TurretBody') as Mesh).geometry).toBe(geos.turretWelded);
    expect(root2.getObjectByName('SideSkirtLeft')).toBeUndefined();
    expect(registry.has(TANK_COMPONENTS.skirtLeft.id)).toBe(false);
    expect(byName(root2, 'BarrelTube').scale.y).toBeGreaterThan(shortScale);
    expect(root2.getObjectByName('MuzzleBrake')).toBeDefined();

    await r.update(<ProceduralTank variant={{ skirts: 'segmented' }} registry={registry} />);
    expect(byName(r.scene.instance as Object3D, 'SideSkirtLeft').children.length).toBeGreaterThan(1);
  });

  it('keeps material instances across re-renders and disposes them on unmount', async () => {
    const mats = getTankMaterials();
    const spy = vi.spyOn(mats.olivePaint, 'dispose');
    const { renderer: r, registry } = await renderTank();
    await r.update(<ProceduralTank variant={{ barrel: { length: 3 } }} registry={registry} />);
    expect(getTankMaterials().olivePaint).toBe(mats.olivePaint);
    expect(spy).not.toHaveBeenCalled();
    await r.unmount();
    renderer = null;
    expect(spy).toHaveBeenCalled();
    expect(registry.size).toBe(0);
    spy.mockRestore();
  });
});
