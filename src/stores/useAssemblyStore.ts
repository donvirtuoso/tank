/**
 * Trạng thái tháo/lắp, explode, X-Ray, turret/gun.
 *
 * Store chỉ lưu Ý ĐỊNH (requests) và trạng thái báo về (mechanisms). Lớp scene giữ các
 * controller (mechanisms.ts) – nhận request, chạy tween, rồi `reportMechanismState`.
 */
import { create } from 'zustand';
import type { MechanismState } from '../scene/animations/transformEngine';
import { clamp, transition } from '../scene/animations/transformEngine';
import type { MechanismKind } from '../scene/animations/mechanisms';
import { GUN_ELEVATION_LIMITS, TURRET_YAW_LIMITS } from '../scene/animations/mechanisms';
import type { ClipAxis } from '../scene/materials/xray';

export type MechanismRequest = 'open' | 'closed';

export interface XRayState {
  enabled: boolean;
  clipping: boolean;
  clipAxis: ClipAxis;
  clipOffset: number;
  clipFlip: boolean;
}

export interface AssemblyData {
  /** Trạng thái thực tế do controller báo về. */
  mechanisms: Record<string, MechanismState>;
  /** Ý định mới nhất của người dùng. */
  requests: Record<string, MechanismRequest>;
  /** Part đang ở trạng thái tháo rời (detach OPEN). */
  detached: Record<string, boolean>;
  /** Slider explode 0–100. */
  explodeValue: number;
  /** id / group / stage key được chọn để explode riêng (rỗng = tất cả). */
  explodeSelection: string[];
  xray: XRayState;
  /** Radian, chỉ hình ảnh. */
  turretYaw: number;
  gunElevation: number;
  /** Tăng mỗi lần reset để lớp scene snap về transform gốc. */
  resetToken: number;
}

export interface AssemblyActions {
  requestMechanism(id: string, request: MechanismRequest): void;
  toggleMechanism(id: string): void;
  reportMechanismState(id: string, state: MechanismState, kind?: MechanismKind): void;
  setExplodeValue(value: number): void;
  explodeAll(): void;
  collapse(): void;
  explodeSelected(selection: string[]): void;
  toggleExplodeSelection(key: string): void;
  clearExplodeSelection(): void;
  setXRay(patch: Partial<XRayState>): void;
  resetXRay(): void;
  setTurretYaw(rad: number): void;
  setGunElevation(rad: number): void;
  resetAll(): void;
}

export type AssemblyStore = AssemblyData & AssemblyActions;

export const INITIAL_XRAY: XRayState = {
  enabled: false,
  clipping: false,
  clipAxis: 'x',
  clipOffset: 0,
  clipFlip: false,
};

export const initialAssemblyData = (): AssemblyData => ({
  mechanisms: {},
  requests: {},
  detached: {},
  explodeValue: 0,
  explodeSelection: [],
  xray: { ...INITIAL_XRAY },
  turretYaw: 0,
  gunElevation: 0,
  resetToken: 0,
});

export const useAssemblyStore = create<AssemblyStore>()((set, get) => ({
  ...initialAssemblyData(),

  requestMechanism: (id, request) =>
    set((s) => ({ requests: { ...s.requests, [id]: request } })),

  toggleMechanism: (id) => {
    const s = get();
    // Ưu tiên request gần nhất để click liên tục đảo chiều đúng kể cả khi controller chưa báo về.
    const current: MechanismState =
      s.requests[id] === 'open' ? 'OPENING' : s.requests[id] === 'closed' ? 'CLOSING' : (s.mechanisms[id] ?? 'CLOSED');
    const next = transition(current, 'TOGGLE');
    get().requestMechanism(id, next === 'OPENING' ? 'open' : 'closed');
  },

  reportMechanismState: (id, state, kind) =>
    set((s) => ({
      mechanisms: { ...s.mechanisms, [id]: state },
      detached:
        kind === 'detach' && (state === 'OPEN' || state === 'CLOSED')
          ? { ...s.detached, [id]: state === 'OPEN' }
          : s.detached,
    })),

  setExplodeValue: (value) => set({ explodeValue: clamp(Number.isFinite(value) ? value : 0, 0, 100) }),
  explodeAll: () => set({ explodeValue: 100, explodeSelection: [] }),
  collapse: () => set({ explodeValue: 0 }),
  explodeSelected: (selection) => set({ explodeSelection: [...selection], explodeValue: 100 }),
  toggleExplodeSelection: (key) =>
    set((s) => ({
      explodeSelection: s.explodeSelection.includes(key)
        ? s.explodeSelection.filter((k) => k !== key)
        : [...s.explodeSelection, key],
    })),
  clearExplodeSelection: () => set({ explodeSelection: [] }),

  setXRay: (patch) => set((s) => ({ xray: { ...s.xray, ...patch } })),
  resetXRay: () => set({ xray: { ...INITIAL_XRAY } }),

  setTurretYaw: (rad) => set({ turretYaw: clamp(rad, TURRET_YAW_LIMITS.min, TURRET_YAW_LIMITS.max) }),
  setGunElevation: (rad) =>
    set({ gunElevation: clamp(rad, GUN_ELEVATION_LIMITS.min, GUN_ELEVATION_LIMITS.max) }),

  resetAll: () => set((s) => ({ ...initialAssemblyData(), resetToken: s.resetToken + 1 })),
}));
