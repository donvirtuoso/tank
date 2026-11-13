import { useMemo, useState } from 'react';
import {
  getAncestorIds,
  isComponentVisible,
  useSelectionStore,
  type ComponentInfo,
} from '../../stores/useSelectionStore';

export interface ComponentTreeProps {
  components: readonly ComponentInfo[];
  groupLabels?: Record<string, string>;
  /** Mặc định mở các node gốc. */
  defaultExpandedIds?: string[];
  className?: string;
}

/** Chuẩn hóa để tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function matchesQuery(component: ComponentInfo, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return [component.nameVi, component.nameEn, component.id].some((t) =>
    normalizeSearch(t).includes(q),
  );
}

interface TreeIndex {
  byId: Map<string, ComponentInfo>;
  children: Map<string | null, ComponentInfo[]>;
}

function buildIndex(components: readonly ComponentInfo[]): TreeIndex {
  const byId = new Map(components.map((c) => [c.id, c]));
  const children = new Map<string | null, ComponentInfo[]>();
  for (const c of components) {
    const parent = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(c);
    children.set(parent, list);
  }
  return { byId, children };
}

/** Cây linh kiện (panel trái): tìm kiếm, lọc theo nhóm, mở/thu gọn, chọn, ẩn/hiện. */
export function ComponentTree({
  components,
  groupLabels,
  defaultExpandedIds,
  className,
}: ComponentTreeProps) {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const hoverId = useSelectionStore((s) => s.hoverId);
  const hidden = useSelectionStore((s) => s.hidden);
  const isolated = useSelectionStore((s) => s.isolated);
  const select = useSelectionStore((s) => s.select);
  const setHover = useSelectionStore((s) => s.setHover);
  const toggleHidden = useSelectionStore((s) => s.toggleHidden);

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('');
  const index = useMemo(() => buildIndex(components), [components]);
  const groups = useMemo(
    () => Array.from(new Set(components.map((c) => c.group))).sort(),
    [components],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? (index.children.get(null) ?? []).map((c) => c.id)),
  );

  const filtering = query.trim() !== '' || group !== '';

  // Node khớp bộ lọc + tổ tiên của chúng (để giữ cấu trúc cây).
  const shownIds = useMemo(() => {
    if (!filtering) return null;
    const ids = new Set<string>();
    for (const c of components) {
      if ((group === '' || c.group === group) && matchesQuery(c, query)) {
        ids.add(c.id);
        getAncestorIds(c.id, index.byId).forEach((a) => ids.add(a));
      }
    }
    return ids;
  }, [components, filtering, group, query, index]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNodes = (parentId: string | null, depth: number) => {
    const nodes = (index.children.get(parentId) ?? []).filter(
      (c) => !shownIds || shownIds.has(c.id),
    );
    if (nodes.length === 0) return null;
    return (
      <ul role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? 'Cây linh kiện' : undefined}>
        {nodes.map((c) => {
          const hasChildren = (index.children.get(c.id) ?? []).length > 0;
          const isOpen = filtering || expanded.has(c.id);
          const visible = isComponentVisible(c.id, { hidden, isolated }, index.byId);
          const isSelected = selectedId === c.id;
          return (
            <li
              key={c.id}
              role="treeitem"
              aria-selected={isSelected}
              aria-expanded={hasChildren ? isOpen : undefined}
              data-hovered={hoverId === c.id || undefined}
              data-hidden={!visible || undefined}
            >
              <div style={{ paddingLeft: depth * 12, opacity: visible ? 1 : 0.5 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={`${isOpen ? 'Thu gọn' : 'Mở rộng'} ${c.nameVi}`}
                    onClick={() => toggleExpanded(c.id)}
                    disabled={filtering}
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                ) : (
                  <span aria-hidden="true">•</span>
                )}
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover(null)}
                  aria-current={isSelected || undefined}
                  title={c.nameEn}
                >
                  {c.nameVi}
                </button>
                <button
                  type="button"
                  aria-label={`${hidden.includes(c.id) ? 'Hiện' : 'Ẩn'} ${c.nameVi}`}
                  onClick={() => toggleHidden(c.id)}
                >
                  {hidden.includes(c.id) ? '◌' : '◉'}
                </button>
              </div>
              {hasChildren && isOpen && renderNodes(c.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const tree = renderNodes(null, 0);

  return (
    <nav className={className} aria-label="Danh sách linh kiện">
      <input
        type="search"
        placeholder="Tìm linh kiện…"
        aria-label="Tìm linh kiện"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select aria-label="Lọc theo nhóm" value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="">Tất cả nhóm</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {groupLabels?.[g] ?? g}
          </option>
        ))}
      </select>
      <div>
        <button type="button" onClick={() => setExpanded(new Set(components.map((c) => c.id)))}>
          Mở tất cả
        </button>
        <button type="button" onClick={() => setExpanded(new Set())}>
          Thu gọn tất cả
        </button>
      </div>
      {tree ?? <p>Không tìm thấy linh kiện phù hợp.</p>}
    </nav>
  );
}

export default ComponentTree;
