import { Part, Piece } from './Part';
import type { TankLayout } from './variant';

/** Crew compartment: driver station and ammo rack (visible through open hatches). */
export function Interior({ layout }: { layout: TankLayout }) {
  const { hull } = layout;
  const L = layout.variant.hull.length;
  const floorY = hull.bottomY + 0.08;
  const driverX = L * 0.27;
  return (
    <Part component="interior">
      <Piece
        name="Floor"
        geometry="box"
        material="metallic"
        position={[0, floorY, 0]}
        scale={[L * 0.7, 0.04, hull.innerWidth * 0.95]}
      />
      <Piece
        name="DriverSeat"
        geometry="box"
        material="olivePaintDark"
        position={[driverX - 0.25, floorY + 0.25, 0]}
        scale={[0.45, 0.12, 0.45]}
      />
      <Piece
        name="DriverSeatBack"
        geometry="box"
        material="olivePaintDark"
        position={[driverX - 0.47, floorY + 0.5, 0]}
        scale={[0.08, 0.45, 0.45]}
      />
      <Piece
        name="SteeringTillers"
        geometry="box"
        material="steel"
        position={[driverX + 0.15, floorY + 0.5, 0]}
        scale={[0.06, 0.06, 0.5]}
      />
      {[-1, 1].map((s) => (
        <Piece
          key={s}
          name={s > 0 ? 'AmmoRackLeft' : 'AmmoRackRight'}
          geometry="box"
          material="olivePaintDark"
          position={[L * 0.02, floorY + 0.3, s * hull.innerWidth * 0.33]}
          scale={[L * 0.25, 0.55, 0.22]}
        />
      ))}
    </Part>
  );
}
