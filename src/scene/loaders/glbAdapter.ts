/**
 * GLB/glTF adapter.
 *
 * - Kiểm tra trước (preflight) bằng MỘT lần tải: tồn tại, giới hạn kích thước (dừng đọc ngay khi
 *   vượt), header GLB, cấu trúc node (cây hợp lệ, giới hạn số node/độ sâu), không tham chiếu file ngoài.
 * - Chỉ sau khi preflight đạt mới giao buffer đã tải cho `useGLTF` (drei) qua object URL — file
 *   không bị tải hai lần, và file vượt giới hạn không bao giờ tới GLTFLoader.
 * - Duyệt scene graph, ánh xạ tên node -> componentId theo `src/data/glbNodeMapping.json`.
 * - Liệt kê node chưa ánh xạ (dùng cho panel debug `GlbDebugPanel`).
 * - Bọc node trong Group wrapper để đặt pivot theo cấu hình.
 * - Lỗi bất kỳ (thiếu file, file hỏng, quá lớn, lỗi parse của three) -> quay về mô hình procedural
 *   + thông báo; handle đã phát cho consumer bị thu hồi (`onHandles({})`).
 *
 * Phần logic thuần (parse GLB, ánh xạ, validate mapping) không phụ thuộc DOM/WebGL
 * để có thể unit test trong Node.
 *
 * Phụ thuộc: cần `react`, `three`, `@react-three/fiber`, `@react-three/drei` và tsconfig bật
 * `resolveJsonModule` — phần khởi tạo dự án (package.json, vitest) thuộc task setup, chưa có trong repo.
 */
import {
  Component,
  Suspense,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Group, Object3D, PropertyBinding, Vector3 } from 'three';
import { Html, useGLTF } from '@react-three/drei';
import defaultMappingJson from '../../data/glbNodeMapping.json';

/* ------------------------------------------------------------------ */
/* Kiểu dữ liệu                                                        */
/* ------------------------------------------------------------------ */

export type Vec3Tuple = [number, number, number];

export interface GlbNodeMapping {
  version: number;
  modelUrl: string;
  maxFileSizeBytes: number;
  /** Tên node trong GLB -> componentId. (Object không prototype.) */
  nodes: Record<string, string>;
  /** componentId -> pivot (toạ độ trong không gian local của node cha). (Object không prototype.) */
  pivots: Record<string, Vec3Tuple>;
}

/** Bất kỳ cây nào có `name` + `children` (THREE.Object3D thoả mãn). */
export interface NodeLike {
  name: string;
  children: readonly NodeLike[];
}

export interface MappedNode<T extends NodeLike = NodeLike> {
  name: string;
  path: string;
  componentId: string;
  object: T;
}

export interface UnmappedNode {
  name: string;
  path: string;
  /** componentId của tổ tiên gần nhất đã ánh xạ (node con "đi theo" component đó). */
  inheritedComponentId?: string;
}

export interface MappingReport<T extends NodeLike = NodeLike> {
  mapped: MappedNode<T>[];
  unmapped: UnmappedNode[];
  /** componentId có trong mapping nhưng không tìm thấy node nào. */
  missingComponents: string[];
  /** componentId được ánh xạ bởi nhiều hơn một node. */
  duplicateComponents: string[];
}

export type GlbLoadStatus =
  | { state: 'checking' }
  | { state: 'loading' }
  | { state: 'loaded'; report: MappingReport<Object3D> }
  | { state: 'fallback'; reason: string };

export type GlbHandles = Readonly<Record<string, Object3D>>;

export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
/** Giới hạn cấu trúc để file nhỏ nhưng độc hại không làm treo main thread. */
export const MAX_GLB_NODES = 10_000;
export const MAX_GLB_DEPTH = 128;

/** Handle rỗng dùng chung — phát cho consumer khi không có GLB hợp lệ trong scene. */
export const EMPTY_HANDLES: GlbHandles = Object.freeze(Object.create(null) as Record<string, Object3D>);

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function isVec3(v: unknown): v is Vec3Tuple {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Validate JSON mapping; ném Error với thông điệp rõ ràng nếu sai cấu trúc. */
export function parseNodeMapping(raw: unknown): GlbNodeMapping {
  if (!raw || typeof raw !== 'object') throw new Error('Mapping GLB không hợp lệ: không phải object');
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number') throw new Error('Mapping GLB thiếu "version"');
  if (typeof r.modelUrl !== 'string' || !r.modelUrl) throw new Error('Mapping GLB thiếu "modelUrl"');
  const max = r.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  if (typeof max !== 'number' || !(max > 0)) throw new Error('"maxFileSizeBytes" phải là số dương');
  if (!r.nodes || typeof r.nodes !== 'object') throw new Error('Mapping GLB thiếu "nodes"');
  // Object không prototype: khoá như "__proto__" được giữ nguyên thay vì bị nuốt mất.
  const nodes = Object.create(null) as Record<string, string>;
  for (const [k, v] of Object.entries(r.nodes as Record<string, unknown>)) {
    if (typeof v !== 'string' || !v) throw new Error(`componentId của node "${k}" phải là chuỗi khác rỗng`);
    nodes[k] = v;
  }
  const pivots = Object.create(null) as Record<string, Vec3Tuple>;
  for (const [k, v] of Object.entries((r.pivots ?? {}) as Record<string, unknown>)) {
    if (!isVec3(v)) throw new Error(`Pivot của "${k}" phải là [x, y, z]`);
    pivots[k] = [v[0], v[1], v[2]];
  }
  return { version: r.version, modelUrl: r.modelUrl, maxFileSizeBytes: max, nodes, pivots };
}

export const defaultNodeMapping: GlbNodeMapping = parseNodeMapping(defaultMappingJson);

/**
 * Tìm componentId cho một tên node: khớp chính xác trước, sau đó khớp không phân biệt
 * hoa/thường. (GLTFLoader của three đã sanitize tên: khoảng trắng -> "_", bỏ ký tự `.:/[]`.)
 */
export function resolveComponentId(name: string, nodes: Record<string, string>): string | undefined {
  if (!name) return undefined;
  if (hasOwn(nodes, name)) return nodes[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(nodes)) {
    if (key.toLowerCase() === lower) return nodes[key];
  }
  return undefined;
}

/**
 * Duyệt scene graph (DFS). Node gốc (`root`) không được ánh xạ/liệt kê — nó là container
 * do loader tạo ra. Node không tên bị bỏ qua khỏi danh sách unmapped nhưng con của nó vẫn được duyệt.
 */
export function mapSceneGraph<T extends NodeLike>(
  root: T,
  mapping: Pick<GlbNodeMapping, 'nodes'>,
): MappingReport<T> {
  const mapped: MappedNode<T>[] = [];
  const unmapped: UnmappedNode[] = [];
  const seen = new Map<string, number>();

  const visit = (node: T, parentPath: string, inherited: string | undefined) => {
    const path = parentPath ? `${parentPath}/${node.name || '?'}` : node.name || '?';
    const componentId = resolveComponentId(node.name, mapping.nodes);
    if (componentId) {
      mapped.push({ name: node.name, path, componentId, object: node });
      seen.set(componentId, (seen.get(componentId) ?? 0) + 1);
    } else if (node.name) {
      unmapped.push(inherited ? { name: node.name, path, inheritedComponentId: inherited } : { name: node.name, path });
    }
    for (const child of node.children) visit(child as T, path, componentId ?? inherited);
  };
  for (const child of root.children) visit(child as T, '', undefined);

  const expected = new Set(Object.values(mapping.nodes));
  const missingComponents = [...expected].filter((id) => !seen.has(id)).sort();
  const duplicateComponents = [...seen].filter(([, n]) => n > 1).map(([id]) => id).sort();
  return { mapped, unmapped, missingComponents, duplicateComponents };
}

/* ------------------------------------------------------------------ */
/* GLB binary (preflight)                                              */
/* ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export class GlbFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlbFormatError';
  }
}

export interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { name?: string; children?: number[] }[];
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
  extensionsRequired?: string[];
}

/** Đọc header + chunk JSON của GLB 2.0. Ném `GlbFormatError` nếu file hỏng. */
export function readGlbJson(buffer: ArrayBuffer): GltfJson {
  if (buffer.byteLength < 20) throw new GlbFormatError('File GLB quá ngắn');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new GlbFormatError('Sai magic header (không phải GLB)');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new GlbFormatError(`Chỉ hỗ trợ glTF 2.0 (nhận được ${version})`);
  const total = view.getUint32(8, true);
  if (total > buffer.byteLength) throw new GlbFormatError('Độ dài khai báo lớn hơn kích thước file');
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_JSON) throw new GlbFormatError('Chunk đầu tiên không phải JSON');
  if (20 + chunkLength > total) throw new GlbFormatError('Chunk JSON vượt quá độ dài file');
  const text = new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength));
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GlbFormatError('Chunk JSON không parse được');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new GlbFormatError('Chunk JSON không phải object');
  return json as GltfJson;
}

/** Tên node như GLTFLoader của three sẽ đặt (chưa gồm hậu tố `_1`, `_2`… cho tên trùng). */
export function sanitizeGlbNodeName(name: string | undefined): string {
  return PropertyBinding.sanitizeNodeName(name ?? '');
}

/**
 * Dựng cây node (chỉ tên + con) từ chunk JSON — dùng cho preflight và test, không cần WebGL.
 *
 * glTF yêu cầu node hierarchy là cây rời (mỗi node có tối đa một cha, không dùng lại giữa các
 * scene root). Hàm từ chối vòng lặp, node dùng lại (DAG — có thể nổ thành 2^n node), quá
 * `MAX_GLB_NODES` node hoặc sâu quá `MAX_GLB_DEPTH`.
 *
 * Tên được sanitize giống GLTFLoader; riêng hậu tố khử trùng tên (`_1`, `_2`…) phụ thuộc thứ tự
 * nạp nội bộ của loader nên KHÔNG tái hiện — báo cáo chính thức lấy từ scene thật sau khi nạp.
 */
export function buildGltfNodeTree(json: GltfJson): NodeLike {
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  if (nodes.length > MAX_GLB_NODES) {
    throw new GlbFormatError(`Quá nhiều node (${nodes.length} > ${MAX_GLB_NODES})`);
  }
  const scene = json.scenes?.[json.scene ?? 0];
  const used = new Set<number>();
  const stack = new Set<number>();

  const build = (index: unknown, depth: number): NodeLike => {
    if (typeof index !== 'number' || !Number.isInteger(index) || !nodes[index]) {
      throw new GlbFormatError(`Node index ${String(index)} không tồn tại`);
    }
    if (stack.has(index)) throw new GlbFormatError(`Phát hiện vòng lặp tại node ${index}`);
    if (used.has(index)) throw new GlbFormatError(`Node ${index} được dùng lại dưới nhiều cha (không phải cây)`);
    if (depth > MAX_GLB_DEPTH) throw new GlbFormatError(`Cây node sâu quá ${MAX_GLB_DEPTH} cấp`);
    used.add(index);
    stack.add(index);
    const def = nodes[index];
    const childIndices = Array.isArray(def.children) ? def.children : [];
    const children = childIndices.map((c) => build(c, depth + 1));
    stack.delete(index);
    return { name: sanitizeGlbNodeName(def.name), children };
  };
  const rootList = scene?.nodes;
  const roots: unknown[] = Array.isArray(rootList) ? rootList : [];
  return { name: 'Scene', children: roots.map((i) => build(i, 1)) };
}

/** Đọc GLB và dựng cây node (xem `buildGltfNodeTree`). */
export function parseGlbSceneGraph(buffer: ArrayBuffer): NodeLike {
  return buildGltfNodeTree(readGlbJson(buffer));
}

/**
 * GLB được nạp qua object URL nên không phân giải được đường dẫn tương đối: mọi buffer/ảnh
 * phải nhúng trong file. Draco cũng bị tắt (không tải decoder từ CDN).
 */
export function assertSelfContainedGlb(json: GltfJson): void {
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].find(
    (r) => r && typeof r.uri === 'string' && !r.uri.startsWith('data:'),
  );
  if (external) {
    throw new GlbFormatError(`GLB tham chiếu file ngoài "${external.uri}" — hãy export glTF Binary nhúng toàn bộ dữ liệu`);
  }
  if (json.extensionsRequired?.includes('KHR_draco_mesh_compression')) {
    throw new GlbFormatError('GLB dùng nén Draco — chưa hỗ trợ, hãy export không nén');
  }
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  /** Nếu có, được đọc theo luồng để dừng ngay khi vượt giới hạn kích thước. */
  body?: { getReader(): ReadableStreamDefaultReader<Uint8Array> } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface PreflightResult {
  /** Nội dung file đã tải — được tái sử dụng để nạp, không tải lại. */
  buffer: ArrayBuffer;
  /** Cây node đọc từ chunk JSON (tên đã sanitize như GLTFLoader). */
  tree: NodeLike;
}

function tooLarge(url: string, size: number, maxBytes: number): Error {
  return new Error(`File ${url} quá lớn (${size} byte > giới hạn ${maxBytes} byte)`);
}

async function readBodyWithLimit(res: FetchResponseLike, url: string, maxBytes: number): Promise<ArrayBuffer> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw tooLarge(url, buffer.byteLength, maxBytes);
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw tooLarge(url, size, maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer as ArrayBuffer;
}

/**
 * Tải file một lần và kiểm tra: tồn tại, không vượt giới hạn kích thước (từ chối theo
 * content-length trước khi đọc body, hoặc dừng đọc ngay khi vượt), header GLB hợp lệ,
 * cây node hợp lệ, không phụ thuộc file ngoài.
 */
export async function preflightGlb(
  url: string,
  maxBytes: number,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  signal?: AbortSignal,
): Promise<PreflightResult> {
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`);
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body?.getReader?.().cancel().catch(() => undefined);
    throw tooLarge(url, declared, maxBytes);
  }
  const buffer = await readBodyWithLimit(res, url, maxBytes);
  const json = readGlbJson(buffer);
  const tree = buildGltfNodeTree(json);
  assertSelfContainedGlb(json);
  return { buffer, tree };
}

/* ------------------------------------------------------------------ */
/* Pivot wrapper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Bọc mỗi node có pivot cấu hình trong một `Group` đặt tại pivot (không gian local của node cha),
 * rồi bù vị trí node để hình học đứng yên. Xoay Group = xoay quanh pivot.
 * Trả về componentId -> Object3D điều khiển (Group pivot nếu có, ngược lại chính node).
 */
export function applyPivots(
  mapped: readonly MappedNode<Object3D>[],
  pivots: Record<string, Vec3Tuple>,
): Record<string, Object3D> {
  const handles = Object.create(null) as Record<string, Object3D>;
  for (const entry of mapped) {
    const node = entry.object;
    if (hasOwn(handles, entry.componentId)) continue; // node trùng componentId: chỉ giữ node đầu tiên
    const pivot = hasOwn(pivots, entry.componentId) ? pivots[entry.componentId] : undefined;
    if (!pivot || !node.parent) {
      handles[entry.componentId] = node;
      continue;
    }
    const parent = node.parent;
    const wrapper = new Group();
    wrapper.name = `${entry.componentId}__pivot`;
    wrapper.userData.componentId = entry.componentId;
    const p = new Vector3(...pivot);
    wrapper.position.copy(p);
    const index = parent.children.indexOf(node);
    parent.remove(node);
    wrapper.add(node);
    node.position.sub(p);
    parent.add(wrapper);
    // giữ thứ tự con ban đầu
    parent.children.splice(parent.children.indexOf(wrapper), 1);
    parent.children.splice(index, 0, wrapper);
    node.userData.componentId = entry.componentId;
    handles[entry.componentId] = wrapper;
  }
  return handles;
}

/* ------------------------------------------------------------------ */
/* React components                                                    */
/* ------------------------------------------------------------------ */

interface BoundaryProps {
  fallback: ReactNode;
  onError: (error: Error) => void;
  children?: ReactNode;
}

class GlbErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface LoadedModelProps {
  url: string;
  mapping: GlbNodeMapping;
  onLoaded: (url: string, report: MappingReport<Object3D>, handles: GlbHandles) => void;
}

function LoadedGlbModel({ url, mapping, onLoaded }: LoadedModelProps) {
  // Draco tắt: không tải decoder từ CDN (file Draco đã bị preflight từ chối).
  const { scene } = useGLTF(url, false);
  // Clone: scene của useGLTF được cache dùng chung, không được sửa trực tiếp.
  const result = useMemo(() => {
    const root = scene.clone(true);
    const report = mapSceneGraph<Object3D>(root, mapping);
    const handles = applyPivots(report.mapped, mapping.pivots);
    return { root, report, handles };
  }, [scene, mapping]);

  useEffect(() => {
    onLoaded(url, result.report, result.handles);
  }, [url, result, onLoaded]);

  return createElement('primitive', { object: result.root });
}

export const FALLBACK_NOTICE_PREFIX = 'Không nạp được mô hình GLB — dùng mô hình procedural.';

function FallbackNotice({ message }: { message: string }) {
  return createElement(
    Html,
    { center: true, position: [0, 2.5, 0] },
    createElement(
      'div',
      {
        role: 'status',
        style: {
          background: 'rgba(0,0,0,0.7)',
          color: '#ffd166',
          padding: '4px 8px',
          borderRadius: 4,
          font: '12px sans-serif',
          whiteSpace: 'nowrap',
        },
      },
      `${FALLBACK_NOTICE_PREFIX} (${message})`,
    ),
  );
}

export interface GlbTankModelProps {
  /** Mô hình procedural dùng khi GLB thiếu/lỗi (ví dụ `ProceduralTank`). */
  fallback: ComponentType;
  url?: string;
  mapping?: GlbNodeMapping;
  maxFileSizeBytes?: number;
  /** Hiện thông báo fallback ngay trong scene (drei `<Html>`). Mặc định: true. */
  showNotice?: boolean;
  onStatusChange?: (status: GlbLoadStatus) => void;
  /**
   * Handle điều khiển (componentId -> Object3D). Chỉ phát khi GLB đã nạp xong; khi chuyển sang
   * fallback hoặc unmount sẽ phát `EMPTY_HANDLES` để consumer bỏ tham chiếu cũ.
   */
  onHandles?: (handles: GlbHandles) => void;
  fetchImpl?: FetchLike;
}

type InternalState =
  | { state: 'checking' }
  | { state: 'loading'; objectUrl: string }
  | { state: 'loaded'; objectUrl: string; report: MappingReport<Object3D>; handles: GlbHandles }
  | { state: 'fallback'; reason: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Component dùng bên trong `<Canvas>`. Luôn render được thứ gì đó: GLB hoặc fallback procedural. */
export function GlbTankModel({
  fallback: Fallback,
  url,
  mapping = defaultNodeMapping,
  maxFileSizeBytes,
  showNotice = true,
  onStatusChange,
  onHandles,
  fetchImpl,
}: GlbTankModelProps) {
  const modelUrl = url ?? mapping.modelUrl;
  const maxBytes = maxFileSizeBytes ?? mapping.maxFileSizeBytes;
  const [internal, setInternal] = useState<InternalState>({ state: 'checking' });

  const status = useMemo<GlbLoadStatus>(() => {
    switch (internal.state) {
      case 'checking':
        return { state: 'checking' };
      case 'loading':
        return { state: 'loading' };
      case 'loaded':
        return { state: 'loaded', report: internal.report };
      case 'fallback':
        return { state: 'fallback', reason: internal.reason };
    }
  }, [internal]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Phát handle: chỉ khi 'loaded'; mọi trạng thái khác (và unmount) -> EMPTY_HANDLES.
  const onHandlesRef = useRef(onHandles);
  onHandlesRef.current = onHandles;
  const emittedHandles = useRef<GlbHandles>(EMPTY_HANDLES);
  useEffect(() => {
    const next = internal.state === 'loaded' ? internal.handles : EMPTY_HANDLES;
    if (next !== emittedHandles.current) {
      emittedHandles.current = next;
      onHandlesRef.current?.(next);
    }
  }, [internal]);
  useEffect(
    () => () => {
      if (emittedHandles.current !== EMPTY_HANDLES) {
        emittedHandles.current = EMPTY_HANDLES;
        onHandlesRef.current?.(EMPTY_HANDLES);
      }
    },
    [],
  );

  // Preflight (tải 1 lần) -> object URL từ chính buffer đó -> useGLTF.
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setInternal({ state: 'checking' });
    preflightGlb(modelUrl, maxBytes, fetchImpl, controller.signal)
      .then(({ buffer }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
        setInternal({ state: 'loading', objectUrl });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setInternal({ state: 'fallback', reason: errorMessage(err) });
      });
    return () => {
      controller.abort();
      if (objectUrl) {
        useGLTF.clear(objectUrl);
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [modelUrl, maxBytes, fetchImpl]);

  const handleLoaded = useMemo(
    () => (loadedUrl: string, report: MappingReport<Object3D>, handles: GlbHandles) => {
      setInternal((prev) =>
        (prev.state === 'loading' || prev.state === 'loaded') && prev.objectUrl === loadedUrl
          ? { state: 'loaded', objectUrl: loadedUrl, report, handles }
          : prev,
      );
    },
    [],
  );
  const handleError = useMemo(
    () => (error: Error) =>
      setInternal((prev) => (prev.state === 'fallback' ? prev : { state: 'fallback', reason: error.message })),
    [],
  );

  const fallbackNode = createElement(Fallback);
  if (internal.state === 'fallback') {
    return createElement(
      'group',
      null,
      fallbackNode,
      showNotice ? createElement(FallbackNotice, { message: internal.reason }) : null,
    );
  }
  if (internal.state === 'checking') {
    // Chưa giao gì cho GLTFLoader cho tới khi preflight đạt.
    return fallbackNode;
  }
  return createElement(
    GlbErrorBoundary,
    { fallback: fallbackNode, onError: handleError, key: internal.objectUrl },
    createElement(
      Suspense,
      { fallback: fallbackNode },
      createElement(LoadedGlbModel, { url: internal.objectUrl, mapping, onLoaded: handleLoaded }),
    ),
  );
}

/** Panel debug (DOM, đặt NGOÀI `<Canvas>`): liệt kê trạng thái và node chưa ánh xạ. */
export function GlbDebugPanel({ status }: { status: GlbLoadStatus }) {
  const box = {
    position: 'absolute' as const,
    right: 8,
    top: 8,
    maxHeight: '40vh',
    overflow: 'auto',
    background: 'rgba(0,0,0,0.75)',
    color: '#eee',
    font: '12px monospace',
    padding: 8,
    borderRadius: 4,
  };
  if (status.state === 'checking') return createElement('div', { style: box }, 'GLB: đang kiểm tra…');
  if (status.state === 'loading') return createElement('div', { style: box }, 'GLB: đang nạp…');
  if (status.state === 'fallback') {
    return createElement('div', { style: box, role: 'status' }, `GLB: fallback procedural — ${status.reason}`);
  }
  const { report } = status;
  const list = (title: string, items: string[]) =>
    createElement(
      'div',
      { key: title },
      createElement('strong', null, `${title} (${items.length})`),
      items.length ? createElement('ul', null, ...items.map((t, i) => createElement('li', { key: `${i}:${t}` }, t))) : null,
    );
  return createElement(
    'div',
    { style: box },
    list(
      'Đã ánh xạ',
      report.mapped.map((m) => `${m.path} → ${m.componentId}`),
    ),
    list(
      'Chưa ánh xạ',
      report.unmapped.map((u) => (u.inheritedComponentId ? `${u.path} (thuộc ${u.inheritedComponentId})` : u.path)),
    ),
    list('Component thiếu node', report.missingComponents),
    list('Component trùng node', report.duplicateComponents),
  );
}
