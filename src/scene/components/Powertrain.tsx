import { Part, Piece } from './Part';
import type { TankLayout } from './variant';

/**
 * Engine compartment: powertrain (engine, transmission, radiator, exhausts)
 * plus the hinged engine deck cover. Local origin = centre of the engine deck
 * footprint at the top of the lower hull.
 */
export function EngineCompartment({
  layout,
  engineCoverOpen,
}: {
  layout: TankLayout;
  engineCoverOpen: number;
}) {
  const { hull, engineDeckFrontX } = layout;
  const deckLength = engineDeckFrontX - hull.roofRearX;
  const centreX = (engineDeckFrontX + hull.roofRearX) / 2;
  const height = hull.upperHeight;
  const width = layout.variant.hull.width;

  return (
    <Part component="engineCompartment" position={[centreX, hull.lowerTopY, 0]}>
      <Powertrain deckLength={deckLength} height={height} innerWidth={hull.innerWidth} />
      {/* Hinge on the front edge of the deck; cover extends rearwards. */}
      <Part
        component="engineCover"
        position={[deckLength / 2, height, 0]}
        rotation={[0, 0, -engineCoverOpen * 1.2]}
      >
        <Piece
          name="EngineCover"
          geometry="box"
          material="olivePaint"
          position={[-deckLength * 0.47, 0.03, 0]}
          scale={[deckLength * 0.9, 0.05, width * 0.62]}
        />
        {[-1, 0, 1].map((i) => (
          <Piece
            key={i}
            name={`EngineGrille${i + 1}`}
            geometry="box"
            material="metallic"
            position={[-deckLength * 0.47, 0.065, i * width * 0.18]}
            scale={[deckLength * 0.7, 0.02, width * 0.12]}
          />
        ))}
      </Part>
    </Part>
  );
}

export function Powertrain({
  deckLength,
  height,
  innerWidth,
}: {
  deckLength: number;
  height: number;
  innerWidth: number;
}) {
  const engineH = Math.min(height * 0.85, 0.75);
  return (
    <Part component="powertrain">
      <Piece
        name="EngineBlock"
        geometry="box"
        material="engine"
        position={[deckLength * 0.08, engineH / 2 - 0.25, 0]}
        scale={[deckLength * 0.5, engineH, innerWidth * 0.55]}
      />
      {[-1, 1].map((s) => (
        <Piece
          key={s}
          name={s > 0 ? 'CylinderHeadLeft' : 'CylinderHeadRight'}
          geometry="box"
          material="steel"
          position={[deckLength * 0.08, engineH - 0.2, s * innerWidth * 0.18]}
          scale={[deckLength * 0.46, 0.12, innerWidth * 0.14]}
        />
      ))}
      <Piece
        name="Transmission"
        geometry="box"
        material="metallic"
        position={[-deckLength * 0.33, -0.1, 0]}
        scale={[deckLength * 0.22, engineH * 0.7, innerWidth * 0.8]}
      />
      <Piece
        name="Radiator"
        geometry="box"
        material="steel"
        position={[deckLength * 0.38, engineH / 2 - 0.25, 0]}
        scale={[0.08, engineH, innerWidth * 0.75]}
      />
      {[-1, 1].map((s) => (
        <Piece
          key={`exhaust${s}`}
          name={s > 0 ? 'ExhaustLeft' : 'ExhaustRight'}
          geometry="cylinder"
          material="metallic"
          position={[-deckLength / 2 - 0.12, height * 0.55, s * innerWidth * 0.32]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.14, 0.26, 0.14]}
        />
      ))}
    </Part>
  );
}
