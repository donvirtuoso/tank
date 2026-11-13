import { describe, expect, it, beforeEach } from 'vitest';
import { Group, Matrix4, Mesh, MeshStandardMaterial, BoxGeometry, Object3D } from 'three';
import {
  type MechanismState,
  type Transform,
  type TweenDriver,
  applyTransform,
  createCanonicalRegistry,
  getCanonical,
  instantDriver,
  makeTransform,
  matrixMaxDiff,
  quatFromAxisAngle,
  transition,
} from '../transformEngine';
import {
  type MechanismDef,
  type RotarySpec,
  TANK_COMPONENTS as C,
  createMechanismController,
  createRotaryController,
  createTankMechanismDefs,
  poseAt,
  registerMechanisms,
} from '../mechanisms';
import {
  EXPLODE_STAGES,
  type ExplodePartSpec,
  activeStage,
  buildExplodePlan,
  computeExplodeOffsets,
  computeExplodedTransforms,
  explodedTransform,
  stageProgress,
} from '../explode';
import { createCutawayPlane, createXRayController } from '../../materials/xray';
import { useAssemblyStore } from '../../../stores/useAssemblyStore';

const EPS = 1e-6;

/** PRNG tất định (LCG) để test lặp lại được. */
function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Driver mô phỏng GSAP: tween tiến theo bước thời gian thủ công, có thể kill. */
function createManualDriver() {
  interface Tw {
    from: number;
    to: number;
    dur: number;
    elapsed: number;
    onUpdate: (v: number) => void;
    onComplete: () => void;
  }
  const active = new Set<Tw>();
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const driver: TweenDriver = {
    tween(from, to, dur, onUpdate, onComplete) {
      const tw: Tw = { from, to, dur, elapsed: 0, onUpdate, onComplete };
      active.add(tw);
      return { kill: () => void active.delete(tw) };
    },
  };
  const step = (dt: number) => {
    for (const tw of [...active]) {
      if (!active.has(tw)) continue;
      tw.elapsed += dt;
      const k = Math.min(1, tw.elapsed / tw.dur);
      tw.onUpdate(tw.from + (tw.to - tw.from) * ease(k));
      if (k >= 1) {
        active.delete(tw);
        tw.onComplete();
      }
    }
  };
  const flush = () => {
    let guard = 0;
    while (active.size > 0 && guard++ < 10_000) step(0.05);
  };
  return { driver, step, flush, get size() { return active.size; } };
}

/** Transform gốc không tầm thường (xoay + scale) để bắt lỗi không gian local. */
const ORIGINALS: Record<string, Transform> = {
  [C.driverHatch]: makeTransform([0.4, 1.1, 2.3], quatFromAxisAngle([0, 1, 0], 0.07), [1, 1, 1]),
  [C.commanderHatch]: makeTransform([-0.5, 2.4, -0.2], quatFromAxisAngle([0.2, 1, 0.1], 0.9), [1.1, 1, 0.9]),
  [C.engineCoverLeft]: makeTransform([-0.6, 1.3, -2.1], [0, 0, 0, 1], [1, 1, 1]),
  [C.engineCoverRight]: makeTransform([0.6, 1.3, -2.1], [0, 0, 0, 1], [1, 1, 1]),
  [C.engineAccessPanel]: makeTransform([0, 1.25, -2.9], quatFromAxisAngle([1, 0, 0], -0.12), [1, 1, 1]),
  [C.powerpack]: makeTransform([0, 0.8, -2.2], [0, 0, 0, 1], [1, 1, 1]),
  [C.turret]: makeTransform([0, 1.9, 0.3], quatFromAxisAngle([0, 1, 0], 0.3), [1, 1, 1]),
  [C.gun]: makeTransform([0, 0.3, 1.8], [0, 0, 0, 1], [1, 1, 1]),
};

const defs = createTankMechanismDefs(ORIGINALS);
const byId = (id: string) => {
  const d = defs.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};
const openables = defs.filter((d) => d.spec.kind !== 'rotary');
const hatches = openables.filter((d) => d.spec.kind === 'hinge' || d.spec.kind === 'lift');

function harness(def: MechanismDef) {
  const md = createManualDriver();
  let pose: Transform = def.original;
  const states: MechanismState[] = [];
  const ctrl = createMechanismController(def, {
    driver: md.driver,
    apply: (p) => (pose = p),
    onStateChange: (s) => states.push(s),
  });
  return { md, ctrl, states, get pose() { return pose; } };
}

describe('transformEngine – state machine', () => {
  it('chuyển trạng thái và cho phép đảo chiều giữa chừng', () => {
    expect(transition('CLOSED', 'TOGGLE')).toBe('OPENING');
    expect(transition('OPENING', 'TOGGLE')).toBe('CLOSING');
    expect(transition('CLOSING', 'TOGGLE')).toBe('OPENING');
    expect(transition('OPEN', 'TOGGLE')).toBe('CLOSING');
    expect(transition('OPENING', 'FINISHED')).toBe('OPEN');
    expect(transition('CLOSING', 'FINISHED')).toBe('CLOSED');
    expect(transition('OPEN', 'OPEN')).toBe('OPEN');
    expect(transition('OPENING', 'CLOSE')).toBe('CLOSING');
  });

  it('registry lưu transform chuẩn closed/open/original theo componentId', () => {
    const reg = registerMechanisms(createCanonicalRegistry(), defs);
    for (const d of openables) {
      const c = getCanonical(reg, d.id);
      expect(matrixMaxDiff(c.original, d.original)).toBe(0);
      expect(matrixMaxDiff(c.closed, d.original)).toBe(0);
      expect(matrixMaxDiff(c.open, poseAt(d, 1))).toBeLessThan(EPS);
      expect(matrixMaxDiff(c.open, d.original)).toBeGreaterThan(1e-3);
    }
  });
});

describe('Nắp: open/close 100 lần, click liên tục & đảo chiều', () => {
  it('có ít nhất 3 nắp (driver, commander, engine cover kép)', () => {
    const ids = hatches.map((h) => h.id);
    expect(ids).toEqual(
      expect.arrayContaining([C.driverHatch, C.commanderHatch, C.engineCoverLeft, C.engineCoverRight]),
    );
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  for (const def of hatches) {
    it(`${def.id}: 100 chu kỳ có ngắt/đảo chiều vẫn về đúng transform chuẩn`, () => {
      const h = harness(def);
      const rand = rng(def.id.length * 7919);
      const canonicalOpen = poseAt(def, 1);

      for (let i = 0; i < 100; i++) {
        h.ctrl.toggle();
        // Chạy một đoạn ngẫu nhiên rồi click tiếp (có lúc đảo chiều giữa chừng, có lúc chạy hết).
        h.md.step(rand() * (def.duration ?? 1) * 1.2);
        if (rand() < 0.3) h.ctrl.toggle(); // double click
        if (rand() < 0.2) h.md.step(rand() * 0.3);
      }

      h.ctrl.open();
      h.md.flush();
      expect(h.ctrl.state).toBe('OPEN');
      expect(matrixMaxDiff(h.pose, canonicalOpen)).toBeLessThan(EPS);

      h.ctrl.close();
      h.md.flush();
      expect(h.ctrl.state).toBe('CLOSED');
      expect(h.ctrl.progress).toBe(0);
      expect(matrixMaxDiff(h.pose, def.original)).toBeLessThan(EPS);
    });
  }

  it('đảo chiều giữa chừng tiếp tục từ vị trí hiện tại (không nhảy)', () => {
    const h = harness(byId(C.driverHatch));
    h.ctrl.open();
    h.md.step(0.3);
    const mid = h.ctrl.progress;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    h.ctrl.toggle();
    expect(h.ctrl.state).toBe('CLOSING');
    h.md.step(0.01);
    expect(h.ctrl.progress).toBeLessThanOrEqual(mid);
    h.md.flush();
    expect(h.states[h.states.length - 1]).toBe('CLOSED');
  });

  it('áp lên Object3D: ma trận sau 100 chu kỳ trùng ma trận ban đầu', () => {
    const def = byId(C.commanderHatch);
    const obj = new Object3D();
    applyTransform(obj, def.original);
    obj.updateMatrix();
    const before = obj.matrix.clone();
    const md = createManualDriver();
    const ctrl = createMechanismController(def, { driver: md.driver, apply: (p) => applyTransform(obj, p) });
    for (let i = 0; i < 100; i++) {
      ctrl.toggle();
      md.step(0.13 * ((i % 5) + 1));
    }
    ctrl.close();
    md.flush();
    obj.updateMatrix();
    expectMatrixClose(obj.matrix, before);
  });
});

function expectMatrixClose(a: Matrix4, b: Matrix4) {
  for (let i = 0; i < 16; i++) expect(Math.abs(a.elements[i] - b.elements[i])).toBeLessThan(EPS);
}

describe('Detach / reattach', () => {
  it('100 lần tháo/lắp (có ngắt) không trôi', () => {
    const def = byId(C.powerpack);
    const h = harness(def);
    const rand = rng(1234);
    for (let i = 0; i < 100; i++) {
      h.ctrl.open(); // detach
      h.md.step(rand() * 2);
      h.ctrl.close(); // reattach
      h.md.step(rand() * 2);
    }
    h.ctrl.close();
    h.md.flush();
    expect(matrixMaxDiff(h.pose, def.original)).toBeLessThan(EPS);

    h.ctrl.open();
    h.md.flush();
    expect(h.ctrl.state).toBe('OPEN');
    expect(matrixMaxDiff(h.pose, poseAt(def, 1))).toBeLessThan(EPS);
  });

  it('detach đi theo 2 pha: nhấc lên trước rồi mới đưa ra', () => {
    const def = byId(C.powerpack);
    const early = poseAt(def, 0.2);
    expect(early.position[1]).toBeGreaterThan(def.original.position[1]);
    expect(early.position[2]).toBeCloseTo(def.original.position[2], 9);
    const late = poseAt(def, 1);
    expect(late.position[2]).toBeLessThan(def.original.position[2]);
  });
});

describe('Turret yaw / gun elevation', () => {
  it('100 lần xoay ngẫu nhiên rồi về 0 trả lại transform gốc', () => {
    for (const id of [C.turret, C.gun]) {
      const def = byId(id) as MechanismDef<RotarySpec>;
      const md = createManualDriver();
      let pose = def.original;
      const ctrl = createRotaryController(def, { driver: md.driver, apply: (p) => (pose = p) });
      const rand = rng(99);
      for (let i = 0; i < 100; i++) {
        ctrl.rotateTo(def.spec.min + rand() * (def.spec.max - def.spec.min));
        md.step(rand() * 0.5);
      }
      ctrl.rotateTo(0);
      md.flush();
      expect(matrixMaxDiff(pose, def.original)).toBeLessThan(EPS);
    }
  });

  it('gun elevation bị kẹp trong giới hạn', () => {
    const def = byId(C.gun) as MechanismDef<RotarySpec>;
    let pose = def.original;
    const ctrl = createRotaryController(def, { driver: instantDriver, apply: (p) => (pose = p) });
    ctrl.rotateTo(10);
    expect(ctrl.value).toBe(def.spec.max);
    expect(matrixMaxDiff(pose, poseAt(def, def.spec.max))).toBeLessThan(EPS);
  });
});

describe('Exploded view', () => {
  const parts: ExplodePartSpec[] = [
    { id: 'driver_hatch', stage: 1, bounds: { min: [0.2, 1, 2], max: [0.6, 1.2, 2.5] } },
    { id: 'skirt_left', stage: 2, direction: [-1, 0, 0], distance: 1.5 },
    { id: 'skirt_right', stage: 2, direction: [1, 0, 0], distance: 1.5 },
    { id: 'gun', stage: 3, direction: [0, 0, 1], distance: 3 },
    { id: 'turret', stage: 4, bounds: { min: [-1, 1.6, -1], max: [1, 2.4, 1.5] } },
    { id: 'powerpack', stage: 5, bounds: { min: [-0.8, 0.4, -3], max: [0.8, 1.2, -1.5] } },
    { id: 'track_left', stage: 6, group: 'tracks', bounds: { min: [-1.8, 0, -3], max: [-1.3, 0.8, 3] } },
  ];
  const plan = buildExplodePlan(parts);
  const originals = new Map<string, Transform>(
    parts.map((p, i) => [p.id, makeTransform([i * 0.1, 1, -i * 0.2], quatFromAxisAngle([0, 1, 0], i * 0.2), [1, 1, 1])]),
  );

  it('vector tất định: build 2 lần cho cùng kết quả, không có vector 0', () => {
    const again = buildExplodePlan([...parts].reverse());
    expect(again.entries).toEqual(plan.entries);
    for (const e of plan.entries) expect(Math.hypot(...e.vector)).toBeGreaterThan(0);
  });

  it('tách đúng thứ tự 6 giai đoạn', () => {
    expect(EXPLODE_STAGES.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const k of [1, 2, 3, 4, 5, 6] as const) {
      const value = (100 * (k - 0.5)) / 6;
      expect(activeStage(value)).toBe(k);
      const offsets = computeExplodeOffsets(plan, value);
      for (const e of plan.entries) {
        const len = Math.hypot(...offsets.get(e.id)!);
        const full = Math.hypot(...e.vector);
        if (e.stage < k) expect(len).toBeCloseTo(full, 9);
        else if (e.stage > k) expect(len).toBe(0);
        else {
          expect(len).toBeGreaterThan(0);
          expect(len).toBeLessThan(full);
        }
      }
    }
    expect(stageProgress(0, 1)).toBe(0);
    expect(stageProgress(100, 6)).toBe(1);
  });

  it('slider 0→100→0 (100 lần, có bước lẻ) trả lại nguyên trạng', () => {
    const rand = rng(7);
    let last = computeExplodedTransforms(plan, originals, 0);
    for (let i = 0; i < 100; i++) {
      for (let v = 0; v <= 100; v += 1 + Math.floor(rand() * 7)) last = computeExplodedTransforms(plan, originals, v);
      last = computeExplodedTransforms(plan, originals, 100);
      for (let v = 100; v >= 0; v -= 1 + Math.floor(rand() * 7)) last = computeExplodedTransforms(plan, originals, v);
      last = computeExplodedTransforms(plan, originals, 0);
    }
    for (const [id, t] of last) expect(matrixMaxDiff(t, originals.get(id)!)).toBe(0);
  });

  it('explode nhóm chọn chỉ tách nhóm đó; collapse về gốc', () => {
    const offsets = computeExplodeOffsets(plan, 100, ['turret', 'tracks']);
    for (const e of plan.entries) {
      const moved = Math.hypot(...offsets.get(e.id)!) > 0;
      expect(moved).toBe(e.id === 'turret' || e.id === 'track_left');
    }
    const collapsed = computeExplodedTransforms(plan, originals, 0, ['turret']);
    for (const [id, t] of collapsed) expect(matrixMaxDiff(t, originals.get(id)!)).toBe(0);
  });

  it('kết hợp explode + mở nắp vẫn không trôi', () => {
    const def = byId(C.driverHatch);
    const explodePlan = buildExplodePlan([{ id: def.id, stage: 1, direction: [0, 1, 0], distance: 1 }]);
    const h = harness(def);
    const obj = new Object3D();
    for (let i = 0; i < 100; i++) {
      h.ctrl.toggle();
      h.md.step(0.2);
      // Pose hiển thị = pose cơ cấu + offset explode, tính lại mỗi frame từ transform chuẩn.
      const offsets = computeExplodeOffsets(explodePlan, (i * 37) % 101);
      applyTransform(obj, explodedTransform(h.pose, offsets.get(def.id)));
    }
    h.ctrl.close();
    h.md.flush();
    const final = computeExplodedTransforms(explodePlan, new Map([[def.id, h.pose]]), 0).get(def.id)!;
    expect(matrixMaxDiff(final, def.original)).toBeLessThan(EPS);
  });
});

describe('X-Ray', () => {
  function buildTank() {
    const root = new Group();
    const hullMat = new MeshStandardMaterial({ color: 0x556b2f });
    const hull = new Mesh(new BoxGeometry(1, 1, 1), hullMat);
    hull.name = 'hull';
    const skirt = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    skirt.name = 'side_skirt_panel';
    const engine = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    engine.name = 'engine_block';
    root.add(hull, skirt, engine);
    return { root, hull, hullMat, skirt, engine };
  }

  it('bật X-Ray: shell trong suốt (bản sao), panel ẩn, engine vẫn hiển thị', () => {
    const t = buildTank();
    const x = createXRayController(t.root);
    x.enable();
    const m = t.hull.material as MeshStandardMaterial;
    expect(m).not.toBe(t.hullMat);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.opacity).toBeLessThan(1);
    expect(t.hull.renderOrder).toBeGreaterThan(0);
    expect(t.skirt.visible).toBe(false);
    expect(t.engine.visible).toBe(true);
    // Material gốc không bị đổi.
    expect(t.hullMat.transparent).toBe(false);
    expect(t.hullMat.depthWrite).toBe(true);

    const plane = createCutawayPlane('x', 0.2);
    x.setClippingPlane(plane);
    expect(m.clippingPlanes).toEqual([plane]);
  });

  it('reset trả về render bình thường', () => {
    const t = buildTank();
    const x = createXRayController(t.root);
    for (let i = 0; i < 100; i++) {
      x.enable();
      x.setClippingPlane(createCutawayPlane('y', i * 0.01));
      x.reset();
    }
    expect(x.enabled).toBe(false);
    expect(t.hull.material).toBe(t.hullMat);
    expect(t.hull.renderOrder).toBe(0);
    expect(t.skirt.visible).toBe(true);
    expect(t.hullMat.clippingPlanes).toBeNull();
  });
});

describe('useAssemblyStore', () => {
  beforeEach(() => useAssemblyStore.getState().resetAll());

  it('toggle liên tục đảo request; report detach cập nhật trạng thái tháo', () => {
    const s = useAssemblyStore.getState;
    s().toggleMechanism(C.driverHatch);
    expect(s().requests[C.driverHatch]).toBe('open');
    s().toggleMechanism(C.driverHatch);
    expect(s().requests[C.driverHatch]).toBe('closed');
    s().reportMechanismState(C.powerpack, 'OPEN', 'detach');
    expect(s().detached[C.powerpack]).toBe(true);
    s().reportMechanismState(C.powerpack, 'CLOSED', 'detach');
    expect(s().detached[C.powerpack]).toBe(false);
  });

  it('explode all / collapse / nhóm chọn / reset', () => {
    const s = useAssemblyStore.getState;
    s().explodeAll();
    expect(s().explodeValue).toBe(100);
    s().collapse();
    expect(s().explodeValue).toBe(0);
    s().explodeSelected(['turret']);
    expect(s().explodeSelection).toEqual(['turret']);
    expect(s().explodeValue).toBe(100);
    s().setExplodeValue(250);
    expect(s().explodeValue).toBe(100);
    s().setXRay({ enabled: true, clipping: true });
    const token = s().resetToken;
    s().resetAll();
    expect(s().explodeValue).toBe(0);
    expect(s().explodeSelection).toEqual([]);
    expect(s().xray.enabled).toBe(false);
    expect(s().requests).toEqual({});
    expect(s().resetToken).toBe(token + 1);
  });
});
