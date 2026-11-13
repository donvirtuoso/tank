import { useMemo } from 'react';
import {
  isComponentVisible,
  useSelectionStore,
  type ComponentInfo,
} from '../../stores/useSelectionStore';

export interface ComponentInfoPanelProps {
  components: readonly ComponentInfo[];
  /** Nhãn hiển thị cho mã nhóm, vd { turret: 'Tháp pháo' }. */
  groupLabels?: Record<string, string>;
  className?: string;
}

/** Panel phải: tên Việt/Anh, thuộc tính, nội dung giáo dục, linh kiện liên quan và các thao tác xem. */
export function ComponentInfoPanel({ components, groupLabels, className }: ComponentInfoPanelProps) {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const hidden = useSelectionStore((s) => s.hidden);
  const isolated = useSelectionStore((s) => s.isolated);
  const select = useSelectionStore((s) => s.select);
  const setHover = useSelectionStore((s) => s.setHover);
  const hide = useSelectionStore((s) => s.hide);
  const show = useSelectionStore((s) => s.show);
  const isolate = useSelectionStore((s) => s.isolate);
  const showRelated = useSelectionStore((s) => s.showRelated);
  const showAll = useSelectionStore((s) => s.showAll);
  const requestFocus = useSelectionStore((s) => s.requestFocus);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const hasViewFilter = hidden.length > 0 || isolated !== null;

  const resetButton = hasViewFilter ? (
    <button type="button" onClick={showAll}>
      Hiện tất cả
    </button>
  ) : null;

  if (!selected) {
    return (
      <aside className={className} aria-label="Thông tin linh kiện">
        <p>Chọn một linh kiện trên mô hình hoặc trong cây để xem thông tin.</p>
        {resetButton}
      </aside>
    );
  }

  const visible = isComponentVisible(selected.id, { hidden, isolated }, byId);
  const related = (selected.relatedIds ?? [])
    .map((id) => byId.get(id))
    .filter((c): c is ComponentInfo => !!c);
  const properties = Object.entries(selected.properties ?? {});

  return (
    <aside className={className} aria-label="Thông tin linh kiện">
      <header>
        <h2 data-testid="component-name-vi">{selected.nameVi}</h2>
        <p data-testid="component-name-en" lang="en">
          {selected.nameEn}
        </p>
        <p data-testid="component-group">{groupLabels?.[selected.group] ?? selected.group}</p>
      </header>

      <div role="toolbar" aria-label="Thao tác xem">
        <button type="button" onClick={() => requestFocus(selected.id)} title="Focus (F)">
          Focus
        </button>
        {visible ? (
          <button type="button" onClick={() => hide(selected.id)}>
            Ẩn
          </button>
        ) : (
          <button type="button" onClick={() => show(selected.id)}>
            Hiện
          </button>
        )}
        <button type="button" onClick={() => isolate(selected.id)}>
          Cô lập
        </button>
        <button type="button" onClick={() => showRelated(selected)} disabled={related.length === 0}>
          Hiện liên quan
        </button>
        {resetButton}
        <button type="button" onClick={clearSelection} title="Bỏ chọn (Esc)">
          Bỏ chọn
        </button>
      </div>

      {properties.length > 0 && (
        <section aria-label="Thuộc tính">
          <h3>Thuộc tính</h3>
          <dl>
            {properties.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {selected.education && (
        <section aria-label="Kiến thức">
          <h3>Kiến thức</h3>
          <p data-testid="component-education">{selected.education}</p>
        </section>
      )}

      {related.length > 0 && (
        <section aria-label="Linh kiện liên quan">
          <h3>Linh kiện liên quan</h3>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r.id)}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  {r.nameVi}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

export default ComponentInfoPanel;
