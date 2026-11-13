/**
 * X-Ray / cutaway.
 *
 *  - Hull/shell ngoài: thay bằng BẢN SAO material trong suốt (transparent, depthWrite=false,
 *    DoubleSide, renderOrder cao) để thấy engine/nội thất phía trong.
 *  - Panel ngoài: ẩn (visible=false).
 *  - Clipping plane tùy chọn (cutaway) áp lên các bản sao; cần `renderer.localClippingEnabled = true`.
 *  - `reset()` trả lại material gốc (cùng tham chiếu), renderOrder, visible; dispose bản sao.
 *
 * Material gốc KHÔNG bị sửa đổi.
 */
import {
  type ColorRepresentation,
  type Material,
  type Object3D,
  Color,
  DoubleSide,
  Mesh,
  Plane,
  Vector3,
} from 'three';

export type XRayRole = 'shell' | 'panel' | 'interior';

export interface XRayOptions {
  /** Xác định role của object; mặc định đọc `userData.xrayRole` hoặc đoán theo tên. */
  roleOf?: (obj: Object3D) => XRayRole | undefined;
  opacity?: number;
  tint?: ColorRepresentation;
  renderOrder?: number;
}

export const XRAY_DEFAULTS = { opacity: 0.18, tint: 0x66ccff, renderOrder: 10 } as const;

const SHELL_RE = /hull|shell|turret_?body|armou?r/i;
const PANEL_RE = /panel|skirt|cover|hatch|plate/i;

export function defaultRoleOf(obj: Object3D): XRayRole | undefined {
  const role = obj.userData?.xrayRole as XRayRole | undefined;
  if (role) return role;
  if (PANEL_RE.test(obj.name)) return 'panel';
  if (SHELL_RE.test(obj.name)) return 'shell';
  return undefined;
}

/** Bản sao trong suốt của một material (material gốc giữ nguyên). */
export function createXRayMaterial(source: Material, opts: XRayOptions = {}): Material {
  const m = source.clone();
  m.transparent = true;
  m.opacity = opts.opacity ?? XRAY_DEFAULTS.opacity;
  m.depthWrite = false;
  m.side = DoubleSide;
  const withColor = m as Material & { color?: Color; emissive?: Color };
  if (withColor.color instanceof Color) withColor.color.set(opts.tint ?? XRAY_DEFAULTS.tint);
  m.userData = { ...m.userData, xray: true };
  m.needsUpdate = true;
  return m;
}

export type ClipAxis = 'x' | 'y' | 'z';

/** Mặt phẳng cắt theo trục: giữ phần có toạ độ < offset (hoặc > nếu flip). */
export function createCutawayPlane(axis: ClipAxis, offset: number, flip = false): Plane {
  const n = new Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
  if (flip) n.negate();
  return new Plane(n, flip ? -offset : offset);
}

export function enableLocalClipping(renderer: { localClippingEnabled: boolean }): void {
  renderer.localClippingEnabled = true;
}

interface SavedState {
  material: Material | Material[];
  renderOrder: number;
  visible: boolean;
}

export interface XRayController {
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
  setEnabled(on: boolean): void;
  /** null = tắt cutaway. */
  setClippingPlane(plane: Plane | null): void;
  /** Trả lại render bình thường, xoá clipping, dispose bản sao. */
  reset(): void;
}

export function createXRayController(root: Object3D, options: XRayOptions = {}): XRayController {
  const roleOf = options.roleOf ?? defaultRoleOf;
  const renderOrder = options.renderOrder ?? XRAY_DEFAULTS.renderOrder;
  const saved = new Map<Object3D, SavedState>();
  const clones = new Map<Material, Material>();
  let clipPlane: Plane | null = null;
  let enabled = false;

  const cloneOf = (m: Material): Material => {
    let c = clones.get(m);
    if (!c) {
      c = createXRayMaterial(m, options);
      c.clippingPlanes = clipPlane ? [clipPlane] : null;
      clones.set(m, c);
    }
    return c;
  };

  const enable = () => {
    if (enabled) return;
    enabled = true;
    root.traverse((obj) => {
      const role = roleOf(obj);
      if (role === 'panel') {
        saved.set(obj, {
          material: (obj as Mesh).material as Material | Material[],
          renderOrder: obj.renderOrder,
          visible: obj.visible,
        });
        obj.visible = false;
      } else if (role === 'shell' && obj instanceof Mesh) {
        const mat = obj.material as Material | Material[];
        saved.set(obj, { material: mat, renderOrder: obj.renderOrder, visible: obj.visible });
        obj.material = Array.isArray(mat) ? mat.map(cloneOf) : cloneOf(mat);
        obj.renderOrder = renderOrder;
      }
    });
  };

  const disable = () => {
    if (!enabled) return;
    enabled = false;
    for (const [obj, s] of saved) {
      if (obj instanceof Mesh) obj.material = s.material;
      obj.renderOrder = s.renderOrder;
      obj.visible = s.visible;
    }
    saved.clear();
    for (const c of clones.values()) c.dispose();
    clones.clear();
  };

  return {
    get enabled() {
      return enabled;
    },
    enable,
    disable,
    setEnabled: (on) => (on ? enable() : disable()),
    setClippingPlane(plane) {
      clipPlane = plane;
      for (const c of clones.values()) {
        c.clippingPlanes = plane ? [plane] : null;
        c.needsUpdate = true;
      }
    },
    reset() {
      disable();
      clipPlane = null;
    },
  };
}
