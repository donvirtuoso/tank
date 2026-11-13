import { ContactShadows, Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { CameraController, type CameraCommand } from './CameraController';
import { CAMERA_PRESET_IDS, CAMERA_PRESET_LABELS, type CameraPresetId, type Vec3Tuple } from './cameraPresets';
import { computeBoundingRadius, computeTankLayout, resolveVariant, type DeepPartial, type TankArticulation, type TankVariantConfig } from './components/variant';
import { ENVIRONMENT_LABELS, ENVIRONMENT_PRESET_IDS, SceneEnvironment, type EnvironmentPresetId } from './Environment';
import { Lighting } from './Lighting';
import { ProceduralTank } from './ProceduralTank';
import type { SceneRegistry } from './sceneRegistry';

const FLOOR_COLOR: Readonly<Record<EnvironmentPresetId, string>> = {
  daylight: '#8f8a78',
  hangar: '#3a3b3d',
};

const GRID_COLORS: Readonly<Record<EnvironmentPresetId, { cell: string; section: string }>> = {
  daylight: { cell: '#6f6b5d', section: '#4e4a3e' },
  hangar: { cell: '#55585d', section: '#7a7f86' },
};

export interface TankSceneProps {
  variant?: DeepPartial<TankVariantConfig>;
  articulation?: Partial<TankArticulation>;
  /** Controlled environment; omit to let the scene manage it internally. */
  environment?: EnvironmentPresetId;
  onEnvironmentChange?: (env: EnvironmentPresetId) => void;
  /** External camera command (e.g. from an app toolbar). */
  cameraCommand?: CameraCommand | null;
  /** Show the built-in overlay with environment + camera preset buttons. */
  showToolbar?: boolean;
  registry?: SceneRegistry;
  className?: string;
  style?: CSSProperties;
}

/** Showroom scene: lighting, environment, floor, procedural tank and camera. */
export function TankScene({
  variant,
  articulation,
  environment,
  onEnvironmentChange,
  cameraCommand,
  showToolbar = true,
  registry,
  className,
  style,
}: TankSceneProps) {
  const [localEnv, setLocalEnv] = useState<EnvironmentPresetId>('daylight');
  const env = environment ?? localEnv;
  const setEnv = useCallback(
    (next: EnvironmentPresetId) => {
      if (environment === undefined) setLocalEnv(next);
      onEnvironmentChange?.(next);
    },
    [environment, onEnvironmentChange],
  );

  const [localCommand, setLocalCommand] = useState<CameraCommand | null>(null);
  const activeCommand = pickLatest(cameraCommand ?? null, localCommand);
  const requestPreset = useCallback((preset: CameraPresetId) => {
    setLocalCommand((prev) => ({ preset, nonce: (prev?.nonce ?? 0) + 1, issuedAt: Date.now() }));
  }, []);

  const variantKey = JSON.stringify(variant ?? {});
  const { target, radius } = useMemo(() => {
    const resolved = resolveVariant(JSON.parse(variantKey) as DeepPartial<TankVariantConfig>);
    const layout = computeTankLayout(resolved);
    return {
      target: [0, layout.hull.roofY * 0.6, 0] as Vec3Tuple,
      radius: computeBoundingRadius(resolved),
    };
  }, [variantKey]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 500, position: [10, 6, 12] }}>
        <Suspense fallback={null}>
          <SceneEnvironment preset={env} />
        </Suspense>
        <Lighting environment={env} shadowExtent={Math.max(5, radius * 1.2)} />
        <ProceduralTank variant={variant} articulation={articulation} registry={registry} />
        <ContactShadows position={[0, 0.005, 0]} scale={radius * 3.2} far={3} blur={2.2} opacity={env === 'hangar' ? 0.7 : 0.55} resolution={512} />
        <mesh name="Floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <circleGeometry args={[60, 64]} />
          <meshStandardMaterial color={FLOOR_COLOR[env]} roughness={0.95} metalness={0} />
        </mesh>
        <Grid
          position={[0, 0.002, 0]}
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          cellThickness={0.6}
          sectionThickness={1}
          cellColor={GRID_COLORS[env].cell}
          sectionColor={GRID_COLORS[env].section}
          fadeDistance={45}
          fadeStrength={1.5}
        />
        <CameraController target={target} radius={radius} command={activeCommand} />
      </Canvas>
      {showToolbar && (
        <SceneToolbar environment={env} onEnvironmentChange={setEnv} onPreset={requestPreset} />
      )}
    </div>
  );
}

/** Chooses whichever of the external/local commands was issued last. */
export function pickLatest(external: CameraCommand | null, local: CameraCommand | null): CameraCommand | null {
  if (!external) return local;
  if (!local) return external;
  return (local.issuedAt ?? 0) >= (external.issuedAt ?? 0) ? local : external;
}

const toolbarStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: 8,
  borderRadius: 8,
  background: 'rgba(20,22,24,0.6)',
  color: '#fff',
  font: '13px system-ui, sans-serif',
};

const buttonStyle = (active: boolean): CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.25)',
  background: active ? '#6b7d2c' : 'rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer',
});

function SceneToolbar({
  environment,
  onEnvironmentChange,
  onPreset,
}: {
  environment: EnvironmentPresetId;
  onEnvironmentChange: (env: EnvironmentPresetId) => void;
  onPreset: (preset: CameraPresetId) => void;
}) {
  return (
    <div style={toolbarStyle} role="toolbar" aria-label="Scene controls">
      {ENVIRONMENT_PRESET_IDS.map((id) => (
        <button
          key={id}
          type="button"
          style={buttonStyle(environment === id)}
          aria-pressed={environment === id}
          onClick={() => onEnvironmentChange(id)}
        >
          {ENVIRONMENT_LABELS[id]}
        </button>
      ))}
      <span style={{ width: 1, background: 'rgba(255,255,255,0.25)', margin: '0 4px' }} />
      {CAMERA_PRESET_IDS.map((id) => (
        <button key={id} type="button" style={buttonStyle(false)} onClick={() => onPreset(id)}>
          {CAMERA_PRESET_LABELS[id]}
        </button>
      ))}
    </div>
  );
}
