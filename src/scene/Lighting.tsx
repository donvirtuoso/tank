import { useEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import type { EnvironmentPresetId } from './Environment';

interface LightingSpec {
  skyColor: string;
  groundColor: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
}

export const LIGHTING_SPECS: Readonly<Record<EnvironmentPresetId, LightingSpec>> = {
  daylight: {
    skyColor: '#cfe6ff',
    groundColor: '#6b5f45',
    hemiIntensity: 0.65,
    keyColor: '#fff3df',
    keyIntensity: 2.4,
    keyPosition: [8, 12, 6],
  },
  hangar: {
    skyColor: '#d9dde3',
    groundColor: '#2c2c2e',
    hemiIntensity: 0.4,
    keyColor: '#eef3ff',
    keyIntensity: 1.6,
    keyPosition: [2, 14, 3],
  },
};

export interface LightingProps {
  environment: EnvironmentPresetId;
  /** Half-extent of the shadow camera frustum; keep tight around the tank. */
  shadowExtent?: number;
  /** Shadow map resolution (kept modest for performance). */
  shadowMapSize?: number;
}

/**
 * Hemisphere fill + one directional key light. Only the key casts shadows and
 * its shadow camera is clamped to the tank's footprint.
 */
export function Lighting({ environment, shadowExtent = 7, shadowMapSize = 1024 }: LightingProps) {
  const spec = LIGHTING_SPECS[environment];
  const key = useRef<DirectionalLight>(null);

  useEffect(() => {
    const light = key.current;
    if (!light) return;
    const cam = light.shadow.camera;
    cam.left = -shadowExtent;
    cam.right = shadowExtent;
    cam.top = shadowExtent;
    cam.bottom = -shadowExtent;
    cam.near = 1;
    cam.far = 40;
    cam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }, [shadowExtent]);

  return (
    <>
      {/* Props (not constructor args) so switching environment updates in place. */}
      <hemisphereLight color={spec.skyColor} groundColor={spec.groundColor} intensity={spec.hemiIntensity} />
      <directionalLight
        ref={key}
        color={spec.keyColor}
        intensity={spec.keyIntensity}
        position={spec.keyPosition}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}
