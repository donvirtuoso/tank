/**
 * Toolbar tháo/lắp: nút mở/đóng nắp, tháo/lắp, slider explode 0–100 theo 6 giai đoạn,
 * explode all / collapse / explode nhóm chọn / reset, X-Ray + cutaway, turret yaw & gun elevation.
 * Chỉ ghi ý định vào useAssemblyStore; lớp scene thực thi animation.
 */
import { EXPLODE_STAGES, activeStage } from '../../scene/animations/explode';
import {
  GUN_ELEVATION_LIMITS,
  type MechanismInfo,
  TANK_MECHANISM_LIST,
  TURRET_YAW_LIMITS,
} from '../../scene/animations/mechanisms';
import type { MechanismState } from '../../scene/animations/transformEngine';
import type { ClipAxis } from '../../scene/materials/xray';
import { useAssemblyStore } from '../../stores/useAssemblyStore';

const STATE_LABEL: Record<MechanismState, string> = {
  CLOSED: 'Đóng',
  OPENING: 'Đang mở…',
  OPEN: 'Mở',
  CLOSING: 'Đang đóng…',
};

const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI);
const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface AssemblyControlsProps {
  mechanisms?: readonly MechanismInfo[];
  className?: string;
}

export function AssemblyControls({ mechanisms = TANK_MECHANISM_LIST, className }: AssemblyControlsProps) {
  const store = useAssemblyStore();
  const stage = activeStage(store.explodeValue);

  return (
    <div className={className ?? 'assembly-controls'} role="toolbar" aria-label="Điều khiển tháo lắp">
      <section aria-label="Nắp và tháo lắp">
        <h3>Nắp / tháo lắp</h3>
        {mechanisms.map((m) => {
          const state = store.mechanisms[m.id] ?? 'CLOSED';
          const opening = store.requests[m.id] === 'open';
          const verb = m.kind === 'detach' ? (opening ? 'Lắp lại' : 'Tháo') : opening ? 'Đóng' : 'Mở';
          return (
            <div key={m.id} className="assembly-controls__row">
              <span>{m.label}</span>
              <button type="button" onClick={() => store.toggleMechanism(m.id)} data-testid={`toggle-${m.id}`}>
                {verb}
              </button>
              <small aria-live="polite">{STATE_LABEL[state]}</small>
            </div>
          );
        })}
      </section>

      <section aria-label="Exploded view">
        <h3>Exploded view</h3>
        <label>
          Mức tách: {Math.round(store.explodeValue)}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={store.explodeValue}
            onChange={(e) => store.setExplodeValue(Number(e.target.value))}
            aria-label="Mức explode 0 đến 100"
          />
        </label>
        <div>
          Giai đoạn: {stage === 0 ? '—' : `${stage}/6 · ${EXPLODE_STAGES[stage - 1].label}`}
        </div>
        <fieldset>
          <legend>Nhóm chọn</legend>
          {EXPLODE_STAGES.map((s) => (
            <label key={s.key}>
              <input
                type="checkbox"
                checked={store.explodeSelection.includes(s.key)}
                onChange={() => store.toggleExplodeSelection(s.key)}
              />
              {s.stage}. {s.label}
            </label>
          ))}
        </fieldset>
        <div className="assembly-controls__buttons">
          <button type="button" onClick={store.explodeAll}>Explode all</button>
          <button type="button" onClick={store.collapse}>Collapse</button>
          <button
            type="button"
            disabled={store.explodeSelection.length === 0}
            onClick={() => store.explodeSelected(store.explodeSelection)}
          >
            Explode nhóm chọn
          </button>
          <button type="button" onClick={store.resetAll}>Reset</button>
        </div>
      </section>

      <section aria-label="X-Ray">
        <h3>X-Ray / Cutaway</h3>
        <label>
          <input
            type="checkbox"
            checked={store.xray.enabled}
            onChange={(e) => store.setXRay({ enabled: e.target.checked })}
          />
          X-Ray
        </label>
        <label>
          <input
            type="checkbox"
            checked={store.xray.clipping}
            disabled={!store.xray.enabled}
            onChange={(e) => store.setXRay({ clipping: e.target.checked })}
          />
          Mặt cắt
        </label>
        <select
          value={store.xray.clipAxis}
          disabled={!store.xray.clipping}
          onChange={(e) => store.setXRay({ clipAxis: e.target.value as ClipAxis })}
          aria-label="Trục cắt"
        >
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
        <input
          type="range"
          min={-5}
          max={5}
          step={0.05}
          value={store.xray.clipOffset}
          disabled={!store.xray.clipping}
          onChange={(e) => store.setXRay({ clipOffset: Number(e.target.value) })}
          aria-label="Vị trí mặt cắt"
        />
        <button type="button" onClick={store.resetXRay}>Reset X-Ray</button>
      </section>

      <section aria-label="Tháp pháo và nòng">
        <h3>Tháp pháo / nòng (hình ảnh)</h3>
        <label>
          Xoay tháp: {toDeg(store.turretYaw)}°
          <input
            type="range"
            min={toDeg(TURRET_YAW_LIMITS.min)}
            max={toDeg(TURRET_YAW_LIMITS.max)}
            step={1}
            value={toDeg(store.turretYaw)}
            onChange={(e) => store.setTurretYaw(toRad(Number(e.target.value)))}
          />
        </label>
        <label>
          Góc nâng nòng: {toDeg(store.gunElevation)}°
          <input
            type="range"
            min={toDeg(GUN_ELEVATION_LIMITS.min)}
            max={toDeg(GUN_ELEVATION_LIMITS.max)}
            step={1}
            value={toDeg(store.gunElevation)}
            onChange={(e) => store.setGunElevation(toRad(Number(e.target.value)))}
          />
        </label>
      </section>
    </div>
  );
}

export default AssemblyControls;
