import { useMemo, useState } from 'react';
import type { ComponentVariant, Locale } from '@/domain/models/types';
import type { CompatibilityIssue } from '@/domain/rules/compatibility';
import { useToastStore } from '@/stores/useToastStore';
import { useUiStore } from '@/stores/useUiStore';
import {
  MATERIAL_PRESET_COLORS,
  MODEL_VISIBLE_SLOTS,
  newIssues,
  selectCanRedo,
  selectCanUndo,
  swapSlot,
  useVehicleStore,
  variantInSlot,
} from '@/stores/useVehicleStore';

const COPY = {
  vi: {
    title: 'Thiết kế',
    modules: 'Module',
    variants: 'Biến thể',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    dirty: 'Chưa lưu',
    clean: 'Đã lưu',
    current: 'Đang dùng',
    incompatible: 'Không tương thích',
    none: 'Không gắn',
    onModel: '3D',
    onModelHint: 'Thay đổi hiển thị trên mô hình',
    previewing: 'Đang xem trước',
    confirm: 'Xác nhận',
    cancel: 'Huỷ',
    rejected: 'Không thể áp dụng',
    dismiss: 'Đóng',
    paint: 'Sơn / vật liệu',
    material: 'Vật liệu',
    pickModule: 'Chọn một module để xem các biến thể.',
  },
  en: {
    title: 'Design',
    modules: 'Modules',
    variants: 'Variants',
    undo: 'Undo',
    redo: 'Redo',
    dirty: 'Unsaved',
    clean: 'Saved',
    current: 'Current',
    incompatible: 'Incompatible',
    none: 'None',
    onModel: '3D',
    onModelHint: 'Changes are visible on the model',
    previewing: 'Previewing',
    confirm: 'Confirm',
    cancel: 'Cancel',
    rejected: 'Cannot apply',
    dismiss: 'Dismiss',
    paint: 'Paint / material',
    material: 'Material',
    pickModule: 'Pick a module to see its variants.',
  },
} as const;

const PAINT_SLOT = 'camouflage';

const nameOf = (v: { nameVi: string; nameEn: string }, locale: Locale) =>
  locale === 'vi' ? v.nameVi : v.nameEn;

function IssueList({ issues, locale }: { issues: CompatibilityIssue[]; locale: Locale }) {
  return (
    <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-300">
      {issues.map((i, idx) => (
        <li key={`${i.code}-${i.ruleId ?? ''}-${idx}`}>{i.message[locale]}</li>
      ))}
    </ul>
  );
}

export interface DesignPanelProps {
  className?: string;
  /** Module chọn sẵn khi mở panel. */
  initialSlotId?: string;
}

/**
 * Panel Design: chọn module → danh sách biến thể (đánh dấu không tương thích kèm lý do)
 * → xem trước trên mô hình → xác nhận (kiểm tra tương thích) → cập nhật cấu hình.
 */
export function DesignPanel({ className, initialSlotId = 'turret' }: DesignPanelProps) {
  const locale = useUiStore((s) => s.locale);
  const t = COPY[locale];
  const catalog = useVehicleStore((s) => s.catalog);
  const configuration = useVehicleStore((s) => s.configuration);
  const preview = useVehicleStore((s) => s.preview);
  const dirty = useVehicleStore((s) => s.dirty);
  const lastRejection = useVehicleStore((s) => s.lastRejection);
  const canUndo = useVehicleStore(selectCanUndo);
  const canRedo = useVehicleStore(selectCanRedo);
  const startPreview = useVehicleStore((s) => s.startPreview);
  const cancelPreview = useVehicleStore((s) => s.cancelPreview);
  const confirmPreview = useVehicleStore((s) => s.confirmPreview);
  const applyChange = useVehicleStore((s) => s.applyChange);
  const dismissRejection = useVehicleStore((s) => s.dismissRejection);
  const undo = useVehicleStore((s) => s.undo);
  const redo = useVehicleStore((s) => s.redo);
  const pushToast = useToastStore((s) => s.push);

  const [slotId, setSlotId] = useState<string | null>(initialSlotId);

  const slots = catalog.compatibility.slots;
  const slot = slots.find((s) => s.id === slotId) ?? null;
  const visibleSlots = new Set<string>(MODEL_VISIBLE_SLOTS);

  /** Mọi biến thể của slot, kèm lỗi tương thích nếu chọn (KHÔNG lọc bỏ biến thể lỗi). */
  const options = useMemo(() => {
    if (!slot) return [];
    const candidates = catalog.variants.filter(
      (v) =>
        slot.acceptedCategories.includes(v.categoryId) &&
        (!slot.acceptedVariantIds || slot.acceptedVariantIds.includes(v.id)),
    );
    const list: { variant: ComponentVariant | null; issues: CompatibilityIssue[] }[] = candidates.map((variant) => ({
      variant,
      issues: newIssues(configuration, swapSlot(configuration, slot.id, variant.id), catalog),
    }));
    if (!slot.required) {
      list.push({ variant: null, issues: newIssues(configuration, swapSlot(configuration, slot.id, null), catalog) });
    }
    return list;
  }, [slot, catalog, configuration]);

  const currentVariantId = slot ? variantInSlot(configuration, slot.id) : null;
  const variantById = useMemo(() => new Map(catalog.variants.map((v) => [v.id, v])), [catalog]);
  const variantLabel = (id: string | null) => (id ? nameOf(variantById.get(id) ?? { nameVi: id, nameEn: id }, locale) : t.none);

  const notifyRejected = (issues: CompatibilityIssue[]) => {
    pushToast({
      title: t.rejected,
      description: issues.map((i) => i.message[locale]).join(' '),
      variant: 'error',
    });
  };

  const onConfirm = () => {
    const result = confirmPreview();
    if (!result.ok) notifyRejected(result.issues);
  };

  const onPaint = (variantId: string) => {
    const result = applyChange(PAINT_SLOT, variantId);
    if (!result.ok) notifyRejected(result.issues);
  };

  const paintSlot = slots.find((s) => s.id === PAINT_SLOT);
  const paintVariants = paintSlot
    ? catalog.variants.filter((v) => paintSlot.acceptedCategories.includes(v.categoryId))
    : [];
  const currentPaint = variantInSlot(configuration, PAINT_SLOT);

  return (
    <section aria-label={t.title} className={className}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.title}</h2>
        <span data-testid="dirty-indicator" className={dirty ? 'text-amber-300 text-xs' : 'text-gunmetal-400 text-xs'}>
          {dirty ? t.dirty : t.clean}
        </span>
      </header>

      <div role="toolbar" aria-label="History" className="mb-3 flex gap-2">
        <button type="button" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          {t.undo}
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Ctrl+Y">
          {t.redo}
        </button>
      </div>

      {lastRejection && (
        <div role="alert" className="mb-3 rounded border border-red-500/60 bg-red-950/40 p-2 text-xs">
          <p className="font-semibold">
            {t.rejected}: {variantLabel(lastRejection.variantId)}
          </p>
          <IssueList issues={lastRejection.issues} locale={locale} />
          <button type="button" onClick={dismissRejection} className="mt-1 underline">
            {t.dismiss}
          </button>
        </div>
      )}

      <nav aria-label={t.modules} className="mb-3">
        <h3 className="mb-1 text-xs uppercase text-gunmetal-400">{t.modules}</h3>
        <ul className="flex flex-wrap gap-1">
          {slots.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={s.id === slotId}
                onClick={() => {
                  setSlotId(s.id);
                  cancelPreview();
                }}
                className={s.id === slotId ? 'rounded bg-olive-700 px-2 py-0.5 text-xs' : 'rounded px-2 py-0.5 text-xs'}
              >
                {nameOf(s, locale)}
                {visibleSlots.has(s.id) && (
                  <span title={t.onModelHint} className="ml-1 text-[10px] text-olive-300">
                    {t.onModel}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {slot ? (
        <section aria-label={`${t.variants}: ${nameOf(slot, locale)}`} className="mb-3">
          <h3 className="mb-1 text-xs uppercase text-gunmetal-400">
            {t.variants}: {nameOf(slot, locale)}
          </h3>
          <ul role="listbox" aria-label={t.variants} className="flex flex-col gap-1">
            {options.map(({ variant, issues }) => {
              const id = variant?.id ?? null;
              const label = variant ? nameOf(variant, locale) : t.none;
              const isCurrent = id === currentVariantId;
              const isPreview = !!preview && preview.slotId === slot.id && preview.variantId === id;
              const incompatible = issues.length > 0;
              return (
                <li
                  key={id ?? '__none__'}
                  role="option"
                  aria-selected={isPreview}
                  data-testid={`variant-${id ?? 'none'}`}
                  data-incompatible={incompatible || undefined}
                  className={incompatible ? 'rounded border border-amber-500/40 p-1' : 'rounded border border-transparent p-1'}
                >
                  <button type="button" onClick={() => startPreview(slot.id, id)} className="w-full text-left text-xs">
                    {variant && (
                      <span
                        aria-hidden
                        className="mr-1 inline-block h-2 w-2 rounded-full"
                        style={{ background: MATERIAL_PRESET_COLORS[variant.materialPreset] }}
                      />
                    )}
                    {label}
                    {isCurrent && <span className="ml-1 text-olive-300">({t.current})</span>}
                    {incompatible && <span className="ml-1 text-amber-300">— {t.incompatible}</span>}
                  </button>
                  {incompatible && <IssueList issues={issues} locale={locale} />}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="text-xs text-gunmetal-400">{t.pickModule}</p>
      )}

      {preview && (
        <div role="region" aria-label={t.previewing} className="mb-3 rounded border border-olive-500/60 p-2 text-xs">
          <p>
            {t.previewing}: <strong data-testid="preview-name">{variantLabel(preview.variantId)}</strong>
          </p>
          {preview.issues.length > 0 && <IssueList issues={preview.issues} locale={locale} />}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onConfirm}>
              {t.confirm}
            </button>
            <button type="button" onClick={cancelPreview}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {paintVariants.length > 0 && (
        <section aria-label={t.paint}>
          <h3 className="mb-1 text-xs uppercase text-gunmetal-400">{t.paint}</h3>
          <div role="radiogroup" aria-label={t.paint} className="flex flex-wrap gap-2">
            {paintVariants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === currentPaint}
                aria-label={nameOf(v, locale)}
                title={`${nameOf(v, locale)} — ${t.material}: ${v.materialPreset}`}
                onClick={() => onPaint(v.id)}
                className="flex items-center gap-1 rounded border border-gunmetal-600 px-2 py-0.5 text-xs"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: MATERIAL_PRESET_COLORS[v.materialPreset] }}
                />
                {nameOf(v, locale)}
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export default DesignPanel;
