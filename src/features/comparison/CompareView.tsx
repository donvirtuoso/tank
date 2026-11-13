import { ContactShadows, Edges, OrbitControls, PerspectiveCamera, View } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Box3, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  buildCompareSummary,
  compareConfigurations,
  compareSummaryFileName,
  COMPARE_DISCLAIMER,
  formatSignedDelta,
  RATING_LABELS,
  renderCompareSummaryHtml,
  serializeCompareSummary,
  type CategoryDiff,
  type CompareSide,
  type CompareWarning,
  type VariantCount,
} from '@/domain/compare';
import type { Catalog, Locale, SavedDesign } from '@/domain/models/types';
import { getPresetPose, type CameraPose, type Vec3Tuple } from '@/scene/cameraPresets';
import { computeBoundingRadius, computeTankLayout, resolveVariant } from '@/scene/components/variant';
import { SceneEnvironment } from '@/scene/Environment';
import { Lighting } from '@/scene/Lighting';
import { ProceduralTank } from '@/scene/ProceduralTank';
import { SceneRegistry } from '@/scene/sceneRegistry';
import { useSavedDesignsStore } from '@/stores/useSavedDesignsStore';
import { useUiStore } from '@/stores/useUiStore';
import { toSceneVariant, useVehicleStore } from '@/stores/useVehicleStore';

// ---------------------------------------------------------------------------
// Đồng bộ camera (không phụ thuộc React → test được)
// ---------------------------------------------------------------------------

/**
 * Trạng thái camera dùng chung giữa hai viewer.
 *
 * - Bật sync: bên đang được người dùng thao tác ("leader", đặt ở sự kiện `start` của
 *   OrbitControls) ghi pose vào hub; bên kia đọc và áp dụng pose đó mỗi khung hình.
 * - Tắt sync: `publish` bị bỏ qua và `consume` luôn trả `null` → hai camera độc lập.
 */
export class CameraSyncHub {
  private enabledValue: boolean;
  private leaderSide: CompareSide | null = null;
  private poseValue: CameraPose | null = null;
  private sourceSide: CompareSide | null = null;
  private versionValue = 0;
  /** Bên cần gửi pose hiện tại ngay (khi vừa bật sync) để hai camera khớp nhau. */
  alignRequest: CompareSide | null = null;

  constructor(enabled = true, alignFrom: CompareSide = 'a') {
    this.enabledValue = enabled;
    if (enabled) this.requestAlign(alignFrom);
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get version(): number {
    return this.versionValue;
  }

  get leader(): CompareSide | null {
    return this.leaderSide;
  }

  get pose(): CameraPose | null {
    return this.poseValue;
  }

  setEnabled(enabled: boolean, alignFrom: CompareSide = 'a'): void {
    if (enabled === this.enabledValue) return;
    this.enabledValue = enabled;
    if (enabled) this.requestAlign(alignFrom);
    else this.alignRequest = null;
  }

  requestAlign(from: CompareSide): void {
    this.leaderSide = from;
    this.alignRequest = from;
  }

  /** Người dùng bắt đầu thao tác trên `side`. */
  begin(side: CompareSide): void {
    this.leaderSide = side;
  }

  /** Ghi pose của `side`; trả `true` nếu được chấp nhận. */
  publish(side: CompareSide, pose: CameraPose): boolean {
    if (!this.enabledValue) return false;
    if (this.leaderSide !== null && this.leaderSide !== side) return false;
    this.leaderSide = side;
    this.poseValue = { position: [...pose.position], target: [...pose.target] };
    this.sourceSide = side;
    this.versionValue += 1;
    if (this.alignRequest === side) this.alignRequest = null;
    return true;
  }

  /** Pose mới (do bên kia ghi) mà `side` chưa áp dụng; `null` nếu không có. */
  consume(side: CompareSide, lastVersion: number): CameraPose | null {
    if (!this.enabledValue || !this.poseValue || this.sourceSide === side) return null;
    if (this.versionValue <= lastVersion) return null;
    return { position: [...this.poseValue.position], target: [...this.poseValue.target] };
  }
}

// ---------------------------------------------------------------------------
// Văn bản giao diện
// ---------------------------------------------------------------------------

const COPY = {
  vi: {
    title: 'So sánh thiết kế',
    designA: 'Thiết kế A',
    designB: 'Thiết kế B',
    choose: 'Chọn thiết kế…',
    needTwo: 'Cần ít nhất hai thiết kế đã lưu để so sánh.',
    sync: 'Đồng bộ camera',
    highlight: 'Tô sáng chi tiết khác nhau',
    ratings: 'Chỉ số giả lập',
    delta: 'B − A',
    differences: 'Khác biệt chi tiết',
    noDifferences: 'Hai thiết kế giống nhau về chi tiết.',
    category: 'Nhóm',
    warnings: 'Cảnh báo tương thích',
    noWarnings: 'Không có cảnh báo.',
    shared: 'cả hai',
    exportJson: 'Xuất JSON',
    exportHtml: 'Xuất HTML',
    viewer: 'Khung nhìn 3D',
    none: '—',
    status: { same: 'Giống', changed: 'Khác', onlyA: 'Chỉ A', onlyB: 'Chỉ B' },
  },
  en: {
    title: 'Compare designs',
    designA: 'Design A',
    designB: 'Design B',
    choose: 'Choose a design…',
    needTwo: 'At least two saved designs are needed to compare.',
    sync: 'Sync cameras',
    highlight: 'Highlight differing parts',
    ratings: 'Simulated ratings',
    delta: 'B − A',
    differences: 'Part differences',
    noDifferences: 'Both designs use the same parts.',
    category: 'Category',
    warnings: 'Compatibility warnings',
    noWarnings: 'No warnings.',
    shared: 'both',
    exportJson: 'Export JSON',
    exportHtml: 'Export HTML',
    viewer: '3D viewer',
    none: '—',
    status: { same: 'Same', changed: 'Changed', onlyA: 'Only A', onlyB: 'Only B' },
  },
} as const;

// ---------------------------------------------------------------------------
// Tải file
// ---------------------------------------------------------------------------

export function downloadTextFile(content: string, fileName: string, mime: string, doc: Document = document): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// ---------------------------------------------------------------------------
// Cảnh 3D
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLOR = '#f59e0b';

/** Hộp bao bán trong suốt quanh các node khác nhau (vật liệu tank dùng chung nên không tô trực tiếp). */
function DiffHighlights({ registry, componentIds, revision }: { registry: SceneRegistry; componentIds: string[]; revision: string }) {
  const [boxes, setBoxes] = useState<{ id: string; center: Vec3Tuple; size: Vec3Tuple }[]>([]);
  const idsKey = componentIds.join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const measure = () => {
      const box = new Box3();
      const center = new Vector3();
      const size = new Vector3();
      const next: { id: string; center: Vec3Tuple; size: Vec3Tuple }[] = [];
      for (const id of ids) {
        const object = registry.get(id);
        if (!object || !object.visible) continue;
        object.updateWorldMatrix(true, true);
        box.setFromObject(object);
        if (box.isEmpty()) continue;
        box.getCenter(center);
        box.getSize(size).addScalar(0.06);
        next.push({ id, center: center.toArray() as Vec3Tuple, size: size.toArray() as Vec3Tuple });
      }
      setBoxes(next);
    };
    // Đo sau khi mô hình đã gắn vào cảnh; đo lại khi registry thay đổi.
    let frame = requestAnimationFrame(measure);
    const unsubscribe = registry.subscribe(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [registry, idsKey, revision]);

  return (
    <group name="DiffHighlights">
      {boxes.map((b) => (
        <mesh key={b.id} position={b.center} scale={b.size} renderOrder={10} raycast={() => null}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={HIGHLIGHT_COLOR} transparent opacity={0.16} depthWrite={false} />
          <Edges color={HIGHLIGHT_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

/** OrbitControls gắn với phần tử DOM của từng viewer + cầu nối tới {@link CameraSyncHub}. */
function SyncedControls({
  side,
  hub,
  domElement,
  target,
  radius,
}: {
  side: CompareSide;
  hub: CameraSyncHub;
  domElement: HTMLElement;
  target: Vec3Tuple;
  radius: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const applied = useRef(0);
  const applying = useRef(false);
  const targetKey = target.join(',');

  // Khung hình ban đầu / khi đổi thiết kế.
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return;
    const pose = getPresetPose('reset', targetKey.split(',').map(Number) as Vec3Tuple, radius);
    camera.position.set(...pose.position);
    ctl.target.set(...pose.target);
    ctl.update();
    // Bên đang theo sẽ áp lại pose dùng chung ở khung hình kế tiếp.
    applied.current = -1;
  }, [camera, targetKey, radius]);

  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return;
    const readPose = (): CameraPose => ({
      position: camera.position.toArray() as Vec3Tuple,
      target: ctl.target.toArray() as Vec3Tuple,
    });
    const onStart = () => hub.begin(side);
    const onChange = () => {
      if (!applying.current) hub.publish(side, readPose());
    };
    ctl.addEventListener('start', onStart);
    ctl.addEventListener('change', onChange);
    return () => {
      ctl.removeEventListener('start', onStart);
      ctl.removeEventListener('change', onChange);
    };
  }, [camera, hub, side]);

  useFrame(() => {
    const ctl = controls.current;
    if (!ctl) return;
    if (hub.alignRequest === side) {
      hub.publish(side, { position: camera.position.toArray() as Vec3Tuple, target: ctl.target.toArray() as Vec3Tuple });
    }
    const pose = hub.consume(side, applied.current);
    if (!pose) return;
    applying.current = true;
    camera.position.set(...pose.position);
    ctl.target.set(...pose.target);
    ctl.update();
    applying.current = false;
    applied.current = hub.version;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      domElement={domElement}
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning
      minDistance={radius * 0.8}
      maxDistance={radius * 6}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}

function ViewerScene({
  side,
  design,
  hub,
  domElement,
  highlightIds,
}: {
  side: CompareSide;
  design: SavedDesign;
  hub: CameraSyncHub;
  domElement: HTMLElement;
  highlightIds: string[];
}) {
  const registry = useMemo(() => new SceneRegistry(), []);
  const variant = useMemo(() => toSceneVariant(design.configuration), [design.configuration]);
  const variantKey = JSON.stringify(variant);
  const { target, radius } = useMemo(() => {
    const resolved = resolveVariant(variant);
    const layout = computeTankLayout(resolved);
    return { target: [0, layout.hull.roofY * 0.6, 0] as Vec3Tuple, radius: computeBoundingRadius(resolved) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey]);

  return (
    <>
      <PerspectiveCamera makeDefault fov={40} near={0.1} far={500} position={[10, 6, 12]} />
      <Suspense fallback={null}>
        <SceneEnvironment preset="daylight" />
      </Suspense>
      <Lighting environment="daylight" shadowExtent={Math.max(5, radius * 1.2)} />
      <ProceduralTank variant={variant} registry={registry} />
      <DiffHighlights registry={registry} componentIds={highlightIds} revision={variantKey} />
      <ContactShadows position={[0, 0.005, 0]} scale={radius * 3.2} far={3} blur={2.2} opacity={0.55} resolution={256} />
      <mesh name="Floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#8f8a78" roughness={0.95} metalness={0} />
      </mesh>
      <SyncedControls side={side} hub={hub} domElement={domElement} target={target} radius={radius} />
    </>
  );
}

/** Ô viewer: phần tử DOM theo dõi bởi drei `<View>`; nội dung 3D render qua `<View.Port>` của Canvas chung. */
function ViewerPane({ label, children }: { label: string; children: (element: HTMLElement) => ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setElement}
      role="region"
      aria-label={label}
      className="relative min-h-0 flex-1 overflow-hidden rounded border border-gunmetal-700"
    >
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-gunmetal-900/80 px-2 py-0.5 text-xs">
        {label}
      </span>
      {element && <View className="absolute inset-0">{children(element)}</View>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng khác biệt
// ---------------------------------------------------------------------------

const variantList = (list: VariantCount[], locale: Locale, none: string) =>
  list.length === 0 ? none : list.map((v) => (v.count > 1 ? `${v.name[locale]} ×${v.count}` : v.name[locale])).join(', ');

function DiffTable({ rows, locale }: { rows: CategoryDiff[]; locale: Locale }) {
  const t = COPY[locale];
  if (rows.length === 0) return <p className="text-xs text-gunmetal-400">{t.noDifferences}</p>;
  return (
    <table className="w-full text-xs" data-testid="compare-diff-table">
      <thead>
        <tr className="text-left text-gunmetal-400">
          <th className="py-1 pr-2">{t.category}</th>
          <th className="py-1 pr-2">A</th>
          <th className="py-1">B</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.categoryId} data-testid={`diff-${d.categoryId}`} data-status={d.status} className="border-t border-gunmetal-700">
            <td className="py-1 pr-2">
              {d.name[locale]} <span className="text-[10px] text-amber-400">({t.status[d.status]})</span>
            </td>
            <td className="py-1 pr-2">{variantList(d.a, locale, t.none)}</td>
            <td className="py-1">{variantList(d.b, locale, t.none)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WarningList({ warnings, names, locale }: { warnings: CompareWarning[]; names: Record<CompareSide, string>; locale: Locale }) {
  const t = COPY[locale];
  if (warnings.length === 0) return <p className="text-xs text-gunmetal-400">{t.noWarnings}</p>;
  return (
    <ul className="flex flex-col gap-1 text-xs" data-testid="compare-warnings">
      {warnings.map((w, i) => (
        <li key={`${w.side}-${i}`} className="text-amber-300">
          <strong>{names[w.side]}</strong>
          {w.shared && <span className="text-gunmetal-400"> ({t.shared})</span>}: {w.message[locale]}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// CompareView
// ---------------------------------------------------------------------------

export interface CompareViewProps {
  /** Mặc định lấy từ `useSavedDesignsStore`. */
  designs?: SavedDesign[];
  /** Mặc định catalog của `useVehicleStore`. */
  catalog?: Catalog;
  initialAId?: string;
  initialBId?: string;
  className?: string;
}

/**
 * Chế độ So sánh: chọn hai thiết kế đã lưu, hiển thị song song trong MỘT Canvas với hai
 * drei `<View>` (tránh vượt giới hạn số WebGL context), đồng bộ camera tuỳ chọn, tô sáng
 * nhóm chi tiết khác nhau, bảng khác biệt + delta chỉ số và xuất tóm tắt JSON/HTML.
 */
export function CompareView({ designs: designsProp, catalog: catalogProp, initialAId, initialBId, className }: CompareViewProps) {
  const locale = useUiStore((s) => s.locale);
  const t = COPY[locale];
  const storeDesigns = useSavedDesignsStore((s) => s.designs);
  const storeCatalog = useVehicleStore((s) => s.catalog);
  const designs = designsProp ?? storeDesigns;
  const catalog = catalogProp ?? storeCatalog;

  const [aId, setAId] = useState<string | null>(initialAId ?? designs[0]?.id ?? null);
  const [bId, setBId] = useState<string | null>(initialBId ?? designs[1]?.id ?? null);
  const designA = designs.find((d) => d.id === aId) ?? null;
  const designB = designs.find((d) => d.id === bId) ?? null;

  const [sync, setSync] = useState(true);
  const [highlight, setHighlight] = useState(true);
  const hub = useMemo(() => new CameraSyncHub(true), []);
  useEffect(() => hub.setEnabled(sync, 'a'), [hub, sync]);

  const comparison = useMemo(
    () => (designA && designB ? compareConfigurations(designA.configuration, designB.configuration, catalog) : null),
    [designA, designB, catalog],
  );
  const highlightIds = highlight && comparison ? comparison.highlightComponentIds : [];

  const containerRef = useRef<HTMLDivElement>(null);

  const exportSummary = (format: 'json' | 'html') => {
    if (!designA || !designB) return;
    const summary = buildCompareSummary(designA, designB, catalog);
    const fileName = compareSummaryFileName(summary, format);
    if (format === 'json') downloadTextFile(serializeCompareSummary(summary), fileName, 'application/json');
    else downloadTextFile(renderCompareSummaryHtml(summary, locale), fileName, 'text/html');
  };

  const select = (label: string, value: string | null, onChange: (id: string) => void, testId: string) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-gunmetal-400">{label}</span>
      <select
        data-testid={testId}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gunmetal-700 bg-gunmetal-900 px-2 py-1"
      >
        <option value="" disabled>
          {t.choose}
        </option>
        {designs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (designs.length < 2) {
    return (
      <section aria-label={t.title} className={className}>
        <p className="p-4 text-sm text-gunmetal-400" data-testid="compare-empty">
          {t.needTwo}
        </p>
      </section>
    );
  }

  const names: Record<CompareSide, string> = { a: designA?.name ?? 'A', b: designB?.name ?? 'B' };

  return (
    <section aria-label={t.title} className={`flex h-full min-h-0 flex-col gap-2 p-2 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        {select(t.designA, aId, setAId, 'compare-select-a')}
        {select(t.designB, bId, setBId, 'compare-select-b')}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} data-testid="compare-sync" />
          {t.sync}
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
            data-testid="compare-highlight"
          />
          {t.highlight}
        </label>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!comparison}
          onClick={() => exportSummary('json')}
          className="rounded border border-gunmetal-700 px-2 py-1 text-xs disabled:opacity-50"
        >
          {t.exportJson}
        </button>
        <button
          type="button"
          disabled={!comparison}
          onClick={() => exportSummary('html')}
          className="rounded border border-gunmetal-700 px-2 py-1 text-xs disabled:opacity-50"
        >
          {t.exportHtml}
        </button>
      </div>

      <div ref={containerRef} className="relative flex min-h-0 flex-1 gap-2">
        {designA && (
          <ViewerPane key={`a-${designA.id}`} label={`A · ${designA.name}`}>
            {(el) => <ViewerScene side="a" design={designA} hub={hub} domElement={el} highlightIds={highlightIds} />}
          </ViewerPane>
        )}
        {designB && (
          <ViewerPane key={`b-${designB.id}`} label={`B · ${designB.name}`}>
            {(el) => <ViewerScene side="b" design={designB} hub={hub} domElement={el} highlightIds={highlightIds} />}
          </ViewerPane>
        )}
        {/* Một Canvas (một WebGL context) phủ cả hai ô; mỗi <View> cắt vùng vẽ theo ô DOM của nó. */}
        <Canvas
          shadows
          dpr={[1, 2]}
          eventSource={containerRef as RefObject<HTMLElement>}
          eventPrefix="client"
          aria-label={t.viewer}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <View.Port />
        </Canvas>
      </div>

      {comparison && (
        <div className="grid max-h-[40%] grid-cols-3 gap-3 overflow-auto rounded border border-gunmetal-700 p-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t.ratings}</h3>
            <table className="w-full text-xs" data-testid="compare-ratings">
              <thead>
                <tr className="text-left text-gunmetal-400">
                  <th />
                  <th>A</th>
                  <th>B</th>
                  <th>{t.delta}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.ratings.map((r) => (
                  <tr key={r.key} data-testid={`rating-${r.key}`}>
                    <td>{RATING_LABELS[r.key][locale]}</td>
                    <td className="font-mono">{r.a}</td>
                    <td className="font-mono">{r.b}</td>
                    <td
                      data-testid={`rating-delta-${r.key}`}
                      className={`font-mono ${r.delta > 0 ? 'text-green-400' : r.delta < 0 ? 'text-red-400' : 'text-gunmetal-400'}`}
                    >
                      {formatSignedDelta(r.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p role="note" className="mt-1 text-[11px] italic text-gunmetal-400">
              {COMPARE_DISCLAIMER[locale]}
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t.differences}</h3>
            <DiffTable rows={comparison.differences} locale={locale} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t.warnings}</h3>
            <WarningList warnings={[...comparison.warnings.a, ...comparison.warnings.b]} names={names} locale={locale} />
          </div>
        </div>
      )}
    </section>
  );
}

export default CompareView;
