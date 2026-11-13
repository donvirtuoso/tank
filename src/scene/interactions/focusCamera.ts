import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { findObjectByComponentId } from './useSelectable';

export interface FocusPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Chỉ dùng cho camera trực giao. */
  zoom?: number;
}

/** Controls kiểu OrbitControls (makeDefault) — chỉ cần target + update. */
interface TargetControls {
  target: THREE.Vector3;
  update: () => void;
}

const FALLBACK_DIRECTION = new THREE.Vector3(1, 0.8, 1).normalize();

/** Bounds của object; bỏ qua nếu rỗng. */
export function getObjectBounds(object: THREE.Object3D): THREE.Box3 | null {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? null : box;
}

/**
 * Tính vị trí camera để khung hình bao trọn box, giữ nguyên hướng nhìn hiện tại.
 * `padding` > 1 để chừa lề.
 */
export function computeFocusPose(
  box: THREE.Box3,
  camera: THREE.Camera,
  currentTarget: THREE.Vector3,
  padding = 1.3,
): FocusPose {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center.clone();
  const radius = Math.max(sphere.radius, 1e-3) * padding;

  const direction = camera.position.clone().sub(currentTarget);
  if (direction.lengthSq() < 1e-10) direction.copy(FALLBACK_DIRECTION);
  direction.normalize();

  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (cam.aspect || 1));
    const distance = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));
    return { target, position: target.clone().addScaledVector(direction, distance) };
  }

  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const cam = camera as THREE.OrthographicCamera;
    const width = cam.right - cam.left;
    const height = cam.top - cam.bottom;
    const zoom = Math.min(width, height) / (2 * radius);
    const distance = Math.max(camera.position.distanceTo(currentTarget), radius * 2);
    return { target, position: target.clone().addScaledVector(direction, distance), zoom };
  }

  return { target, position: target.clone().addScaledVector(direction, radius * 3) };
}

/** Áp tư thế lên camera (+controls) theo tỉ lệ t ∈ [0,1] từ `from`. */
export function applyFocusPose(
  camera: THREE.Camera,
  controls: TargetControls | null,
  from: FocusPose,
  to: FocusPose,
  t: number,
): void {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  const eased = 1 - Math.pow(1 - k, 3);
  camera.position.lerpVectors(from.position, to.position, eased);
  const target = new THREE.Vector3().lerpVectors(from.target, to.target, eased);
  const ortho = camera as THREE.OrthographicCamera;
  if (ortho.isOrthographicCamera && from.zoom !== undefined && to.zoom !== undefined) {
    ortho.zoom = THREE.MathUtils.lerp(from.zoom, to.zoom, eased);
    ortho.updateProjectionMatrix();
  }
  if (controls) {
    controls.target.copy(target);
    controls.update();
  } else {
    camera.lookAt(target);
  }
}

function isTargetControls(value: unknown): value is TargetControls {
  const c = value as TargetControls | null;
  return !!c && c.target instanceof THREE.Vector3 && typeof c.update === 'function';
}

/**
 * Lắng nghe `focusRequest` trong store và đưa camera tới bounds của linh kiện.
 * Dùng trong Canvas; controls cần `makeDefault` để lấy được qua useThree.
 */
export function useFocusCamera(rootRef: RefObject<THREE.Object3D>, duration = 0.6): void {
  const camera = useThree((s) => s.camera);
  const rawControls = useThree((s) => s.controls);
  const invalidate = useThree((s) => s.invalidate);
  const focusRequest = useSelectionStore((s) => s.focusRequest);
  const anim = useRef<{ from: FocusPose; to: FocusPose; elapsed: number } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!focusRequest || !root) return;
    const object = findObjectByComponentId(root, focusRequest.id);
    const box = object ? getObjectBounds(object) : null;
    if (!box) return;
    const controls = isTargetControls(rawControls) ? rawControls : null;
    const currentTarget = controls
      ? controls.target.clone()
      : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()));
    const from: FocusPose = {
      position: camera.position.clone(),
      target: currentTarget,
      zoom: (camera as THREE.OrthographicCamera).zoom,
    };
    anim.current = { from, to: computeFocusPose(box, camera, currentTarget), elapsed: 0 };
    invalidate();
    // Chỉ chạy lại khi có yêu cầu mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;
    a.elapsed += delta;
    const t = duration > 0 ? a.elapsed / duration : 1;
    const controls = isTargetControls(rawControls) ? rawControls : null;
    applyFocusPose(camera, controls, a.from, a.to, t);
    if (t >= 1) anim.current = null;
    else invalidate();
  });
}
