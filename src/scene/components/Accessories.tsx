import { Part, Piece } from './Part';
import type { TankLayout } from './variant';

/** Hull-mounted accessories (toolbox, headlights, spare track links). */
export function Accessories({ layout }: { layout: TankLayout }) {
  const { hull, variant } = layout;
  const { accessories } = variant;
  const L = variant.hull.length;
  const W = variant.hull.width;
  const rearX = -L / 2;
  const plateY = hull.lowerTopY + hull.upperHeight * 0.45;
  // Point on the upper glacis at 70% height of the normalised hull profile.
  const glacisX = L * 0.442;
  const glacisY = hull.lowerTopY + hull.upperHeight * 0.7;

  return (
    <Part component="accessories">
      {accessories.toolbox && (
        <Part component="toolbox" position={[rearX - 0.12, plateY, -W * 0.25]}>
          <Piece name="ToolboxBody" geometry="box" material="olivePaintDark" scale={[0.22, 0.3, 0.8]} />
          <Piece
            name="ToolboxLatch"
            geometry="box"
            material="steel"
            position={[-0.115, 0.05, 0]}
            scale={[0.02, 0.06, 0.12]}
          />
        </Part>
      )}
      {accessories.spareTracks && (
        <Part component="spareTracks" position={[rearX - 0.05, plateY, W * 0.22]}>
          {[0, 1, 2, 3].map((i) => (
            <Piece
              key={i}
              name={`SpareTrackLink${i + 1}`}
              geometry="trackLink"
              material="metallic"
              position={[0, (i - 1.5) * 0.15, 0]}
              scale={[0.06, 0.14, layout.gear.trackWidth]}
            />
          ))}
        </Part>
      )}
      {accessories.headlights && (
        <Part component="headlights">
          {[-1, 1].map((s) => (
            <group key={s} dispose={null} position={[glacisX + 0.06, glacisY, s * W * 0.38]}>
              <Piece
                name={s > 0 ? 'HeadlightHousingLeft' : 'HeadlightHousingRight'}
                geometry="cylinder"
                material="olivePaintDark"
                rotation={[0, 0, -Math.PI / 2]}
                scale={[0.18, 0.14, 0.18]}
              />
              <Piece
                name={s > 0 ? 'HeadlightLensLeft' : 'HeadlightLensRight'}
                geometry="cylinder"
                material="lens"
                position={[0.075, 0, 0]}
                rotation={[0, 0, -Math.PI / 2]}
                scale={[0.15, 0.02, 0.15]}
              />
            </group>
          ))}
        </Part>
      )}
    </Part>
  );
}

/** Turret-mounted smoke grenade dischargers (3 tubes per side). */
export function SmokeLaunchers({ layout }: { layout: TankLayout }) {
  const { turret, variant } = layout;
  if (!variant.accessories.smokeLaunchers) return null;
  return (
    <Part component="smokeLaunchers">
      {[-1, 1].map((s) =>
        [0, 1, 2].map((i) => (
          <Piece
            key={`${s}-${i}`}
            name={`SmokeTube${s > 0 ? 'Left' : 'Right'}${i + 1}`}
            geometry="cylinder"
            material="olivePaintDark"
            position={[
              turret.length * 0.12 - i * 0.14,
              turret.height * 0.62 + i * 0.03,
              s * (turret.width * 0.5 + 0.06),
            ]}
            // Tilted forward/outward like real dischargers.
            rotation={[s * 0.5, 0, -0.9]}
            scale={[0.09, 0.3, 0.09]}
          />
        )),
      )}
    </Part>
  );
}

/** Whip antenna on the turret rear. */
export function Antenna({ layout }: { layout: TankLayout }) {
  const { turret, variant } = layout;
  if (!variant.accessories.antenna) return null;
  return (
    <Part component="antenna" position={[-turret.length * 0.42, turret.height * 0.9, -turret.width * 0.3]}>
      <Piece name="AntennaBase" geometry="cylinder" material="metallic" position={[0, 0.06, 0]} scale={[0.1, 0.12, 0.1]} />
      <Piece name="AntennaWhip" geometry="cylinder" material="metallic" position={[0, 1.2, 0]} scale={[0.015, 2.2, 0.015]} />
    </Part>
  );
}
