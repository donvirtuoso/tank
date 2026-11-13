import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  easeInOutCubic,
  getPresetPose,
  interpolatePose,
  type CameraPose,
  type CameraPresetId,
  type Vec3Tuple,
} from './cameraPresets';

export interface CameraCommand {
  preset: CameraPresetId;
  /** Monotonic id so re-selecting the same preset re-triggers the move. */
  nonce: number;
  /** Timestamp (ms) used to order commands coming from several sources. */
  issuedAt?: number;
}

export interface CameraControllerProps {
  /** Point the camera orbits around (tank centre). */
  target?: Vec3Tuple;
  /** Bounding radius of the subject; scales preset distances and zoom limits. */
  radius?: number;
  command?: CameraCommand | null;
  /** Transition duration in seconds. */
  duration?: number;
}

/**
 * OrbitControls (rotate/zoom/pan with damping) plus animated presets. A preset
 * move interpolates camera position and target over `duration`; any user
 * interaction cancels an in-flight transition.
 */
export function CameraController({
  target = [0, 1, 0],
  radius = 5,
  command,
  duration = 0.9,
}: CameraControllerProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const transition = useRef<{ from: CameraPose; to: CameraPose; elapsed: number } | null>(null);
  const initialised = useRef(false);

  // Initial framing (no animation) once.
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl || initialised.current) return;
    initialised.current = true;
    const pose = getPresetPose('reset', target, radius);
    camera.position.set(...pose.position);
    ctl.target.set(...pose.target);
    ctl.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // Start a transition when a new command arrives.
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl || !command) return;
    transition.current = {
      from: {
        position: camera.position.toArray() as Vec3Tuple,
        target: ctl.target.toArray() as Vec3Tuple,
      },
      to: getPresetPose(command.preset, target, radius),
      elapsed: 0,
    };
    // Each command object is one request; target/radius are read at trigger time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, camera]);

  // User input cancels the animation so controls never fight each other.
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return;
    const cancel = () => {
      transition.current = null;
    };
    ctl.addEventListener('start', cancel);
    return () => ctl.removeEventListener('start', cancel);
  }, []);

  useFrame((_, delta) => {
    const ctl = controls.current;
    const tr = transition.current;
    if (!ctl || !tr) return;
    tr.elapsed += Math.min(delta, 0.1);
    const t = duration > 0 ? Math.min(1, tr.elapsed / duration) : 1;
    const pose = interpolatePose(tr.from, tr.to, easeInOutCubic(t));
    camera.position.set(...pose.position);
    ctl.target.set(...pose.target);
    ctl.update();
    if (t >= 1) transition.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning
      minDistance={radius * 0.8}
      maxDistance={radius * 6}
      // Keep the camera above the floor.
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}
