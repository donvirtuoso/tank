import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { initialSelectionState, useSelectionStore } from '../../stores/useSelectionStore';

const { canvas } = vi.hoisted(() => ({ canvas: document.createElement('canvas') }));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (s: unknown) => unknown) => selector({ gl: { domElement: canvas } }),
}));

import {
  applyHighlight,
  applySelectionHighlight,
  applyVisibility,
  clearHighlight,
  findComponentId,
  findObjectByComponentId,
  handleSelectionKey,
  isClickGesture,
  isHighlighted,
  resolveHit,
  useSelectable,
} from './useSelectable';

function makeMesh(name: string, material?: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material ?? new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** hull(mesh) > turret(group) > gunPart(group, không id) > gunMesh */
function buildScene() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.userData.componentId = 'hull';
  const hullMesh = makeMesh('hullMesh');
  const turret = new THREE.Group();
  turret.userData.componentId = 'turret';
  const turretMesh = makeMesh('turretMesh');
  const gun = new THREE.Group();
  gun.userData.componentId = 'gun';
  const gunPart = new THREE.Group();
  const gunMesh = makeMesh('gunMesh');
  gunPart.add(gunMesh);
  gun.add(gunPart);
  turret.add(turretMesh, gun);
  hull.add(hullMesh, turret);
  root.add(hull);
  return { root, hull, hullMesh, turret, turretMesh, gun, gunMesh };
}

const store = () => useSelectionStore.getState();

beforeEach(() => {
  useSelectionStore.setState({ ...initialSelectionState });
});

describe('resolve owner', () => {
  it('walks up to the nearest componentId', () => {
    const s = buildScene();
    expect(findComponentId(s.gunMesh)).toBe('gun');
    expect(findComponentId(s.turretMesh)).toBe('turret');
    expect(findComponentId(new THREE.Mesh())).toBeNull();
    expect(findObjectByComponentId(s.root, 'turret')).toBe(s.turret);
  });

  it('resolveHit skips invisible objects', () => {
    const s = buildScene();
    s.gunMesh.visible = false;
    expect(resolveHit([{ object: s.gunMesh }, { object: s.turretMesh }])).toBe('turret');
    expect(resolveHit([])).toBeNull();
  });
});

describe('click vs drag', () => {
  it('isClickGesture uses a movement threshold', () => {
    expect(isClickGesture({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
    expect(isClickGesture({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe(false);
    expect(isClickGesture(null, { x: 100, y: 100 })).toBe(true);
  });

  it('dragging to orbit does not change selection; a real click does', () => {
    const s = buildScene();
    const ref = { current: s.root };
    const { result } = renderHook(() => useSelectable(ref));
    const fakeEvent = (x: number) =>
      ({
        nativeEvent: new MouseEvent('click', { clientX: x, clientY: 0 }),
        intersections: [{ object: s.gunMesh }],
        stopPropagation: vi.fn(),
      }) as never;

    const pointerDown = () =>
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));

    store().select('hull');
    pointerDown();
    act(() => result.current.onClick(fakeEvent(80)));
    expect(store().selectedId).toBe('hull');

    act(() => result.current.onPointerMissed(new MouseEvent('click', { clientX: 80, clientY: 0 })));
    expect(store().selectedId).toBe('hull');

    pointerDown();
    act(() => result.current.onClick(fakeEvent(2)));
    expect(store().selectedId).toBe('gun');
    expect(isHighlighted(s.gunMesh)).toBe(true);

    act(() => result.current.onPointerMissed(new MouseEvent('click', { clientX: 1, clientY: 0 })));
    expect(store().selectedId).toBeNull();
    expect(isHighlighted(s.gunMesh)).toBe(false);
  });

  it('hover updates only when no button is pressed', () => {
    const s = buildScene();
    const { result } = renderHook(() => useSelectable({ current: s.root }));
    const move = (buttons: number) =>
      ({
        nativeEvent: new MouseEvent('pointermove', { buttons }),
        intersections: [{ object: s.turretMesh }],
      }) as never;
    act(() => result.current.onPointerMove(move(1)));
    expect(store().hoverId).toBeNull();
    act(() => result.current.onPointerMove(move(0)));
    expect(store().hoverId).toBe('turret');
    act(() => result.current.onPointerOut({ intersections: [] } as never));
    expect(store().hoverId).toBeNull();
  });
});

describe('temporary highlight', () => {
  it('never mutates the original (possibly shared) material', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const a = makeMesh('a', shared);
    const b = makeMesh('b', shared);
    const group = new THREE.Group();
    group.add(a);

    applyHighlight(group, 'hover');
    expect(a.material).not.toBe(shared);
    expect((a.material as THREE.MeshStandardMaterial).emissive.getHex()).not.toBe(0);
    expect(shared.emissive.getHex()).toBe(0);
    expect(b.material).toBe(shared);

    applyHighlight(group, 'selected');
    clearHighlight(group);
    expect(a.material).toBe(shared);
  });

  it('selected wins over hover on nested components and clears cleanly', () => {
    const s = buildScene();
    const originalGun = s.gunMesh.material;
    let applied = applySelectionHighlight(s.root, { hoverId: 'gun', selectedId: 'turret' });
    const style = (s.gunMesh.material as THREE.MeshStandardMaterial).emissive.getHex();
    expect(style).toBe(0xffaa00);
    expect(isHighlighted(s.hullMesh)).toBe(false);

    applied = applySelectionHighlight(s.root, { hoverId: 'hull', selectedId: null }, applied);
    expect(s.gunMesh.material).not.toBe(originalGun); // con của hull cũng sáng khi hover hull
    applySelectionHighlight(s.root, { hoverId: null, selectedId: null }, applied);
    expect(s.gunMesh.material).toBe(originalGun);
  });
});

describe('applyVisibility', () => {
  it('applies hide/isolate to owned meshes', () => {
    const s = buildScene();
    applyVisibility(s.root, { hidden: ['turret'], isolated: null });
    expect(s.turretMesh.visible).toBe(false);
    expect(s.gunMesh.visible).toBe(false);
    expect(s.hullMesh.visible).toBe(true);

    applyVisibility(s.root, { hidden: [], isolated: ['gun'] });
    expect(s.gunMesh.visible).toBe(true);
    expect(s.turretMesh.visible).toBe(false);
    expect(s.hullMesh.visible).toBe(false);

    applyVisibility(s.root, { hidden: [], isolated: null });
    expect([s.gunMesh, s.turretMesh, s.hullMesh].every((m) => m.visible)).toBe(true);
  });
});

describe('hotkeys', () => {
  const key = (k: string, target: EventTarget | null = document.body) =>
    handleSelectionKey({ key: k, target, ctrlKey: false, metaKey: false, altKey: false });

  it('Esc clears selection, F requests focus', () => {
    store().select('engine');
    expect(key('f')).toBe(true);
    expect(store().focusRequest?.id).toBe('engine');
    expect(key('Escape')).toBe(true);
    expect(store().selectedId).toBeNull();
    expect(key('F')).toBe(false);
  });

  it('ignores keys typed into inputs', () => {
    store().select('engine');
    expect(key('Escape', document.createElement('input'))).toBe(false);
    expect(store().selectedId).toBe('engine');
  });
});
