import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { Group } from 'three';
import {
  getTankMaterials,
  releaseTankMaterials,
  retainTankMaterials,
  type TankMaterials,
} from '../materials/presets';
import { sceneRegistry, useRegisterObject, type SceneRegistry } from '../sceneRegistry';
import {
  getTankGeometries,
  releaseTankGeometries,
  retainTankGeometries,
  type TankGeometries,
} from './geometries';
import { TANK_COMPONENTS, type TankComponentKey } from './componentIds';

export interface TankKit {
  materials: TankMaterials;
  geometries: TankGeometries;
  registry: SceneRegistry;
}

const TankKitContext = createContext<TankKit | null>(null);

/**
 * Provides shared materials/geometries for the subtree and keeps them retained
 * while mounted; the last unmount disposes their GPU resources.
 */
export function TankKitProvider({
  registry = sceneRegistry,
  children,
}: {
  registry?: SceneRegistry;
  children: ReactNode;
}) {
  const kit = useMemo<TankKit>(
    () => ({ materials: getTankMaterials(), geometries: getTankGeometries(), registry }),
    [registry],
  );
  useEffect(() => {
    retainTankMaterials();
    retainTankGeometries();
    return () => {
      releaseTankMaterials();
      releaseTankGeometries();
    };
  }, []);
  return <TankKitContext.Provider value={kit}>{children}</TankKitContext.Provider>;
}

export function useTankKit(): TankKit {
  const kit = useContext(TankKitContext);
  if (!kit) throw new Error('useTankKit must be used inside <TankKitProvider>');
  return kit;
}

export type Vec3 = [number, number, number];

export interface PieceProps {
  name: string;
  geometry: keyof TankGeometries;
  material: keyof TankMaterials;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

/** A single mesh using shared unit geometry + shared material, scaled to size. */
export function Piece({ name, geometry, material, position, rotation, scale }: PieceProps) {
  const { geometries, materials } = useTankKit();
  return (
    <mesh
      // Shared geometry/material: never let R3F auto-dispose them on unmount.
      dispose={null}
      name={name}
      geometry={geometries[geometry]}
      material={materials[material]}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
    />
  );
}

export interface PartProps {
  component: TankComponentKey;
  position?: Vec3;
  rotation?: Vec3;
  visible?: boolean;
  children?: ReactNode;
}

/**
 * A named group representing one logical tank component. Sets `name` to the
 * meaningful node name, `userData.componentId` to the stable id, and registers
 * the Object3D in the scene registry (outside any serialisable state).
 */
export function Part({ component, position, rotation, visible = true, children }: PartProps) {
  const { registry } = useTankKit();
  const { id, node } = TANK_COMPONENTS[component];
  const ref = useRegisterObject<Group>(id, registry);
  return (
    <group
      dispose={null}
      ref={ref}
      name={node}
      userData={{ componentId: id }}
      position={position}
      rotation={rotation}
      visible={visible}
    >
      {children}
    </group>
  );
}
