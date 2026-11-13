import { Interior } from './Interior';
import { Part, Piece } from './Part';
import { EngineCompartment } from './Powertrain';
import type { TankArticulation, TankLayout } from './variant';

/** Hull: lower tub + sloped upper hull, driver hatch, engine compartment, interior. */
export function Hull({
  layout,
  articulation,
}: {
  layout: TankLayout;
  articulation: TankArticulation;
}) {
  const { hull, variant } = layout;
  const L = variant.hull.length;
  const W = variant.hull.width;
  const lowerH = hull.lowerTopY - hull.bottomY;
  const hatchSize = Math.min(0.6, W * 0.24);
  const hatchHingeX = hull.roofFrontX - 0.06;

  return (
    <Part component="hull">
      <Piece
        name="LowerHull"
        geometry="box"
        material="olivePaint"
        position={[0, hull.bottomY + lowerH / 2, 0]}
        scale={[L * 0.9, lowerH, hull.innerWidth]}
      />
      <Piece
        name="UpperHull"
        geometry="hullBody"
        material="olivePaint"
        position={[0, hull.lowerTopY, 0]}
        scale={[L, hull.upperHeight, W]}
      />
      <Piece
        name="TurretRing"
        geometry="cylinder"
        material="olivePaintDark"
        position={[layout.turret.ringX, hull.roofY + 0.03, 0]}
        scale={[layout.turret.width * 0.8, 0.06, layout.turret.width * 0.8]}
      />
      <Piece
        name="DriverHatchRing"
        geometry="cylinder"
        material="olivePaintDark"
        position={[hatchHingeX - hatchSize / 2, hull.roofY + 0.015, W * 0.2]}
        scale={[hatchSize * 1.15, 0.03, hatchSize * 1.15]}
      />
      {/* Hinge on the front edge; the lid swings up and forward. */}
      <Part
        component="driverHatch"
        position={[hatchHingeX, hull.roofY + 0.04, W * 0.2]}
        rotation={[0, 0, -articulation.driverHatchOpen * 1.9]}
      >
        <Piece
          name="DriverHatch"
          geometry="cylinder"
          material="olivePaint"
          position={[-hatchSize / 2, 0.02, 0]}
          scale={[hatchSize, 0.05, hatchSize]}
        />
        <Piece
          name="DriverPeriscope"
          geometry="box"
          material="lens"
          position={[-0.06, 0.06, 0]}
          scale={[0.06, 0.06, hatchSize * 0.5]}
        />
      </Part>
      <EngineCompartment layout={layout} engineCoverOpen={articulation.engineCoverOpen} />
      <Interior layout={layout} />
    </Part>
  );
}
