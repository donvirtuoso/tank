import { useLayoutEffect, useMemo, useRef } from 'react';
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Side } from './componentIds';
import { Part, Piece, useTankKit, type Vec3 } from './Part';
import type { TankGeometries } from './geometries';
import type { TankMaterials } from '../materials/presets';
import { computeTrackLinks, TRACK_THICKNESS, TRACK_LINK_PITCH, type TankLayout } from './variant';

export interface InstanceTransform {
  position: Vec3;
  rotation?: Vec3;
  scale: Vec3;
}

/** Packs transforms into a flat column-major Float32Array of 4×4 matrices. */
export function composeInstanceMatrices(transforms: InstanceTransform[]): Float32Array {
  const out = new Float32Array(transforms.length * 16);
  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const e = new Euler();
  const s = new Vector3();
  transforms.forEach((t, i) => {
    p.set(...t.position);
    q.setFromEuler(e.set(...(t.rotation ?? ([0, 0, 0] as Vec3))));
    s.set(...t.scale);
    m.compose(p, q, s).toArray(out, i * 16);
  });
  return out;
}

/**
 * InstancedMesh over shared geometry/material. Remounts when the instance
 * count changes (InstancedMesh capacity is fixed) and disposes its own
 * instance buffers on unmount without touching the shared resources.
 */
function Instanced({
  name,
  geometry,
  material,
  transforms,
}: {
  name: string;
  geometry: keyof TankGeometries;
  material: keyof TankMaterials;
  transforms: InstanceTransform[];
}) {
  const { geometries, materials } = useTankKit();
  const ref = useRef<InstancedMesh>(null);
  const matrices = useMemo(() => composeInstanceMatrices(transforms), [transforms]);
  const count = transforms.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  // Runs per mounted InstancedMesh (remounted via `key` when count changes).
  useLayoutEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [count]);

  return (
    <instancedMesh
      key={count}
      ref={ref}
      name={name}
      args={[geometries[geometry], materials[material], count]}
      dispose={null}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

const SIDE_NODES = {
  left: {
    gear: 'runningGearLeft',
    wheels: 'roadWheelsLeft',
    track: 'trackLeft',
    sprocket: 'sprocketLeft',
    idler: 'idlerLeft',
    suffix: 'Left',
  },
  right: {
    gear: 'runningGearRight',
    wheels: 'roadWheelsRight',
    track: 'trackRight',
    sprocket: 'sprocketRight',
    idler: 'idlerRight',
    suffix: 'Right',
  },
} as const;

/** One side's running gear: road wheels, return rollers, sprocket, idler, track. */
export function RunningGear({ layout, side }: { layout: TankLayout; side: Side }) {
  const { gear } = layout;
  const nodes = SIDE_NODES[side];
  const z = side === 'left' ? gear.sideOffset : -gear.sideOffset;
  const wheelWidth = gear.trackWidth * 0.8;
  const d = gear.wheelRadius * 2;

  const { tyres, hubs, rollers, links } = useMemo(() => {
    const tyreT: InstanceTransform[] = gear.roadWheelX.map((x) => ({
      position: [x, gear.wheelCentreY, 0],
      scale: [d, d, wheelWidth],
    }));
    const hubT: InstanceTransform[] = gear.roadWheelX.map((x) => ({
      position: [x, gear.wheelCentreY, 0],
      scale: [d * 0.62, d * 0.62, wheelWidth + 0.04],
    }));
    const rollerT: InstanceTransform[] = gear.returnRollerX.map((x) => ({
      position: [x, gear.returnRollerY, 0],
      scale: [gear.returnRollerRadius * 2, gear.returnRollerRadius * 2, wheelWidth * 0.6],
    }));
    const linkT: InstanceTransform[] = computeTrackLinks(gear).map((l) => ({
      position: [l.x, l.y, 0],
      rotation: [0, 0, l.angle],
      scale: [TRACK_LINK_PITCH * 0.88, TRACK_THICKNESS, gear.trackWidth],
    }));
    return { tyres: tyreT, hubs: hubT, rollers: rollerT, links: linkT };
  }, [gear, d, wheelWidth]);

  return (
    <Part component={nodes.gear} position={[0, 0, z]}>
      <Part component={nodes.wheels}>
        <Instanced name={`RoadWheelTyres${nodes.suffix}`} geometry="wheel" material="rubber" transforms={tyres} />
        <Instanced name={`RoadWheelHubs${nodes.suffix}`} geometry="wheel" material="steel" transforms={hubs} />
        <Instanced name={`ReturnRollers${nodes.suffix}`} geometry="wheel" material="metallic" transforms={rollers} />
      </Part>
      <Part component={nodes.sprocket} position={[gear.sprocket.x, gear.sprocket.y, 0]}>
        <Piece
          name={`SprocketRing${nodes.suffix}`}
          geometry="wheel"
          material="metallic"
          scale={[gear.sprocket.radius * 2, gear.sprocket.radius * 2, wheelWidth * 0.7]}
        />
        <Piece
          name={`SprocketHub${nodes.suffix}`}
          geometry="wheel"
          material="steel"
          scale={[gear.sprocket.radius, gear.sprocket.radius, wheelWidth + 0.06]}
        />
      </Part>
      <Part component={nodes.idler} position={[gear.idler.x, gear.idler.y, 0]}>
        <Piece
          name={`IdlerWheel${nodes.suffix}`}
          geometry="wheel"
          material="rubber"
          scale={[gear.idler.radius * 2, gear.idler.radius * 2, wheelWidth]}
        />
        <Piece
          name={`IdlerHub${nodes.suffix}`}
          geometry="wheel"
          material="steel"
          scale={[gear.idler.radius, gear.idler.radius, wheelWidth + 0.04]}
        />
      </Part>
      <Part component={nodes.track}>
        <Instanced name={`TrackLinks${nodes.suffix}`} geometry="trackLink" material="metallic" transforms={links} />
      </Part>
    </Part>
  );
}

/** Side skirts over the upper track run: full plate or segmented panels. */
export function SideSkirt({ layout, side }: { layout: TankLayout; side: Side }) {
  const { gear, variant } = layout;
  if (variant.skirts === 'none') return null;
  const z = (side === 'left' ? 1 : -1) * (gear.sideOffset + gear.trackWidth / 2 + 0.03);
  const length = gear.sprocket.x - gear.idler.x;
  const height = Math.max(0.3, (gear.trackTopY - gear.wheelCentreY) * 1.05);
  const y = gear.trackTopY - height / 2 + 0.02;
  const centreX = (gear.sprocket.x + gear.idler.x) / 2;
  const segments = variant.skirts === 'segmented' ? Math.max(4, Math.round(length / 0.9)) : 1;
  const segLen = length / segments;
  const suffix = side === 'left' ? 'Left' : 'Right';

  return (
    <Part component={side === 'left' ? 'skirtLeft' : 'skirtRight'} position={[centreX, y, z]}>
      {Array.from({ length: segments }, (_, i) => (
        <Piece
          key={i}
          name={`SkirtPanel${suffix}${i + 1}`}
          geometry="box"
          material="olivePaint"
          position={[length / 2 - segLen * (i + 0.5), 0, 0]}
          scale={[segments > 1 ? segLen - 0.04 : segLen, height, 0.03]}
        />
      ))}
    </Part>
  );
}
