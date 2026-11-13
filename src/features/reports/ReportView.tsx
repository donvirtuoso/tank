import { FileText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  RATING_KEYS,
  type Catalog,
  type Locale,
  type LocalizedText,
  type MaterialPreset,
  type RatingKey,
  type RatingModifiers,
  type SchemaVersion,
  type SimulatedRatings,
  type VehicleConfiguration,
} from '@/domain/models/types';
import { validateConfiguration } from '@/domain/rules/compatibility';
import { BASE_RATING, MAX_RATING, MIN_RATING, computeScore } from '@/domain/scoring/score';
import { formatDelta } from '@/features/configurator/StatsPanel';
import { designFileName, type ThumbnailOptions } from '@/services/importExport';
import { captureSceneScreenshot, findSceneCanvas, isImageDataUrl } from '@/services/screenshot';
import { useUiStore } from '@/stores/useUiStore';
import { MATERIAL_PRESET_COLORS, cloneConfiguration, useVehicleStore } from '@/stores/useVehicleStore';
import './print.css';

/**
 * Báo cáo cấu hình xe tăng mô hình: 12 mục, ảnh chụp cảnh 3D, in khổ A4 (window.print) và
 * xuất JSON. Mọi văn bản được hiển thị qua JSX (React tự escape) — không dùng
 * `dangerouslySetInnerHTML`.
 */

export const REPORT_VERSION = 1 as const;

/**
 * 12 mục của báo cáo, theo thứ tự hiển thị.
 *
 * Đối chiếu với danh sách 12 mục trong spec (mục 20) cho người kiểm thử:
 * - Tên thiết kế, mã cấu hình, ngày tạo (3 mục riêng trong spec) → gộp trong `overview`
 *   (tên, mã) và dòng "Tạo lúc" ở đầu báo cáo.
 * - Ảnh chụp mô hình → `snapshot`.
 * - Biến thể đã lắp (installed variants) → `parts` (+ thống kê `categories`, `summary`).
 * - Màu/vật liệu (material appearance) → `paint` và cột "Vật liệu" trong `parts`.
 * - Chỉ số giả lập → `ratings`; phần bổ sung `contributions` giải thích từng chi tiết.
 * - Tương thích → `compatibility`; phần bổ sung `empty-slots`.
 * - Ghi chú giáo dục → `notes`; tuyên bố miễn trừ → `disclaimer` (và hộp ở đầu báo cáo).
 */
export const REPORT_SECTION_IDS = [
  'overview',
  'snapshot',
  'summary',
  'parts',
  'categories',
  'ratings',
  'contributions',
  'compatibility',
  'empty-slots',
  'paint',
  'notes',
  'disclaimer',
] as const;
export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

/**
 * Tuyên bố bắt buộc: chỉ số là GIẢ LẬP. Không câu nào trong báo cáo được trình bày chỉ số
 * như thông số thực.
 */
export const REPORT_DISCLAIMER: LocalizedText = {
  vi: 'Mọi chỉ số trong báo cáo này là điểm giả lập (thang 0–100) dùng cho trò chơi và mục đích giáo dục. Chúng không phải thông số kỹ thuật thực tế và không phản ánh bất kỳ phương tiện có thật nào. Kích thước mô hình tính theo đơn vị cảnh 3D, không phải đơn vị đo thực.',
  en: 'All ratings in this report are simulated scores (0–100 scale) for game and educational purposes. They are not real-world technical specifications and do not describe any actual vehicle. Model dimensions are in 3D scene units, not real measurement units.',
};

const RATING_LABELS: Record<Locale, Record<RatingKey, string>> = {
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
    title: 'Báo cáo cấu hình xe tăng mô hình',
    generatedAt: 'Tạo lúc',
    sections: {
      overview: '1. Thông tin chung',
      snapshot: '2. Ảnh chụp mô hình 3D',
      summary: '3. Tóm tắt cấu hình',
      parts: '4. Danh sách chi tiết',
      categories: '5. Thống kê theo nhóm chi tiết',
      ratings: '6. Chỉ số giả lập',
      contributions: '7. Đóng góp vào chỉ số giả lập theo chi tiết',
      compatibility: '8. Kiểm tra tương thích',
      'empty-slots': '9. Vị trí gắn còn trống',
      paint: '10. Màu sơn & vật liệu',
      notes: '11. Ghi chú giáo dục',
      disclaimer: '12. Phương pháp tính & tuyên bố miễn trừ',
    } satisfies Record<ReportSectionId, string>,
    name: 'Tên thiết kế',
    id: 'Mã cấu hình',
    schema: 'Phiên bản dữ liệu',
    language: 'Ngôn ngữ',
    languageName: 'Tiếng Việt',
    snapshotAlt: 'Ảnh chụp mô hình 3D của cấu hình hiện tại',
    snapshotCaption: 'Ảnh chụp từ khung nhìn 3D tại thời điểm tạo báo cáo.',
    snapshotPending: 'Đang chụp ảnh mô hình…',
    snapshotMissing: 'Không chụp được ảnh (chưa có khung nhìn 3D hoặc trình duyệt không cho phép).',
    partCount: 'Số chi tiết',
    slotsFilled: 'Vị trí đã gắn',
    requiredFilled: 'Vị trí bắt buộc đã gắn',
    status: 'Trạng thái',
    valid: 'Hợp lệ',
    invalid: (n: number) => `Có ${n} lỗi tương thích`,
    slot: 'Vị trí',
    part: 'Chi tiết',
    category: 'Nhóm',
    material: 'Vật liệu (preset)',
    count: 'Số lượng',
    rating: 'Chỉ số giả lập',
    score: 'Điểm giả lập',
    ratingsNote: `Điểm giả lập trên thang ${MIN_RATING}–${MAX_RATING}, chỉ dùng để so sánh tương đối giữa các cấu hình trong ứng dụng.`,
    noModifiers: 'Không có chi tiết nào thay đổi điểm giả lập.',
    noIssues: 'Không phát hiện lỗi tương thích.',
    noEmptySlots: 'Mọi vị trí gắn đều đã có chi tiết.',
    required: 'Bắt buộc',
    optional: 'Tuỳ chọn',
    paintVariant: 'Lớp sơn',
    paintColor: 'Màu hiển thị',
    paintNone: 'Chưa chọn lớp sơn (dùng màu mặc định).',
    noNotes: 'Không có ghi chú.',
    method: `Cách tính: mỗi chỉ số bắt đầu từ ${BASE_RATING}, cộng hệ số của từng chi tiết hợp lệ, làm tròn và giới hạn trong khoảng ${MIN_RATING}–${MAX_RATING}.`,
    print: 'In / Lưu PDF',
    retake: 'Chụp lại ảnh',
    exportJson: 'Xuất JSON',
    close: 'Đóng',
    open: 'Báo cáo',
    dialog: 'Báo cáo cấu hình',
  },
  en: {
    title: 'Model tank configuration report',
    generatedAt: 'Generated at',
    sections: {
      overview: '1. General information',
      snapshot: '2. 3D model snapshot',
      summary: '3. Configuration summary',
      parts: '4. Part list',
      categories: '5. Parts by category',
      ratings: '6. Simulated ratings',
      contributions: '7. Simulated rating contributions by part',
      compatibility: '8. Compatibility check',
      'empty-slots': '9. Empty mount slots',
      paint: '10. Paint & materials',
      notes: '11. Educational notes',
      disclaimer: '12. Method & disclaimer',
    } satisfies Record<ReportSectionId, string>,
    name: 'Design name',
    id: 'Configuration id',
    schema: 'Data schema version',
    language: 'Language',
    languageName: 'English',
    snapshotAlt: '3D model snapshot of the current configuration',
    snapshotCaption: 'Captured from the 3D viewport when the report was generated.',
    snapshotPending: 'Capturing model snapshot…',
    snapshotMissing: 'No snapshot available (no 3D viewport, or the browser blocked capture).',
    partCount: 'Parts',
    slotsFilled: 'Slots filled',
    requiredFilled: 'Required slots filled',
    status: 'Status',
    valid: 'Valid',
    invalid: (n: number) => `${n} compatibility issue(s)`,
    slot: 'Slot',
    part: 'Part',
    category: 'Category',
    material: 'Material (preset)',
    count: 'Count',
    rating: 'Simulated rating',
    score: 'Simulated score',
    ratingsNote: `Simulated scores on a ${MIN_RATING}–${MAX_RATING} scale, only meant for relative comparison between configurations in this app.`,
    noModifiers: 'No part changes the simulated scores.',
    noIssues: 'No compatibility issues found.',
    noEmptySlots: 'Every mount slot is filled.',
    required: 'Required',
    optional: 'Optional',
    paintVariant: 'Paint',
    paintColor: 'Display colour',
    paintNone: 'No paint selected (default colour).',
    noNotes: 'No notes.',
    method: `Method: each rating starts at ${BASE_RATING}, adds the modifier of every valid part, then is rounded and clamped to ${MIN_RATING}–${MAX_RATING}.`,
    print: 'Print / Save PDF',
    retake: 'Retake snapshot',
    exportJson: 'Export JSON',
    close: 'Close',
    open: 'Report',
    dialog: 'Configuration report',
  },
} as const;

// ---------------------------------------------------------------------------
// Dữ liệu báo cáo (thuần, serialisable → xuất JSON)
// ---------------------------------------------------------------------------

export interface ReportPart {
  instanceId: string;
  slotId: string;
  slotName: string;
  variantId: string;
  variantName: string;
  categoryId: string;
  categoryName: string;
  materialPreset: MaterialPreset | null;
}

export interface ReportData {
  reportVersion: typeof REPORT_VERSION;
  generatedAt: string;
  locale: Locale;
  disclaimer: string;
  design: { id: string; name: string; schemaVersion: SchemaVersion };
  /** Data URL ảnh PNG/JPEG của cảnh 3D; `null` nếu không chụp được. */
  screenshotDataUrl: string | null;
  summary: {
    partCount: number;
    filledSlots: number;
    totalSlots: number;
    requiredFilled: number;
    requiredTotal: number;
    valid: boolean;
    issueCount: number;
  };
  parts: ReportPart[];
  categories: { id: string; name: string; count: number }[];
  ratings: {
    simulated: true;
    scale: { min: number; max: number; base: number };
    values: SimulatedRatings;
  };
  contributions: { instanceId: string; variantName: string; modifiers: RatingModifiers }[];
  compatibility: { code: string; message: string }[];
  emptySlots: { slotId: string; slotName: string; required: boolean }[];
  paint: { variantId: string; variantName: string; materialPreset: MaterialPreset; color: string } | null;
  notes: { variantId: string; variantName: string; note: string }[];
  configuration: VehicleConfiguration;
}

export interface BuildReportOptions {
  locale?: Locale;
  screenshotDataUrl?: string | null;
  now?: () => string;
}

/** Dựng dữ liệu báo cáo từ cấu hình hiện tại và catalog (hàm thuần). */
export function buildReportData(
  configuration: VehicleConfiguration,
  catalog: Catalog,
  { locale = 'vi', screenshotDataUrl = null, now = () => new Date().toISOString() }: BuildReportOptions = {},
): ReportData {
  const pick = (vi: string, en: string) => (locale === 'vi' ? vi : en);
  const variants = new Map(catalog.variants.map((v) => [v.id, v]));
  const categories = new Map(catalog.categories.map((c) => [c.id, c]));
  const slots = catalog.compatibility.slots;
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const parts: ReportPart[] = configuration.instances.map((inst) => {
    const variant = variants.get(inst.variantId);
    const slot = slotById.get(inst.slotId);
    const category = variant ? categories.get(variant.categoryId) : undefined;
    return {
      instanceId: inst.instanceId,
      slotId: inst.slotId,
      slotName: slot ? pick(slot.nameVi, slot.nameEn) : inst.slotId,
      variantId: inst.variantId,
      variantName: variant ? pick(variant.nameVi, variant.nameEn) : inst.variantId,
      categoryId: variant?.categoryId ?? '',
      categoryName: category ? pick(category.nameVi, category.nameEn) : (variant?.categoryId ?? ''),
      materialPreset: variant?.materialPreset ?? null,
    };
  });

  const countByCategory = new Map<string, number>();
  for (const p of parts) {
    if (p.categoryId) countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
  }
  const categoryRows = [...catalog.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((c) => countByCategory.has(c.id))
    .map((c) => ({ id: c.id, name: pick(c.nameVi, c.nameEn), count: countByCategory.get(c.id) ?? 0 }));

  const filled = new Set(configuration.instances.map((i) => i.slotId));
  const issues = validateConfiguration(configuration, catalog);

  const contributions = configuration.instances.flatMap((inst) => {
    const variant = variants.get(inst.variantId);
    if (!variant) return [];
    const modifiers = Object.fromEntries(
      RATING_KEYS.filter((k) => (variant.simulatedRatings[k] ?? 0) !== 0).map((k) => [k, variant.simulatedRatings[k]]),
    ) as RatingModifiers;
    return Object.keys(modifiers).length > 0
      ? [{ instanceId: inst.instanceId, variantName: pick(variant.nameVi, variant.nameEn), modifiers }]
      : [];
  });

  const paintId = configuration.instances.find((i) => i.slotId === 'camouflage')?.variantId;
  const paintVariant = paintId ? variants.get(paintId) : undefined;

  const seenNotes = new Set<string>();
  const notes = configuration.instances.flatMap((inst) => {
    const variant = variants.get(inst.variantId);
    if (!variant || seenNotes.has(variant.id)) return [];
    seenNotes.add(variant.id);
    const note = variant.educationalNotes[locale];
    return note ? [{ variantId: variant.id, variantName: pick(variant.nameVi, variant.nameEn), note }] : [];
  });

  return {
    reportVersion: REPORT_VERSION,
    generatedAt: now(),
    locale,
    disclaimer: REPORT_DISCLAIMER[locale],
    design: { id: configuration.id, name: configuration.name, schemaVersion: configuration.schemaVersion },
    screenshotDataUrl: isImageDataUrl(screenshotDataUrl) ? screenshotDataUrl : null,
    summary: {
      partCount: configuration.instances.length,
      filledSlots: slots.filter((s) => filled.has(s.id)).length,
      totalSlots: slots.length,
      requiredFilled: slots.filter((s) => s.required && filled.has(s.id)).length,
      requiredTotal: slots.filter((s) => s.required).length,
      valid: issues.length === 0,
      issueCount: issues.length,
    },
    parts,
    categories: categoryRows,
    ratings: {
      simulated: true,
      scale: { min: MIN_RATING, max: MAX_RATING, base: BASE_RATING },
      values: computeScore(configuration, catalog),
    },
    contributions,
    compatibility: issues.map((i) => ({ code: i.code, message: i.message[locale] })),
    emptySlots: slots
      .filter((s) => !filled.has(s.id))
      .map((s) => ({ slotId: s.id, slotName: pick(s.nameVi, s.nameEn), required: s.required })),
    paint: paintVariant
      ? {
          variantId: paintVariant.id,
          variantName: pick(paintVariant.nameVi, paintVariant.nameEn),
          materialPreset: paintVariant.materialPreset,
          color: MATERIAL_PRESET_COLORS[paintVariant.materialPreset],
        }
      : null,
    notes,
    configuration: cloneConfiguration(configuration),
  };
}

// ---------------------------------------------------------------------------
// Xuất JSON
// ---------------------------------------------------------------------------

export const REPORT_FILE_MIME = 'application/json';

export function serializeReport(data: ReportData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function reportFileName(data: Pick<ReportData, 'design'>): string {
  return designFileName(data.design).replace(/^tank-design-/, 'tank-report-');
}

/** Tải dữ liệu báo cáo xuống dưới dạng tệp JSON (Blob + thẻ <a download>). */
export function downloadReport(data: ReportData, doc: Document = document): void {
  const blob = new Blob([serializeReport(data)], { type: REPORT_FILE_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = reportFileName(data);
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
// Hiển thị
// ---------------------------------------------------------------------------

const formatDate = (iso: string, locale: Locale) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB');
};

function Section({ id, title, long, children }: { id: ReportSectionId; title: string; long?: boolean; children: ReactNode }) {
  return (
    <section
      className={long ? 'report-section report-section--long' : 'report-section'}
      data-report-section={id}
      aria-labelledby={`report-${id}`}
    >
      <h2 id={`report-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

export interface ReportViewProps {
  data: ReportData;
  /** `true` khi ảnh chụp đang được tạo. */
  snapshotPending?: boolean;
}

/** Nội dung báo cáo (một "trang" A4). Chỉ hiển thị dữ liệu — không đọc store. */
export function ReportView({ data, snapshotPending = false }: ReportViewProps) {
  const t = COPY[data.locale];
  const labels = RATING_LABELS[data.locale];
  const s = data.summary;

  return (
    <article className="report-page" data-testid="report-view" lang={data.locale}>
      <h1>{t.title}</h1>
      <p className="report-subtitle">
        {t.generatedAt}: {formatDate(data.generatedAt, data.locale)}
      </p>
      <p role="note" className="report-disclaimer" data-testid="report-disclaimer-top">
        {data.disclaimer}
      </p>

      <Section id="overview" title={t.sections.overview}>
        <dl className="report-dl">
          <dt>{t.name}</dt>
          <dd data-testid="report-design-name">{data.design.name}</dd>
          <dt>{t.id}</dt>
          <dd>{data.design.id}</dd>
          <dt>{t.schema}</dt>
          <dd>{data.design.schemaVersion}</dd>
          <dt>{t.language}</dt>
          <dd>{t.languageName}</dd>
        </dl>
      </Section>

      <Section id="snapshot" title={t.sections.snapshot}>
        {data.screenshotDataUrl ? (
          <figure className="report-figure">
            <img src={data.screenshotDataUrl} alt={t.snapshotAlt} data-testid="report-snapshot" />
            <figcaption>{t.snapshotCaption}</figcaption>
          </figure>
        ) : (
          <p className="report-muted" data-testid="report-snapshot-missing">
            {snapshotPending ? t.snapshotPending : t.snapshotMissing}
          </p>
        )}
      </Section>

      <Section id="summary" title={t.sections.summary}>
        <dl className="report-dl">
          <dt>{t.partCount}</dt>
          <dd>{s.partCount}</dd>
          <dt>{t.slotsFilled}</dt>
          <dd>
            {s.filledSlots}/{s.totalSlots}
          </dd>
          <dt>{t.requiredFilled}</dt>
          <dd>
            {s.requiredFilled}/{s.requiredTotal}
          </dd>
          <dt>{t.status}</dt>
          <dd data-testid="report-status">{s.valid ? t.valid : t.invalid(s.issueCount)}</dd>
        </dl>
      </Section>

      <Section id="parts" title={t.sections.parts} long>
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{t.slot}</th>
              <th scope="col">{t.part}</th>
              <th scope="col">{t.category}</th>
              <th scope="col">{t.material}</th>
            </tr>
          </thead>
          <tbody>
            {data.parts.map((p) => (
              <tr key={p.instanceId} data-testid="report-part-row">
                <td>{p.slotName}</td>
                <td>{p.variantName}</td>
                <td>{p.categoryName}</td>
                <td>{p.materialPreset ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="categories" title={t.sections.categories}>
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{t.category}</th>
              <th scope="col">{t.count}</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="ratings" title={t.sections.ratings}>
        <p className="report-muted">{t.ratingsNote}</p>
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{t.rating}</th>
              <th scope="col">{t.score}</th>
            </tr>
          </thead>
          <tbody>
            {RATING_KEYS.map((key) => {
              const value = data.ratings.values[key];
              const pct = ((value - data.ratings.scale.min) / (data.ratings.scale.max - data.ratings.scale.min)) * 100;
              return (
                <tr key={key} data-testid={`report-rating-${key}`}>
                  <td>{labels[key]}</td>
                  <td>
                    <span className="num">
                      {value}/{data.ratings.scale.max}
                    </span>
                    <span className="report-bar" aria-hidden>
                      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section id="contributions" title={t.sections.contributions} long>
        {data.contributions.length === 0 ? (
          <p className="report-muted">{t.noModifiers}</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{t.part}</th>
                {RATING_KEYS.map((key) => (
                  <th key={key} scope="col">
                    {labels[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.contributions.map((c) => (
                <tr key={c.instanceId}>
                  <td>{c.variantName}</td>
                  {RATING_KEYS.map((key) => {
                    const modifier = c.modifiers[key];
                    return (
                      <td key={key} className="num">
                        {modifier === undefined ? '' : formatDelta(modifier)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="compatibility" title={t.sections.compatibility}>
        {data.compatibility.length === 0 ? (
          <p>{t.noIssues}</p>
        ) : (
          <ul className="report-list" data-testid="report-issues">
            {data.compatibility.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="empty-slots" title={t.sections['empty-slots']}>
        {data.emptySlots.length === 0 ? (
          <p>{t.noEmptySlots}</p>
        ) : (
          <ul className="report-list">
            {data.emptySlots.map((slot) => (
              <li key={slot.slotId}>
                {slot.slotName} — {slot.required ? t.required : t.optional}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="paint" title={t.sections.paint}>
        {data.paint ? (
          <dl className="report-dl">
            <dt>{t.paintVariant}</dt>
            <dd>{data.paint.variantName}</dd>
            <dt>{t.paintColor}</dt>
            <dd>
              <span className="report-swatch" style={{ background: data.paint.color }} aria-hidden />
              {data.paint.color} ({data.paint.materialPreset})
            </dd>
          </dl>
        ) : (
          <p>{t.paintNone}</p>
        )}
      </Section>

      <Section id="notes" title={t.sections.notes} long>
        {data.notes.length === 0 ? (
          <p>{t.noNotes}</p>
        ) : (
          <ul className="report-list">
            {data.notes.map((n) => (
              <li key={n.variantId}>
                <strong>{n.variantName}:</strong> {n.note}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="disclaimer" title={t.sections.disclaimer}>
        <p>{t.method}</p>
        <p role="note" className="report-disclaimer" data-testid="report-disclaimer">
          {data.disclaimer}
        </p>
      </Section>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Overlay (in / xuất JSON) và nút mở
// ---------------------------------------------------------------------------

/** Lớp gắn lên <body> khi overlay mở để print CSS chỉ in báo cáo. */
export const REPORT_BODY_CLASS = 'report-printing';

export interface ReportOverlayProps {
  onClose: () => void;
  /** Canvas cảnh 3D để chụp; mặc định {@link findSceneCanvas}. */
  getCanvas?: () => HTMLCanvasElement | null;
  now?: () => string;
  /** Mặc định `window.print`. */
  print?: () => void;
  /** Mặc định {@link downloadReport}. */
  download?: (data: ReportData) => void;
  /**
   * Tuỳ chọn chụp ảnh, ví dụ `{ render: () => gl.render(scene, camera) }` để vẽ lại khung
   * hình ngay trước khi chụp khi Canvas dùng `frameloop="demand"` / không bật
   * `preserveDrawingBuffer`.
   */
  captureOptions?: ThumbnailOptions;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Giữ Tab / Shift+Tab trong `container` (focus trap đơn giản cho hộp thoại modal). */
export function trapTabKey(e: KeyboardEvent, container: HTMLElement | null): void {
  if (e.key !== 'Tab' || !container) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const active = container.ownerDocument.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/** Overlay toàn màn hình hiển thị báo cáo của cấu hình hiện tại kèm nút In và Xuất JSON. */
export function ReportOverlay({
  onClose,
  getCanvas = findSceneCanvas,
  now,
  print = () => window.print(),
  download = downloadReport,
  captureOptions,
}: ReportOverlayProps) {
  const locale = useUiStore((s) => s.locale);
  const configuration = useVehicleStore((s) => s.configuration);
  const catalog = useVehicleStore((s) => s.catalog);
  const t = COPY[locale];
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [captureNonce, setCaptureNonce] = useState(0);
  const [generatedAt] = useState(() => (now ?? (() => new Date().toISOString()))());
  const captureOptionsRef = useRef(captureOptions);
  captureOptionsRef.current = captureOptions;

  // Chụp ảnh khi mở báo cáo và mỗi lần bấm "Chụp lại" (canvas vẫn ở trong DOM phía sau overlay).
  useEffect(() => {
    let alive = true;
    setPending(true);
    captureSceneScreenshot(getCanvas, captureOptionsRef.current)
      .catch(() => undefined)
      .then((url) => {
        if (!alive) return;
        // Chụp lại thất bại thì giữ ảnh cũ thay vì xoá mất.
        setScreenshot((prev) => url ?? prev);
        setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [getCanvas, captureNonce]);

  // Khi mở: đặt focus vào nút Đóng; khi đóng: trả focus về phần tử đã mở báo cáo.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(REPORT_BODY_CLASS);
    closeRef.current?.focus();
    return () => {
      document.body.classList.remove(REPORT_BODY_CLASS);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else trapTabKey(e, dialogRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const data = useMemo(
    () => buildReportData(configuration, catalog, { locale, screenshotDataUrl: screenshot, now: () => generatedAt }),
    [configuration, catalog, locale, screenshot, generatedAt],
  );

  return (
    <div ref={dialogRef} className="report-overlay" role="dialog" aria-modal="true" aria-label={t.dialog}>
      <div className="report-toolbar" role="toolbar" aria-label={t.dialog}>
        <button type="button" onClick={print}>
          {t.print}
        </button>
        <button type="button" disabled={pending} onClick={() => setCaptureNonce((n) => n + 1)}>
          {t.retake}
        </button>
        <button type="button" onClick={() => download(data)}>
          {t.exportJson}
        </button>
        <button ref={closeRef} type="button" onClick={onClose}>
          {t.close}
        </button>
      </div>
      <ReportView data={data} snapshotPending={pending} />
    </div>
  );
}

/** Nút mở báo cáo (đặt trên thanh công cụ); overlay được portal vào <body>. */
export function ReportButton({ className = 'tool-btn' }: { className?: string }) {
  const locale = useUiStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {COPY[locale].open}
      </button>
      {open && createPortal(<ReportOverlay onClose={onClose} />, document.body)}
    </>
  );
}

export default ReportView;
