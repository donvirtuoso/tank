import { create } from 'zustand';

/** Metadata mô tả một linh kiện có thể chọn trong mô hình. */
export interface ComponentInfo {
  id: string;
  nameVi: string;
  nameEn: string;
  /** Nhóm dùng để lọc (vd: "hull", "turret", "mobility"). */
  group: string;
  parentId?: string | null;
  properties?: Record<string, string | number>;
  /** Nội dung giáo dục / mô tả chức năng. */
  education?: string;
  relatedIds?: string[];
}

export interface FocusRequest {
  id: string;
  /** Tăng mỗi lần yêu cầu để focus lại cùng một linh kiện. */
  nonce: number;
}

export interface SelectionState {
  selectedId: string | null;
  hoverId: string | null;
  /** Các id bị ẩn thủ công. */
  hidden: string[];
  /** null = không cô lập; mảng = chỉ hiện các id này (và con của chúng). */
  isolated: string[] | null;
  focusRequest: FocusRequest | null;
}

export interface SelectionActions {
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;
  clearSelection: () => void;
  hide: (ids: string | string[]) => void;
  show: (ids: string | string[]) => void;
  toggleHidden: (id: string) => void;
  showAll: () => void;
  isolate: (ids: string | string[]) => void;
  /** Cô lập linh kiện cùng các linh kiện liên quan của nó. */
  showRelated: (component: Pick<ComponentInfo, 'id' | 'relatedIds'>) => void;
  requestFocus: (id?: string | null) => void;
  /** Đưa mọi thứ về trạng thái ban đầu. */
  reset: () => void;
}

export type SelectionStore = SelectionState & SelectionActions;

export const initialSelectionState: SelectionState = {
  selectedId: null,
  hoverId: null,
  hidden: [],
  isolated: null,
  focusRequest: null,
};

const toArray = (ids: string | string[]): string[] => (Array.isArray(ids) ? ids : [ids]);
const unique = (ids: string[]): string[] => Array.from(new Set(ids));

let focusNonce = 0;

export const useSelectionStore = create<SelectionStore>()((set, get) => ({
  ...initialSelectionState,

  select: (id) => set({ selectedId: id }),
  setHover: (id) => {
    if (get().hoverId !== id) set({ hoverId: id });
  },
  clearSelection: () => set({ selectedId: null }),

  hide: (ids) =>
    set((s) => {
      const list = toArray(ids);
      return {
        hidden: unique([...s.hidden, ...list]),
        selectedId: s.selectedId && list.includes(s.selectedId) ? null : s.selectedId,
        hoverId: s.hoverId && list.includes(s.hoverId) ? null : s.hoverId,
      };
    }),
  show: (ids) =>
    set((s) => {
      const list = toArray(ids);
      return {
        hidden: s.hidden.filter((h) => !list.includes(h)),
        isolated: s.isolated ? unique([...s.isolated, ...list]) : null,
      };
    }),
  toggleHidden: (id) => {
    if (get().hidden.includes(id)) get().show(id);
    else get().hide(id);
  },
  showAll: () => set({ hidden: [], isolated: null }),

  isolate: (ids) => {
    const list = unique(toArray(ids));
    set((s) => ({
      isolated: list.length ? list : null,
      hidden: s.hidden.filter((h) => !list.includes(h)),
    }));
  },
  showRelated: (component) => {
    get().isolate([component.id, ...(component.relatedIds ?? [])]);
  },

  requestFocus: (id) => {
    const target = id === undefined ? get().selectedId : id;
    if (!target) return;
    focusNonce += 1;
    set({ focusRequest: { id: target, nonce: focusNonce } });
  },

  reset: () => set({ ...initialSelectionState }),
}));

/** Lấy danh sách id tổ tiên (từ cha gần nhất lên gốc). */
export function getAncestorIds(
  id: string,
  byId: ReadonlyMap<string, Pick<ComponentInfo, 'parentId'>>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId ?? null;
  while (current && !seen.has(current)) {
    result.push(current);
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return result;
}

/**
 * Phần hình học riêng của linh kiện có đang hiển thị không.
 * Ẩn tổ tiên sẽ ẩn con; cô lập tổ tiên sẽ giữ con hiển thị.
 * (Cô lập con KHÔNG làm hiện hình học riêng của tổ tiên.)
 */
export function isComponentVisible(
  id: string,
  state: Pick<SelectionState, 'hidden' | 'isolated'>,
  byId?: ReadonlyMap<string, Pick<ComponentInfo, 'parentId'>>,
): boolean {
  const chain = byId ? [id, ...getAncestorIds(id, byId)] : [id];
  return isChainVisible(chain, state);
}

/** Như isComponentVisible nhưng nhận sẵn chuỗi id (bản thân → tổ tiên), vd lấy từ scene graph. */
export function isChainVisible(
  chain: readonly string[],
  state: Pick<SelectionState, 'hidden' | 'isolated'>,
): boolean {
  if (chain.some((c) => state.hidden.includes(c))) return false;
  if (!state.isolated) return true;
  const isolated = state.isolated;
  return chain.some((c) => isolated.includes(c));
}

/** Nhãn 3D chỉ hiện theo ngữ cảnh: đang hover, đang chọn, hoặc liên quan tới linh kiện đang chọn. */
export function shouldShowLabel(
  id: string,
  state: Pick<SelectionState, 'selectedId' | 'hoverId'>,
  selected?: Pick<ComponentInfo, 'relatedIds'> | null,
): boolean {
  if (id === state.hoverId || id === state.selectedId) return true;
  return !!selected?.relatedIds?.includes(id);
}
