import { ContactShadows, Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Box3, Vector3, type Group } from 'three';
import { CameraController, type CameraCommand } from './CameraController';
import { CAMERA_PRESET_IDS, CAMERA_PRESET_LABELS, type CameraPresetId, type Vec3Tuple } from './cameraPresets';
import { computeBoundingRadius, computeTankLayout, resolveVariant, type DeepPartial, type TankArticulation, type TankVariantConfig } from './components/variant';
import { ENVIRONMENT_LABELS, ENVIRONMENT_PRESET_IDS, SceneEnvironment, type EnvironmentPresetId } from './Environment';
import { Lighting } from './Lighting';
import { GlbTankModel, type GlbHandles, type GlbLoadStatus } from './loaders/glbAdapter';
import { ProceduralTank } from './ProceduralTank';
import { SceneRig } from './SceneRig';
import { sceneRegistry, type SceneRegistry } from './sceneRegistry';

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
  /**
   * Thử nạp mô hình GLB theo `glbNodeMapping.json` (`/models/tank.glb`); thiếu/lỗi thì dùng
   * mô hình procedural. Mặc định: false (luôn procedural).
   */
  useGlb?: boolean;
  /** URL file GLB (vd: object URL của file người dùng nhập); mặc định lấy theo glbNodeMapping.json. */
  glbUrl?: string;
  /** Giới hạn kích thước file GLB (byte); mặc định lấy theo glbNodeMapping.json. */
  glbMaxBytes?: number;
  /**
   * Nối scene với các panel: chọn bộ phận bằng chuột, focus camera, exploded view, cơ cấu,
   * khung dây / X-quang (xem `SceneRig`). Mặc định: false.
   */
  interactive?: boolean;
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
  useGlb = false,
  glbUrl,
  glbMaxBytes,
  interactive = false,
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

  // GlbTankModel nhận fallback dạng component không props; giữ identity ổn định để không remount.
  const Fallback = useMemo(
    () =>
      function ProceduralFallback() {
        return <ProceduralTank variant={variant} articulation={articulation} registry={registry} />;
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- variant so sánh theo nội dung qua variantKey
    [variantKey, articulation, registry],
  );
  const [glbLoaded, setGlbLoaded] = useState(false);
  const handleGlbStatus = useCallback((status: GlbLoadStatus) => setGlbLoaded(status.state === 'loaded'), []);

  // Đăng ký bộ phận của GLB vào registry (như mô hình dựng sẵn) để chọn / tháo rời / hướng dẫn dùng được.
  const targetRegistry = registry ?? sceneRegistry;
  const glbRegistered = useRef<GlbHandles>({});
  const handleGlbHandles = useCallback(
    (handles: GlbHandles) => {
      for (const [id, obj] of Object.entries(glbRegistered.current)) targetRegistry.unregister(id, obj);
      for (const [id, obj] of Object.entries(handles)) {
        obj.userData.componentId = id;
        targetRegistry.register(id, obj);
      }
      glbRegistered.current = handles;
    },
    [targetRegistry],
  );

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 500, position: [10, 6, 12] }}>
        <Suspense fallback={null}>
          <SceneEnvironment preset={env} />
        </Suspense>
        <Lighting environment={env} shadowExtent={Math.max(5, radius * 1.2)} />
        <MaybeRig
          interactive={interactive}
          modelKey={`${variantKey}|${String(useGlb)}|${glbUrl ?? ''}|${String(glbLoaded)}`}
          registry={registry}>
          {useGlb ? (
            <FitToGround active={glbLoaded} targetLength={radius * 1.8}>
              <GlbTankModel
                fallback={Fallback}
                url={glbUrl}
                maxFileSizeBytes={glbMaxBytes}
                onStatusChange={handleGlbStatus}
                onHandles={handleGlbHandles}
              />
            </FitToGround>
          ) : (
            <ProceduralTank variant={variant} articulation={articulation} registry={registry} />
          )}
        </MaybeRig>
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

function MaybeRig({
  interactive,
  modelKey,
  registry,
  children,
}: {
  interactive: boolean;
  modelKey: string;
  registry?: SceneRegistry;
  children: ReactNode;
}) {
  return interactive ? (
    <SceneRig modelKey={modelKey} registry={registry}>
      {children}
    </SceneRig>
  ) : (
    <>{children}</>
  );
}

/**
 * Mô hình GLB tải về có tỉ lệ/gốc toạ độ tuỳ ý. Khi `active`, co giãn để cạnh ngang dài nhất bằng
 * `targetLength`, căn giữa theo X/Z và đặt đáy lên mặt đất (y = 0). Khi không active: giữ nguyên.
 */
function FitToGround({ active, targetLength, children }: { active: boolean; targetLength: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    if (!active) return;
    group.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const size = box.getSize(new Vector3());
    const longest = Math.max(size.x, size.z);
    if (!(longest > 0)) return;
    const s = targetLength / longest;
    const center = box.getCenter(new Vector3());
    group.scale.setScalar(s);
    group.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  }, [active, targetLength]);
  return <group ref={ref}>{children}</group>;
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
