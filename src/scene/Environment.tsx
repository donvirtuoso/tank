import { Environment as DreiEnvironment, Lightformer, Sky } from '@react-three/drei';

export type EnvironmentPresetId = 'daylight' | 'hangar';

export const ENVIRONMENT_PRESET_IDS: readonly EnvironmentPresetId[] = ['daylight', 'hangar'];

export const ENVIRONMENT_LABELS: Readonly<Record<EnvironmentPresetId, string>> = {
  daylight: 'Daylight',
  hangar: 'Hangar',
};

export const ENVIRONMENT_BACKGROUND: Readonly<Record<EnvironmentPresetId, string>> = {
  daylight: '#b9d3ea',
  hangar: '#1d1f22',
};

/**
 * Image-based lighting built procedurally from Lightformers (no HDR download,
 * works offline). The env map is rendered once (`frames={1}`) and re-rendered
 * only when the preset changes.
 */
export function SceneEnvironment({ preset }: { preset: EnvironmentPresetId }) {
  const background = ENVIRONMENT_BACKGROUND[preset];
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 30, 90]} />
      {preset === 'daylight' ? <DaylightEnvironment /> : <HangarEnvironment />}
    </>
  );
}

function DaylightEnvironment() {
  return (
    <>
      <Sky distance={450} sunPosition={[8, 12, 6]} turbidity={6} rayleigh={1.2} />
      <DreiEnvironment key="daylight" resolution={256} frames={1}>
        {/* Sky dome */}
        <Lightformer form="rect" intensity={1.2} color="#cfe3ff" position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[60, 60, 1]} />
        {/* Sun */}
        <Lightformer form="circle" intensity={6} color="#fff1d6" position={[8, 12, 6]} scale={4} onUpdate={(self) => self.lookAt(0, 0, 0)} />
        {/* Warm ground bounce */}
        <Lightformer form="rect" intensity={0.5} color="#8a7a5a" position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[60, 60, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#bcd4ee" position={[-15, 4, -10]} scale={[30, 8, 1]} onUpdate={(self) => self.lookAt(0, 0, 0)} />
      </DreiEnvironment>
    </>
  );
}

function HangarEnvironment() {
  return (
    <DreiEnvironment key="hangar" resolution={256} frames={1}>
      <color attach="background" args={['#141518']} />
      {/* Ceiling light strips */}
      {[-9, -3, 3, 9].map((x) => (
        <Lightformer key={x} form="rect" intensity={3} color="#f2f6ff" position={[x, 10, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 24, 1]} />
      ))}
      {/* Hangar door glow */}
      <Lightformer form="rect" intensity={1.2} color="#ffe2b8" position={[0, 4, -16]} scale={[20, 7, 1]} />
      {/* Dim side walls */}
      <Lightformer form="rect" intensity={0.25} color="#8b9099" position={[16, 3, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[30, 6, 1]} />
      <Lightformer form="rect" intensity={0.25} color="#8b9099" position={[-16, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[30, 6, 1]} />
    </DreiEnvironment>
  );
}
