import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  isChainVisible,
  useSelectionStore,
  type SelectionState,
} from '../../stores/useSelectionStore';

/** Khóa trong Object3D.userData đánh dấu node gốc của một linh kiện. */
export const COMPONENT_ID_KEY = 'componentId';
/** Di chuyển con trỏ vượt ngưỡng này (px) giữa down/up được coi là kéo (orbit), không phải click. */
export const CLICK_MOVE_THRESHOLD_PX = 5;

export const HIGHLIGHT_STYLE = {
  hover: { color: 0x3399ff, intensity: 0.45 },
  selected: { color: 0xffaa00, intensity: 0.7 },
} as const;
export type HighlightMode = keyof typeof HIGHLIGHT_STYLE;

// ---------------------------------------------------------------------------
// Resolve owner
// ---------------------------------------------------------------------------

export function getComponentIdOf(object: THREE.Object3D): string | null {
  const id = object.userData?.[COMPONENT_ID_KEY];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Từ object trúng raycast, đi ngược lên cha để tìm componentId gần nhất. */
export function findComponentId(object: THREE.Object3D | null | undefined): string | null {
  let current: THREE.Object3D | null | undefined = object;
  while (current) {
    const id = getComponentIdOf(current);
    if (id) return id;
    current = current.parent;
  }
  return null;
}

/** Chuỗi componentId từ object lên gốc (gần nhất trước). */
export function getComponentChain(object: THREE.Object3D): string[] {
  const chain: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = getComponentIdOf(current);
    if (id) chain.push(id);
    current = current.parent;
  }
  return chain;
}

export function findObjectByComponentId(
  root: THREE.Object3D,
  id: string,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (!found && getComponentIdOf(obj) === id) found = obj;
  });
  return found;
}

/** Object và mọi tổ tiên đều visible. */
export function isObjectVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

/** Lấy componentId của giao điểm đầu tiên đang hiển thị (bỏ qua mesh bị ẩn). */
export function resolveHit(
  intersections: ReadonlyArray<{ object: THREE.Object3D }>,
): string | null {
  for (const hit of intersections) {
    if (!isObjectVisible(hit.object)) continue;
    const id = findComponentId(hit.object);
    if (id) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Click vs drag
// ---------------------------------------------------------------------------

export interface Point2 {
  x: number;
  y: number;
}

export function isClickGesture(
  start: Point2 | null,
  end: Point2,
  threshold = CLICK_MOVE_THRESHOLD_PX,
): boolean {
  if (!start) return true;
  return Math.hypot(end.x - start.x, end.y - start.y) <= threshold;
}

// ---------------------------------------------------------------------------
// Highlight tạm thời (không đổi material gốc)
// ---------------------------------------------------------------------------

const originalMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const HIGHLIGHT_FLAG = '__selectionHighlight';

function disposeTemporary(mesh: THREE.Mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) if (m?.userData?.[HIGHLIGHT_FLAG]) m.dispose();
}

function makeHighlighted(material: THREE.Material, mode: HighlightMode): THREE.Material {
  const clone = material.clone();
  clone.userData = { ...clone.userData, [HIGHLIGHT_FLAG]: true };
  const style = HIGHLIGHT_STYLE[mode];
  const emissive = (clone as THREE.MeshStandardMaterial).emissive;
  if (emissive instanceof THREE.Color) {
    emissive.setHex(style.color);
    (clone as THREE.MeshStandardMaterial).emissiveIntensity = style.intensity;
  } else if ((clone as THREE.MeshBasicMaterial).color instanceof THREE.Color) {
    (clone as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(style.color), style.intensity);
  }
  return clone;
}

/** Gắn material clone có emissive lên mọi mesh trong cây con; bản gốc được giữ để khôi phục. */
export function applyHighlight(root: THREE.Object3D, mode: HighlightMode): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!originalMaterials.has(mesh)) originalMaterials.set(mesh, mesh.material);
    else disposeTemporary(mesh);
    const base = originalMaterials.get(mesh)!;
    mesh.material = Array.isArray(base)
      ? base.map((m) => makeHighlighted(m, mode))
      : makeHighlighted(base, mode);
  });
}

/** Khôi phục material gốc cho cây con. */
export function clearHighlight(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !originalMaterials.has(mesh)) return;
    disposeTemporary(mesh);
    mesh.material = originalMaterials.get(mesh)!;
    originalMaterials.delete(mesh);
  });
}

export function isHighlighted(mesh: THREE.Mesh): boolean {
  return originalMaterials.has(mesh);
}

// ---------------------------------------------------------------------------
// Đồng bộ store → scene
// ---------------------------------------------------------------------------

/** Áp hide/isolate lên phần hình học riêng (mesh) của từng linh kiện. */
export function applyVisibility(
  root: THREE.Object3D,
  state: Pick<SelectionState, 'hidden' | 'isolated'>,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const chain = getComponentChain(mesh);
    if (chain.length === 0) return;
    mesh.visible = isChainVisible(chain, state);
  });
}

/** Áp highlight hover/selected; trả về danh sách object đã highlight để xóa sau. */
export function applySelectionHighlight(
  root: THREE.Object3D,
  state: Pick<SelectionState, 'hoverId' | 'selectedId'>,
  previous: THREE.Object3D[] = [],
): THREE.Object3D[] {
  previous.forEach(clearHighlight);
  const applied: THREE.Object3D[] = [];
  if (state.hoverId && state.hoverId !== state.selectedId) {
    const obj = findObjectByComponentId(root, state.hoverId);
    if (obj) {
      applyHighlight(obj, 'hover');
      applied.push(obj);
    }
  }
  if (state.selectedId) {
    const obj = findObjectByComponentId(root, state.selectedId);
    if (obj) {
      applyHighlight(obj, 'selected');
      applied.push(obj);
    }
  }
  return applied;
}

export interface UseSelectableOptions {
  /** Ngưỡng px phân biệt click với kéo orbit. */
  threshold?: number;
  /** Đổi giá trị này khi mô hình bên trong root thay đổi (vd: tải xong GLTF). */
  modelKey?: unknown;
  /** Click vào khoảng trống thì bỏ chọn. Mặc định: true. */
  deselectOnMiss?: boolean;
}

/**
 * Gắn vào group gốc của mô hình:
 * ```tsx
 * const ref = useRef<Group>(null);
 * const handlers = useSelectable(ref);
 * <group ref={ref} {...handlers}>...</group>
 * ```
 */
export function useSelectable(
  rootRef: RefObject<THREE.Object3D>,
  { threshold = CLICK_MOVE_THRESHOLD_PX, modelKey, deselectOnMiss = true }: UseSelectableOptions = {},
) {
  const gl = useThree((s) => s.gl);
  const downRef = useRef<Point2 | null>(null);

  // Ghi vị trí pointerdown trực tiếp trên canvas (kể cả khi bấm vào khoảng trống).
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY };
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [gl]);

  // Đồng bộ highlight + visibility từ store vào scene.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let applied = applySelectionHighlight(root, useSelectionStore.getState());
    applyVisibility(root, useSelectionStore.getState());
    const unsubscribe = useSelectionStore.subscribe((s, prev) => {
      if (s.hoverId !== prev.hoverId || s.selectedId !== prev.selectedId) {
        applied = applySelectionHighlight(root, s, applied);
      }
      if (s.hidden !== prev.hidden || s.isolated !== prev.isolated) {
        applyVisibility(root, s);
      }
    });
    return () => {
      unsubscribe();
      applied.forEach(clearHighlight);
    };
  }, [rootRef, modelKey]);

  const wasClick = useCallback(
    (e: MouseEvent) => isClickGesture(downRef.current, { x: e.clientX, y: e.clientY }, threshold),
    [threshold],
  );

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!wasClick(e.nativeEvent)) return; // kéo orbit → không đổi selection
      const id = resolveHit(e.intersections);
      if (!id) return;
      e.stopPropagation();
      useSelectionStore.getState().select(id);
    },
    [wasClick],
  );

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.buttons !== 0) return; // đang kéo → giữ nguyên hover
    useSelectionStore.getState().setHover(resolveHit(e.intersections));
  }, []);

  const onPointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    useSelectionStore.getState().setHover(resolveHit(e.intersections ?? []));
  }, []);

  const onPointerMissed = useCallback(
    (e: MouseEvent) => {
      if (!deselectOnMiss || !wasClick(e)) return;
      useSelectionStore.getState().clearSelection();
    },
    [deselectOnMiss, wasClick],
  );

  return useMemo(
    () => ({ onClick, onPointerMove, onPointerOut, onPointerMissed }),
    [onClick, onPointerMove, onPointerOut, onPointerMissed],
  );
}

// ---------------------------------------------------------------------------
// Phím tắt
// ---------------------------------------------------------------------------

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** Xử lý phím; trả về true nếu đã xử lý. Esc = bỏ chọn, F = focus camera. */
export function handleSelectionKey(e: Pick<KeyboardEvent, 'key' | 'target' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return false;
  const store = useSelectionStore.getState();
  if (e.key === 'Escape') {
    if (!store.selectedId) return false;
    store.clearSelection();
    return true;
  }
  if (e.key === 'f' || e.key === 'F') {
    if (!store.selectedId) return false;
    store.requestFocus(store.selectedId);
    return true;
  }
  return false;
}

/** Đăng ký phím tắt Esc/F trên window. Có thể dùng ngoài Canvas. */
export function useSelectionHotkeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (handleSelectionKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
