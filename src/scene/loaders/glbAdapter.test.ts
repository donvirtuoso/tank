import { describe, expect, it } from 'vitest';
import { Group, Mesh, Object3D } from 'three';
import {
  GlbFormatError,
  MAX_GLB_DEPTH,
  MAX_GLB_NODES,
  applyPivots,
  assertSelfContainedGlb,
  buildGltfNodeTree,
  defaultNodeMapping,
  mapSceneGraph,
  parseGlbSceneGraph,
  parseNodeMapping,
  preflightGlb,
  resolveComponentId,
  type FetchLike,
} from './glbAdapter';

/** Sinh một GLB 2.0 tối giản (chỉ chunk JSON, không mesh/buffer). */
function makeGlb(json: object): ArrayBuffer {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(enc.length / 4) * 4;
  const total = 12 + 8 + padded;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buf, 20, padded);
  bytes.fill(0x20); // pad bằng khoảng trắng theo spec
  bytes.set(enc);
  return buf;
}

const tinyTank = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0, 5] }],
  nodes: [
    { name: 'Hull', children: [1, 3, 4] },
    { name: 'Turret', children: [2, 6] },
    { name: 'Barrel' },
    { name: 'Track_L' },
    { name: 'Track_R' },
    { name: 'Spare_Fuel' },
    { name: 'Turret_Bolt' },
  ],
};

const mapping = parseNodeMapping({
  version: 1,
  modelUrl: '/models/test.glb',
  maxFileSizeBytes: 1024,
  nodes: { Hull: 'hull', Turret: 'turret', Barrel: 'barrel', Track_L: 'track-left', Track_R: 'track-right', Hatch: 'hatch' },
  pivots: { turret: [0, 1, 0] },
});

function fakeFetch(body: ArrayBuffer | null, status = 200, contentLength?: number): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => (n === 'content-length' && contentLength !== undefined ? String(contentLength) : null) },
    arrayBuffer: async () => body ?? new ArrayBuffer(0),
  });
}

describe('parseGlbSceneGraph + mapSceneGraph với GLB tự sinh', () => {
  const root = parseGlbSceneGraph(makeGlb(tinyTank));
  const report = mapSceneGraph(root, mapping);

  it('ánh xạ đúng node -> componentId', () => {
    expect(report.mapped.map((m) => [m.path, m.componentId])).toEqual([
      ['Hull', 'hull'],
      ['Hull/Turret', 'turret'],
      ['Hull/Turret/Barrel', 'barrel'],
      ['Hull/Track_L', 'track-left'],
      ['Hull/Track_R', 'track-right'],
    ]);
  });

  it('liệt kê node chưa ánh xạ (kèm component kế thừa)', () => {
    expect(report.unmapped).toEqual([
      { name: 'Turret_Bolt', path: 'Hull/Turret/Turret_Bolt', inheritedComponentId: 'turret' },
      { name: 'Spare_Fuel', path: 'Spare_Fuel' },
    ]);
  });

  it('báo component thiếu node', () => {
    expect(report.missingComponents).toEqual(['hatch']);
    expect(report.duplicateComponents).toEqual([]);
  });
});

describe('resolveComponentId', () => {
  it('khớp chính xác rồi không phân biệt hoa/thường', () => {
    expect(resolveComponentId('Hull', mapping.nodes)).toBe('hull');
    expect(resolveComponentId('hull', mapping.nodes)).toBe('hull');
    expect(resolveComponentId('Unknown', mapping.nodes)).toBeUndefined();
    expect(resolveComponentId('', mapping.nodes)).toBeUndefined();
  });
});

describe('GLB lỗi', () => {
  it('sai magic', () => {
    const buf = makeGlb(tinyTank);
    new DataView(buf).setUint32(0, 0, true);
    expect(() => parseGlbSceneGraph(buf)).toThrow(GlbFormatError);
  });

  it('file cụt', () => {
    expect(() => parseGlbSceneGraph(makeGlb(tinyTank).slice(0, 30))).toThrow(GlbFormatError);
  });

  it('quá ngắn', () => {
    expect(() => parseGlbSceneGraph(new ArrayBuffer(4))).toThrow(GlbFormatError);
  });

  it('node index không tồn tại / vòng lặp', () => {
    expect(() => parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [9] }], nodes: [] }))).toThrow(/không tồn tại/);
    expect(() =>
      parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [0] }], nodes: [{ name: 'A', children: [0] }] })),
    ).toThrow(/vòng lặp/);
  });

  it('từ chối node dùng lại dưới nhiều cha (DAG nổ 2^n) mà không treo', () => {
    const n = 40;
    const nodes = Array.from({ length: n }, (_, i) => (i < n - 1 ? { name: `N${i}`, children: [i + 1, i + 1] } : { name: `N${i}` }));
    const started = Date.now();
    expect(() => parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [0] }], nodes }))).toThrow(/dùng lại/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('từ chối node dùng lại giữa các scene root', () => {
    expect(() =>
      parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [0, 1] }], nodes: [{ name: 'A', children: [1] }, { name: 'B' }] })),
    ).toThrow(/dùng lại/);
  });

  it('từ chối cây quá sâu và quá nhiều node', () => {
    const depth = MAX_GLB_DEPTH + 5;
    const chain = Array.from({ length: depth }, (_, i) => (i < depth - 1 ? { name: `C${i}`, children: [i + 1] } : { name: `C${i}` }));
    expect(() => parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [0] }], nodes: chain }))).toThrow(/sâu/);
    const many = Array.from({ length: MAX_GLB_NODES + 1 }, () => ({}));
    expect(() => buildGltfNodeTree({ scenes: [{ nodes: [] }], nodes: many })).toThrow(/Quá nhiều node/);
  });

  it('sanitize tên node giống GLTFLoader', () => {
    const root = parseGlbSceneGraph(makeGlb({ scenes: [{ nodes: [0] }], nodes: [{ name: 'Track.L wheel' }] }));
    expect(root.children[0].name).toBe('TrackL_wheel');
  });
});

describe('assertSelfContainedGlb', () => {
  it('từ chối buffer/ảnh ngoài và Draco', () => {
    expect(() => assertSelfContainedGlb({ buffers: [{ uri: 'tank.bin' }] })).toThrow(/file ngoài/);
    expect(() => assertSelfContainedGlb({ images: [{ uri: 'tex.png' }] })).toThrow(/file ngoài/);
    expect(() => assertSelfContainedGlb({ extensionsRequired: ['KHR_draco_mesh_compression'] })).toThrow(/Draco/);
    expect(() => assertSelfContainedGlb({ buffers: [{}], images: [{ uri: 'data:image/png;base64,AA==' }] })).not.toThrow();
  });
});

describe('preflightGlb', () => {
  it('trả về buffer đã tải + cây node khi hợp lệ', async () => {
    const glb = makeGlb(tinyTank);
    const { buffer, tree } = await preflightGlb('/m.glb', 10_000, fakeFetch(glb));
    expect(buffer.byteLength).toBe(glb.byteLength);
    expect(tree.children.map((c) => c.name)).toEqual(['Hull', 'Spare_Fuel']);
  });

  it('dừng đọc stream ngay khi vượt giới hạn (không có content-length)', async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(40);
    const reader = {
      read: async () => {
        pulls += 1;
        return pulls > 1000 ? { done: true, value: undefined } : { done: false, value: chunk };
      },
      cancel: async () => {
        cancelled = true;
      },
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
      arrayBuffer: async () => {
        throw new Error('không được gọi');
      },
    });
    await expect(preflightGlb('/m.glb', 100, fetchImpl)).rejects.toThrow(/quá lớn/);
    expect(pulls).toBe(3);
    expect(cancelled).toBe(true);
  });

  it('ghép stream thành buffer khi trong giới hạn', async () => {
    const glb = new Uint8Array(makeGlb(tinyTank));
    const parts = [glb.slice(0, 10), glb.slice(10)];
    const reader = {
      read: async () => (parts.length ? { done: false, value: parts.shift() } : { done: true, value: undefined }),
      cancel: async () => undefined,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const { tree } = await preflightGlb('/m.glb', 10_000, fetchImpl);
    expect(tree.children.map((c) => c.name)).toEqual(['Hull', 'Spare_Fuel']);
  });

  it('báo lỗi với GLB tham chiếu file ngoài', async () => {
    const glb = makeGlb({ ...tinyTank, buffers: [{ uri: 'tank.bin', byteLength: 4 }] });
    await expect(preflightGlb('/m.glb', 10_000, fakeFetch(glb))).rejects.toThrow(/file ngoài/);
  });

  it('báo lỗi khi thiếu file (404)', async () => {
    await expect(preflightGlb('/m.glb', 10_000, fakeFetch(null, 404))).rejects.toThrow(/HTTP 404/);
  });

  it('chặn file vượt giới hạn theo content-length', async () => {
    await expect(preflightGlb('/m.glb', 100, fakeFetch(makeGlb(tinyTank), 200, 5_000_000))).rejects.toThrow(/quá lớn/);
  });

  it('chặn file vượt giới hạn theo kích thước thực', async () => {
    await expect(preflightGlb('/m.glb', 50, fakeFetch(makeGlb(tinyTank)))).rejects.toThrow(/quá lớn/);
  });
});

describe('parseNodeMapping', () => {
  it('mapping mặc định hợp lệ', () => {
    expect(defaultNodeMapping.modelUrl).toMatch(/^\/models\/.+\.glb$/);
    expect(defaultNodeMapping.maxFileSizeBytes).toBeGreaterThan(0);
  });

  it('từ chối mapping sai', () => {
    expect(() => parseNodeMapping(null)).toThrow();
    expect(() => parseNodeMapping({ version: 1, modelUrl: '/a.glb', nodes: { A: 1 } })).toThrow(/componentId/);
    expect(() => parseNodeMapping({ version: 1, modelUrl: '/a.glb', nodes: {}, pivots: { a: [1, 2] } })).toThrow(/Pivot/);
  });

  it('giữ khoá "__proto__" thay vì nuốt mất', () => {
    const raw = JSON.parse('{"version":1,"modelUrl":"/a.glb","nodes":{"__proto__":"weird"},"pivots":{"__proto__":[1,2,3]}}');
    const m = parseNodeMapping(raw);
    expect(Object.keys(m.nodes)).toEqual(['__proto__']);
    expect(resolveComponentId('__proto__', m.nodes)).toBe('weird');
    expect(m.pivots['__proto__']).toEqual([1, 2, 3]);
    expect(resolveComponentId('toString', m.nodes)).toBeUndefined();
  });
});

describe('applyPivots', () => {
  it('bọc node trong Group tại pivot mà không làm dịch hình học', () => {
    const root = new Group();
    const hull = new Object3D();
    hull.name = 'Hull';
    const turret = new Mesh();
    turret.name = 'Turret';
    turret.position.set(0, 1.5, 0);
    const trackL = new Object3D();
    trackL.name = 'Track_L';
    hull.add(turret, trackL);
    root.add(hull);
    turret.updateMatrixWorld(true);
    const before = turret.getWorldPosition(turret.position.clone());

    const report = mapSceneGraph<Object3D>(root, mapping);
    const handles = applyPivots(report.mapped, mapping.pivots);

    const wrapper = handles.turret;
    expect(wrapper.name).toBe('turret__pivot');
    expect(wrapper.parent).toBe(hull);
    expect(hull.children[0]).toBe(wrapper); // giữ thứ tự
    expect(turret.parent).toBe(wrapper);
    expect(wrapper.position.toArray()).toEqual([0, 1, 0]);
    root.updateMatrixWorld(true);
    expect(turret.getWorldPosition(turret.position.clone()).toArray()).toEqual(before.toArray());
    expect(handles.hull).toBe(hull); // không có pivot -> chính node
  });
});
