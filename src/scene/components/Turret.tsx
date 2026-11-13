import { Antenna, SmokeLaunchers } from './Accessories';
import { Part, Piece } from './Part';
import type { TankArticulation, TankLayout, TurretStyle } from './variant';

const TURRET_GEOMETRY: Record<TurretStyle, 'turretCast' | 'turretWelded' | 'turretLow'> = {
  cast: 'turretCast',
  welded: 'turretWelded',
  lowProfile: 'turretLow',
};

/**
 * Turret assembly. `TurretRotationPivot` sits on the turret ring (yaw about Y),
 * `GunElevationPivot` sits on the trunnions (pitch about Z).
 */
export function Turret({
  layout,
  articulation,
}: {
  layout: TankLayout;
  articulation: TankArticulation;
}) {
  const { turret, hull, variant } = layout;
  const style = variant.turret.style;
  const cupolaX = -turret.length * 0.18;
  const cupolaZ = turret.width * 0.22;
  const cupolaR = Math.min(0.42, turret.width * 0.2);
  const roofY = turret.height * (style === 'cast' ? 0.92 : 1);

  return (
    <Part
      component="turret"
      position={[turret.ringX, hull.roofY + 0.06, 0]}
      rotation={[0, articulation.turretYaw, 0]}
    >
      <Piece
        name="TurretBody"
        geometry={TURRET_GEOMETRY[style]}
        material="olivePaint"
        scale={[turret.length, turret.height, turret.width]}
      />
      {style !== 'lowProfile' && (
        <Piece
          name="TurretBustle"
          geometry="box"
          material="olivePaint"
          position={[-turret.length * 0.55, turret.height * 0.45, 0]}
          scale={[turret.length * 0.3, turret.height * 0.6, turret.width * 0.62]}
        />
      )}
      <Gun layout={layout} elevation={articulation.gunElevation} />
      <Piece
        name="CommanderCupola"
        geometry="cylinder"
        material="olivePaintDark"
        position={[cupolaX, roofY + 0.08, cupolaZ]}
        scale={[cupolaR * 2, 0.16, cupolaR * 2]}
      />
      {/* Hinge on the rear edge; lid swings up and back. */}
      <Part
        component="commanderHatch"
        position={[cupolaX - cupolaR, roofY + 0.17, cupolaZ]}
        rotation={[0, 0, articulation.commanderHatchOpen * 1.9]}
      >
        <Piece
          name="CommanderHatch"
          geometry="cylinder"
          material="olivePaint"
          position={[cupolaR, 0.02, 0]}
          scale={[cupolaR * 1.9, 0.05, cupolaR * 1.9]}
        />
      </Part>
      <SmokeLaunchers layout={layout} />
      <Antenna layout={layout} />
    </Part>
  );
}

function Gun({ layout, elevation }: { layout: TankLayout; elevation: number }) {
  const { turret, variant } = layout;
  const { barrel } = variant;
  const mantletW = turret.width * 0.36;
  const mantletL = 0.42;
  const outerD = barrel.caliber * 2.4;
  const tubeStart = mantletL * 0.5;

  return (
    <Part
      component="gun"
      position={[turret.trunnionX, turret.trunnionY, 0]}
      rotation={[0, 0, elevation]}
    >
      <Piece
        name="Mantlet"
        geometry="box"
        material="olivePaint"
        position={[mantletL * 0.15, 0, 0]}
        scale={[mantletL, turret.height * 0.55, mantletW]}
      />
      <Part component="barrel" position={[tubeStart, 0, 0]}>
        {/* Cylinder axis Y → rotate -90° about Z so it points along +X. */}
        <Piece
          name="BarrelTube"
          geometry="cylinder"
          material="olivePaintDark"
          position={[barrel.length / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          scale={[outerD, barrel.length, outerD]}
        />
        <Piece
          name="BarrelSleeve"
          geometry="cylinder"
          material="olivePaintDark"
          position={[0.3, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          scale={[outerD * 1.5, 0.6, outerD * 1.5]}
        />
        {barrel.fumeExtractor && (
          <Piece
            name="FumeExtractor"
            geometry="cylinder"
            material="olivePaintDark"
            position={[barrel.length * 0.55, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            scale={[outerD * 1.6, Math.min(0.7, barrel.length * 0.14), outerD * 1.6]}
          />
        )}
        {barrel.muzzleBrake && (
          <Piece
            name="MuzzleBrake"
            geometry="box"
            material="steel"
            position={[barrel.length + 0.1, 0, 0]}
            scale={[0.3, outerD * 1.4, outerD * 2.2]}
          />
        )}
      </Part>
    </Part>
  );
}
