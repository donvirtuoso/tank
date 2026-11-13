import { useMemo } from 'react';
import { RATING_KEYS, type Locale, type RatingKey, type SimulatedRatings } from '@/domain/models/types';
import { diffScores, MAX_RATING } from '@/domain/scoring/score';
import { useUiStore } from '@/stores/useUiStore';
import { computeScoreView, useVehicleStore } from '@/stores/useVehicleStore';

const LABELS: Record<Locale, Record<RatingKey, string>> = {
  vi: {
    mobility: 'Cơ động',
    protection: 'Bảo vệ',
    firepower: 'Hoả lực',
    reliability: 'Độ tin cậy',
    concealment: 'Ngụy trang',
  },
  en: {
    mobility: 'Mobility',
    protection: 'Protection',
    firepower: 'Firepower',
    reliability: 'Reliability',
    concealment: 'Concealment',
  },
};

const COPY = {
  vi: {
    title: 'Chỉ số',
    radar: 'Biểu đồ radar chỉ số',
    vsPreview: 'So với cấu hình hiện tại',
    vsPrevious: 'So với cấu hình trước',
  },
  en: {
    title: 'Ratings',
    radar: 'Ratings radar chart',
    vsPreview: 'Compared with current configuration',
    vsPrevious: 'Compared with previous configuration',
  },
} as const;

/** Disclaimer bắt buộc — luôn hiển thị bất kể ngôn ngữ / trạng thái. */
export const STATS_DISCLAIMER =
  'Chỉ số giả lập, chỉ mang tính minh hoạ cho trò chơi/giáo dục, không phản ánh thông số kỹ thuật thực tế.';
const DISCLAIMER_EN = 'Simulated ratings for game/educational illustration only; not real-world specifications.';

export interface Point {
  x: number;
  y: number;
}

/**
 * Đỉnh đa giác radar: trục thứ i hướng lên trên rồi quay theo chiều kim đồng hồ.
 * Giá trị được kẹp vào [0, max].
 */
export function radarPoints(values: readonly number[], radius: number, center: Point, max = MAX_RATING): Point[] {
  const n = values.length;
  return values.map((value, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (Math.min(max, Math.max(0, value)) / max) * radius;
    return { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) };
  });
}

const toPath = (pts: Point[]) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '±0';
}

const SIZE = 180;
const CENTER = { x: SIZE / 2, y: SIZE / 2 };
const RADIUS = 64;

function Radar({ score, reference, label, locale }: { score: SimulatedRatings; reference: SimulatedRatings | null; label: string; locale: Locale }) {
  const values = RATING_KEYS.map((k) => score[k]);
  const axes = radarPoints(RATING_KEYS.map(() => MAX_RATING), RADIUS, CENTER);
  const labelPts = radarPoints(RATING_KEYS.map(() => MAX_RATING), RADIUS + 16, CENTER);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} data-testid="stats-radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={toPath(radarPoints(RATING_KEYS.map(() => MAX_RATING * f), RADIUS, CENTER))}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      ))}
      {axes.map((p, i) => (
        <line key={RATING_KEYS[i]} x1={CENTER.x} y1={CENTER.y} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.2} />
      ))}
      {reference && (
        <polygon
          data-testid="radar-reference"
          points={toPath(radarPoints(RATING_KEYS.map((k) => reference[k]), RADIUS, CENTER))}
          fill="none"
          stroke="#9ca3af"
          strokeDasharray="3 3"
        />
      )}
      <polygon
        data-testid="radar-current"
        points={toPath(radarPoints(values, RADIUS, CENTER))}
        fill="#6b7d2c"
        fillOpacity={0.45}
        stroke="#a3b85a"
      />
      {RATING_KEYS.map((key, i) => {
        const p = labelPts[i] ?? CENTER;
        return (
          <text key={key} x={p.x} y={p.y} fontSize={9} textAnchor="middle" dominantBaseline="middle" fill="currentColor">
            {LABELS[locale][key]}
          </text>
        );
      })}
    </svg>
  );
}

export interface StatsPanelProps {
  className?: string;
}

/** Chỉ số giả lập của cấu hình (hoặc preview): progress bar, số, delta, radar và disclaimer. */
export function StatsPanel({ className }: StatsPanelProps) {
  const locale = useUiStore((s) => s.locale);
  const t = COPY[locale];
  const configuration = useVehicleStore((s) => s.configuration);
  const preview = useVehicleStore((s) => s.preview);
  const past = useVehicleStore((s) => s.past);
  const catalog = useVehicleStore((s) => s.catalog);

  const view = useMemo(
    () => computeScoreView({ configuration, preview, past, catalog }),
    [configuration, preview, past, catalog],
  );
  const delta = view.reference ? diffScores(view.reference, view.score) : null;

  return (
    <section aria-label={t.title} className={className}>
      <h2 className="mb-2 text-sm font-semibold">{t.title}</h2>
      {view.basis !== 'none' && (
        <p className="mb-1 text-[11px] text-gunmetal-400" data-testid="delta-basis">
          {view.basis === 'preview' ? t.vsPreview : t.vsPrevious}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {RATING_KEYS.map((key) => {
          const value = view.score[key];
          const d = delta?.[key] ?? 0;
          return (
            <li key={key} data-testid={`stat-${key}`} className="text-xs">
              <div className="flex items-center justify-between">
                <span>{LABELS[locale][key]}</span>
                <span>
                  <span data-testid={`value-${key}`} className="font-mono">
                    {value}
                  </span>
                  {delta && (
                    <span
                      data-testid={`delta-${key}`}
                      className={`ml-1 font-mono ${d > 0 ? 'text-green-400' : d < 0 ? 'text-red-400' : 'text-gunmetal-400'}`}
                    >
                      {formatDelta(d)}
                    </span>
                  )}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={LABELS[locale][key]}
                aria-valuemin={0}
                aria-valuemax={MAX_RATING}
                aria-valuenow={value}
                className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-gunmetal-700"
              >
                <div className="h-full bg-olive-500" style={{ width: `${(value / MAX_RATING) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-center">
        <Radar score={view.score} reference={view.reference} label={t.radar} locale={locale} />
      </div>
      <p role="note" data-testid="stats-disclaimer" className="mt-2 text-[11px] italic text-gunmetal-400">
        {STATS_DISCLAIMER}
        {locale === 'en' && <span lang="en"> {DISCLAIMER_EN}</span>}
      </p>
    </section>
  );
}

export default StatsPanel;
