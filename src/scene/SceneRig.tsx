import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Box3, Mesh, Quaternion, Vector3, type Group, type Material, type Object3D } from 'three';
import { useAssemblyStore } from '@/stores/useAssemblyStore';
import { useSceneFxStore } from '@/stores/useSceneFxStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useViewerStore } from '@/stores/useViewerStore';
import { buildExplodePlan, computeExplodeOffsets, type ExplodePlan } from './animations/explode';
import type { Vec3 } from './animations/transformEngine';
import { applyVisibility, getComponentChain, useSelectable } from './interactions/useSelectable';
import { useFocusCamera } from './interactions/focusCamera';
import { createCutawayPlane, createXRayController, type XRayController, type XRayRole } from './materials/xray';
import { sceneRegistry, type SceneRegistry } from './sceneRegistry';
import { TANK_EXPLODE_PARTS } from './tankCatalog';

export interface SceneRigProps {
  children: ReactNode;
  /** Đổi khi mô hình bên trong thay đổi (variant, GLB…) để tính lại bounds / highlight. */
  modelKey?: unknown;
  registry?: SceneRegistry;
}

const DROP_IN_SECONDS = 0.9;
const DROP_IN_HEIGHT = 2.5;
const POWERPACK_LIFT: Vec3 = [0, 2.2, 0];

const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpVec = new Vector3();

/** Vai trò X-quang: bên trong giữ nguyên, nắp/váy ẩn đi, phần còn lại thành vỏ trong suốt. */
function xrayRoleOf(obj: Object3D): XRayRole | undefined {
  if (!(obj instanceof Mesh)) return undefined;
  const chain = getComponentChain(obj);
  if (chain.some((id) => id === 'interior' || id === 'powertrain')) return 'interior';
  const owner = chain[0] ?? '';
  if (/hatch|cover|skirt/.test(owner)) return 'panel';
  return 'shell';
}

/**
 * Bọc mô hình trong scene để nối các panel với 3D: chọn/hover bộ phận, focus camera,
 * exploded view, cơ cấu tháo lắp, ẩn bộ phận theo bước hướng dẫn, khung dây và X-quang.
 */
export function SceneRig({ children, modelKey, registry = sceneRegistry }: SceneRigProps) {
  const rootRef = useRef<Group>(null);
  // Các hook chọn/focus khai báo RefObject<Object3D> (kiểu React 18); ref vẫn null tới khi mount.
  const objectRef = rootRef as RefObject<Object3D>;
  const handlers = useSelectable(objectRef, { modelKey });
  useFocusCamera(objectRef);
  useExplodeDriver(rootRef, registry, modelKey);
  useDisplayModes(rootRef, modelKey);
  return (
    <group ref={rootRef} {...handlers}>
      {children}
    </group>
  );
}

/** Đặt vị trí tách / nhấc / thả của các bộ phận, cộng dồn lên vị trí gốc do React đặt. */
function useExplodeDriver(rootRef: RefObject<Group | null>, registry: SceneRegistry, modelKey: unknown) {
  const bases = useRef(new Map<Object3D, Vector3>());
  const planRef = useRef<ExplodePlan | null>(null);
  const hiddenRef = useRef(new Set<Object3D>());

  // Mô hình đổi: React đã đặt lại vị trí → quên vị trí gốc cũ và tính lại plan.
  useEffect(() => {
    bases.current.clear();
    planRef.current = null;
  }, [modelKey]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const assembly = useAssemblyStore.getState();
    const fx = useSceneFxStore.getState();
    const offsets = new Map<string, Vector3>();
    const add = (id: string, v: Vec3) => {
      const cur = offsets.get(id) ?? new Vector3();
      offsets.set(id, cur.add(new Vector3(v[0], v[1], v[2])));
    };

    if (assembly.explodeValue > 0) {
      planRef.current ??= buildPlan(registry);
      for (const [id, v] of computeExplodeOffsets(planRef.current, assembly.explodeValue, assembly.explodeSelection)) {
        if (v[0] !== 0 || v[1] !== 0 || v[2] !== 0) add(id, v);
      }
    }
    if (fx.progress.powerpack > 0) {
      const t = fx.progress.powerpack;
      add('powertrain', [POWERPACK_LIFT[0] * t, POWERPACK_LIFT[1] * t, POWERPACK_LIFT[2] * t]);
    }
    if (fx.dropIn) {
      const t = Math.min(1, (performance.now() - fx.dropIn.startedAt) / 1000 / DROP_IN_SECONDS);
      const h = (1 - t) * (1 - t) * DROP_IN_HEIGHT;
      if (h > 0) for (const id of fx.dropIn.ids) add(id, [0, h, 0]);
    }

    // Trả các bộ phận không còn offset về vị trí gốc.
    const active = new Set<Object3D>();
    for (const [id, worldOffset] of offsets) {
      const obj = registry.get(id);
      if (!obj) continue;
      active.add(obj);
      let base = bases.current.get(obj);
      if (!base) {
        base = obj.position.clone();
        bases.current.set(obj, base);
      }
      obj.position.copy(base).add(toParentSpace(obj, worldOffset));
    }
    for (const [obj, base] of bases.current) {
      if (active.has(obj)) continue;
      obj.position.copy(base);
      bases.current.delete(obj);
    }

    // Ẩn bộ phận chưa lắp ở bước hướng dẫn hiện tại.
    const wanted = new Set<Object3D>();
    for (const id of fx.tutorialHidden) {
      const obj = registry.get(id);
      if (obj) wanted.add(obj);
    }
    let restored = false;
    for (const obj of hiddenRef.current) {
      if (!wanted.has(obj)) {
        obj.visible = true;
        hiddenRef.current.delete(obj);
        restored = true;
      }
    }
    for (const obj of wanted) {
      obj.visible = false;
      hiddenRef.current.add(obj);
    }
    if (restored) applyVisibility(root, useSelectionStore.getState());
  });
}

/**
 * Bộ phận không khai báo hướng tách sẽ tách NGANG từ tâm xe ra tâm bộ phận (bỏ thành phần Y,
 * để không bị đẩy xuống dưới mặt sàn).
 */
function buildPlan(registry: SceneRegistry): ExplodePlan {
  const measured = TANK_EXPLODE_PARTS.flatMap((spec) => {
    const obj = registry.get(spec.id);
    if (!obj) return [];
    const box = new Box3().setFromObject(obj);
    return [{ spec, box: box.isEmpty() ? null : box }];
  });
  const all = new Box3();
  for (const m of measured) if (m.box) all.union(m.box);
  const center = all.isEmpty() ? new Vector3() : all.getCenter(new Vector3());

  const parts = measured.map(({ spec, box }) => {
    if (spec.direction || !box) return spec;
    const c = box.getCenter(new Vector3());
    const dir = new Vector3(c.x - center.x, 0, c.z - center.z);
    return { ...spec, direction: (dir.lengthSq() > 1e-6 ? dir.normalize().toArray() : [0, 1, 0]) as Vec3 };
  });
  return buildExplodePlan(parts, { center: center.toArray() as Vec3 });
}

/** Đổi vector dịch chuyển trong không gian thế giới sang không gian của node cha. */
function toParentSpace(obj: Object3D, worldOffset: Vector3): Vector3 {
  const parent = obj.parent;
  if (!parent) return worldOffset;
  parent.updateWorldMatrix(true, false);
  parent.matrixWorld.decompose(tmpVec, tmpQuat, tmpScale);
  return worldOffset
    .clone()
    .applyQuaternion(tmpQuat.invert())
    .divide(new Vector3(tmpScale.x || 1, tmpScale.y || 1, tmpScale.z || 1));
}

/** Khung dây (displayMode) và X-quang / mặt cắt (displayMode hoặc panel lắp ráp). */
function useDisplayModes(rootRef: RefObject<Group | null>, modelKey: unknown) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const displayMode = useViewerStore((s) => s.displayMode);
  const xray = useAssemblyStore((s) => s.xray);
  const controllerRef = useRef<XRayController | null>(null);

  // Khung dây: bật cờ wireframe trên material (dùng chung) và trả lại khi rời chế độ.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || displayMode !== 'wireframe') return;
    const saved = new Map<Material, boolean>();
    root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats as (Material & { wireframe?: boolean })[]) {
        if (saved.has(m) || m.wireframe === undefined) continue;
        saved.set(m, m.wireframe);
        m.wireframe = true;
      }
    });
    invalidate();
    return () => {
      for (const [m, was] of saved) (m as Material & { wireframe: boolean }).wireframe = was;
      invalidate();
    };
  }, [rootRef, displayMode, modelKey, invalidate]);

  const xrayOn = displayMode === 'xray' || xray.enabled;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !xrayOn) return;
    gl.localClippingEnabled = true;
    const controller = createXRayController(root, { roleOf: xrayRoleOf });
    controller.enable();
    controllerRef.current = controller;
    invalidate();
    return () => {
      controller.reset();
      controllerRef.current = null;
      invalidate();
    };
  }, [rootRef, xrayOn, modelKey, gl, invalidate]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setClippingPlane(
      xray.enabled && xray.clipping ? createCutawayPlane(xray.clipAxis, xray.clipOffset, xray.clipFlip) : null,
    );
    invalidate();
  }, [xrayOn, xray.enabled, xray.clipping, xray.clipAxis, xray.clipOffset, xray.clipFlip, invalidate]);
}
