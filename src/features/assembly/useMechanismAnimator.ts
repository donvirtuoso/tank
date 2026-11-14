import { useEffect } from 'react';
import type { MechanismInfo } from '@/scene/animations/mechanisms';
import type { MechanismState } from '@/scene/animations/transformEngine';
import { useAssemblyStore } from '@/stores/useAssemblyStore';
import { INITIAL_PROGRESS, useSceneFxStore, type MechanismProgress } from '@/stores/useSceneFxStore';

/** Các cơ cấu mà xe tăng procedural hỗ trợ (id theo `AssemblyControls`). */
export const PROCEDURAL_MECHANISMS: readonly (MechanismInfo & { key: keyof MechanismProgress })[] = [
  { id: 'driver_hatch', label: 'Nắp lái xe', kind: 'hinge', key: 'driverHatch' },
  { id: 'commander_hatch', label: 'Nắp trưởng xe', kind: 'hinge', key: 'commanderHatch' },
  { id: 'engine_cover', label: 'Nắp khoang động cơ', kind: 'hinge', key: 'engineCover' },
  { id: 'powerpack', label: 'Cụm động lực (tháo/lắp)', kind: 'detach', key: 'powerpack' },
];

/** Tốc độ hoạt ảnh: số lần đi hết 0→1 mỗi giây. */
const SPEED = 1.2;

function stateOf(value: number, target: number): MechanismState {
  if (value === target) return target === 1 ? 'OPEN' : 'CLOSED';
  return target === 1 ? 'OPENING' : 'CLOSING';
}

/**
 * Chạy hoạt ảnh mở/đóng cơ cấu theo yêu cầu trong `useAssemblyStore`, ghi tiến độ vào
 * `useSceneFxStore` (scene đọc để dựng tư thế) và báo trạng thái thực tế về store lắp ráp.
 */
export function useMechanismAnimator(): void {
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let resetToken = useAssemblyStore.getState().resetToken;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const assembly = useAssemblyStore.getState();
      const fx = useSceneFxStore.getState();

      if (assembly.resetToken !== resetToken) {
        resetToken = assembly.resetToken;
        fx.setProgress({ ...INITIAL_PROGRESS });
      } else {
        const patch: Partial<MechanismProgress> = {};
        for (const m of PROCEDURAL_MECHANISMS) {
          const current = fx.progress[m.key];
          const target = assembly.requests[m.id] === 'open' ? 1 : 0;
          const next =
            current === target
              ? current
              : target > current
                ? Math.min(target, current + dt * SPEED)
                : Math.max(target, current - dt * SPEED);
          if (next !== current) patch[m.key] = next;
          const state = stateOf(next, target);
          if ((assembly.mechanisms[m.id] ?? 'CLOSED') !== state) assembly.reportMechanismState(m.id, state, m.kind);
        }
        if (Object.keys(patch).length > 0) fx.setProgress(patch);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
}
