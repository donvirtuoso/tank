// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Group, Object3D } from 'three';

const useGLTFMock = vi.hoisted(() => Object.assign(vi.fn(), { clear: vi.fn() }));
vi.mock('@react-three/drei', () => ({
  useGLTF: useGLTFMock,
  Html: ({ children }: { children?: ReactNode }) => children,
}));

import {
  EMPTY_HANDLES,
  FALLBACK_NOTICE_PREFIX,
  GlbTankModel,
  parseNodeMapping,
  type FetchLike,
  type GlbHandles,
  type GlbLoadStatus,
} from './glbAdapter';

/** GLB 2.0 tối giản (chỉ chunk JSON). */
function makeGlb(json: object): ArrayBuffer {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(enc.length / 4) * 4;
  const total = 20 + padded;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buf, 20, padded);
  bytes.fill(0x20);
  bytes.set(enc);
  return buf;
}

const glb = makeGlb({
  asset: { version: '2.0' },
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'Hull', children: [1] }, { name: 'Turret' }],
});

const mapping = parseNodeMapping({
  version: 1,
  modelUrl: '/models/test.glb',
  maxFileSizeBytes: 10_000,
  nodes: { Hull: 'hull', Turret: 'turret' },
  pivots: { turret: [0, 1, 0] },
});

function fakeFetch(body: ArrayBuffer | null, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => body ?? new ArrayBuffer(0),
  }));
}

function makeScene() {
  const scene = new Group();
  const hull = new Object3D();
  hull.name = 'Hull';
  const turret = new Object3D();
  turret.name = 'Turret';
  hull.add(turret);
  scene.add(hull);
  return scene;
}

const Procedural = () => createElement('div', { 'data-testid': 'procedural' });

function setup(props: { fetchImpl: FetchLike; maxFileSizeBytes?: number }) {
  const statuses: GlbLoadStatus[] = [];
  const handles: GlbHandles[] = [];
  const utils = render(
    createElement(GlbTankModel, {
      fallback: Procedural,
      mapping,
      onStatusChange: (s) => statuses.push(s),
      onHandles: (h) => handles.push(h),
      ...props,
    }),
  );
  return { ...utils, statuses, handles };
}

let blobCounter = 0;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // tag <group>/<primitive> lạ với react-dom
  URL.createObjectURL = vi.fn(() => `blob:test/${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
  useGLTFMock.mockReset();
  useGLTFMock.clear.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GlbTankModel — fallback', () => {
  it('thiếu file (404): hiện mô hình procedural + thông báo, không gọi useGLTF', async () => {
    const { statuses, handles } = setup({ fetchImpl: fakeFetch(null, 404) });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(FALLBACK_NOTICE_PREFIX));
    expect(screen.getByTestId('procedural')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/HTTP 404/);
    expect(statuses.at(-1)).toEqual({ state: 'fallback', reason: expect.stringMatching(/HTTP 404/) });
    expect(useGLTFMock).not.toHaveBeenCalled();
    expect(handles.every((h) => h === EMPTY_HANDLES)).toBe(true);
  });

  it('GLB hỏng: fallback + thông báo', async () => {
    const broken = glb.slice(0);
    new DataView(broken).setUint32(0, 0, true);
    const { statuses } = setup({ fetchImpl: fakeFetch(broken) });
    await waitFor(() => expect(statuses.at(-1)?.state).toBe('fallback'));
    expect(screen.getByTestId('procedural')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/magic/);
    expect(useGLTFMock).not.toHaveBeenCalled();
  });

  it('file vượt giới hạn: không bao giờ tới GLTFLoader (không race)', async () => {
    useGLTFMock.mockImplementation(() => ({ scene: makeScene() }));
    const { statuses } = setup({ fetchImpl: fakeFetch(glb), maxFileSizeBytes: 16 });
    await waitFor(() => expect(statuses.at(-1)?.state).toBe('fallback'));
    expect(screen.getByRole('status').textContent).toMatch(/quá lớn/);
    expect(useGLTFMock).not.toHaveBeenCalled();
    expect(statuses.map((s) => s.state)).not.toContain('loaded');
  });

  it('lỗi parse của three (error boundary): fallback + thu hồi handle', async () => {
    useGLTFMock.mockImplementation(() => {
      throw new Error('GLTFLoader: hỏng');
    });
    const { statuses, handles } = setup({ fetchImpl: fakeFetch(glb) });
    await waitFor(() => expect(statuses.at(-1)?.state).toBe('fallback'));
    expect(screen.getByTestId('procedural')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/GLTFLoader: hỏng/);
    expect(handles.every((h) => h === EMPTY_HANDLES)).toBe(true);
  });
});

describe('GlbTankModel — nạp thành công', () => {
  it('tải đúng một lần, useGLTF nhận object URL, phát handle sau khi loaded', async () => {
    useGLTFMock.mockImplementation(() => ({ scene: makeScene() }));
    const fetchImpl = fakeFetch(glb);
    const { statuses, handles, unmount } = setup({ fetchImpl });
    await waitFor(() => expect(statuses.at(-1)?.state).toBe('loaded'));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(useGLTFMock).toHaveBeenCalled();
    expect(useGLTFMock.mock.calls.every(([u]) => typeof u === 'string' && u.startsWith('blob:test/'))).toBe(true);
    expect(screen.queryByTestId('procedural')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    const last = statuses.at(-1);
    expect(last?.state === 'loaded' && last.report.mapped.map((m) => m.componentId)).toEqual(['hull', 'turret']);
    const current = handles.at(-1)!;
    expect(Object.keys(current).sort()).toEqual(['hull', 'turret']);
    expect(current.turret.name).toBe('turret__pivot');

    const blobUrl = useGLTFMock.mock.calls[0][0] as string;
    unmount();
    expect(handles.at(-1)).toBe(EMPTY_HANDLES);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
    expect(useGLTFMock.clear).toHaveBeenCalledWith(blobUrl);
  });
});
