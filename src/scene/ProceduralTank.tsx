import { useMemo } from 'react';
import { Accessories } from './components/Accessories';
import { Hull } from './components/Hull';
import { Part, TankKitProvider } from './components/Part';
import { RunningGear, SideSkirt } from './components/RunningGear';
import { Turret } from './components/Turret';
import {
  computeTankLayout,
  resolveArticulation,
  resolveVariant,
  type DeepPartial,
  type TankArticulation,
  type TankVariantConfig,
} from './components/variant';
import { sceneRegistry, type SceneRegistry } from './sceneRegistry';

export interface ProceduralTankProps {
  /** Variant parameters (partial values are merged with defaults and clamped). */
  variant?: DeepPartial<TankVariantConfig>;
  /** Pose of the articulated pivots (turret yaw, gun elevation, hatches). */
  articulation?: Partial<TankArticulation>;
  /** Registry receiving componentId → Object3D handles. */
  registry?: SceneRegistry;
  position?: [number, number, number];
}

/**
 * Procedurally generated tank (no GLB). Scene graph:
 *
 * TankRoot
 * ├─ Chassis
 * │  ├─ Hull ─ DriverHatchPivot, EngineCompartment(Powertrain, EngineCoverPivot), Interior
 * │  ├─ RunningGearLeft / RunningGearRight ─ RoadWheels*, DriveSprocket*, Idler*, Track*
 * │  ├─ SideSkirtLeft / SideSkirtRight
 * │  └─ Accessories ─ Toolbox, Headlights, SpareTracks
 * └─ TurretRotationPivot ─ GunElevationPivot(Barrel), CommanderHatchPivot, SmokeLaunchers, Antenna
 *
 * Every node is its own group carrying `userData.componentId` and is registered
 * in the scene registry; meshes are never merged across components.
 */
export function ProceduralTank({
  variant: variantInput,
  articulation: articulationInput,
  registry = sceneRegistry,
  position,
}: ProceduralTankProps) {
  // Re-derive only when the (serialisable) config actually changes.
  const variantKey = JSON.stringify(variantInput ?? {});
  const layout = useMemo(
    () => computeTankLayout(resolveVariant(JSON.parse(variantKey) as DeepPartial<TankVariantConfig>)),
    [variantKey],
  );
  const articulation = resolveArticulation(articulationInput);

  return (
    <TankKitProvider registry={registry}>
      <Part component="root" position={position}>
        <Part component="chassis">
          <Hull layout={layout} articulation={articulation} />
          <RunningGear layout={layout} side="left" />
          <RunningGear layout={layout} side="right" />
          <SideSkirt layout={layout} side="left" />
          <SideSkirt layout={layout} side="right" />
          <Accessories layout={layout} />
        </Part>
        <Turret layout={layout} articulation={articulation} />
      </Part>
    </TankKitProvider>
  );
}
