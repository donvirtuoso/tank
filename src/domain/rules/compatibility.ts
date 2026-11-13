import type {
  Catalog,
  ComponentInstance,
  ComponentVariant,
  Locale,
  LocalizedText,
  MountSlot,
  VehicleConfiguration,
} from '../models/types';

export type CompatibilityIssueCode =
  | 'duplicate-instance-id'
  | 'unknown-variant'
  | 'unknown-slot'
  | 'category-not-accepted'
  | 'variant-not-accepted'
  | 'too-many-instances'
  | 'missing-required-slot'
  | 'rule-violation';

export interface CompatibilityIssue {
  code: CompatibilityIssueCode;
  /** Khóa i18n, dạng `compatibility.<code>` hoặc `compatibility.rule.<ruleId>`. */
  messageKey: string;
  message: LocalizedText;
  params: Record<string, string | number>;
  slotId?: string;
  instanceId?: string;
  variantId?: string;
  ruleId?: string;
}

const MESSAGES: Record<Exclude<CompatibilityIssueCode, 'rule-violation'>, LocalizedText> = {
  'duplicate-instance-id': {
    vi: 'Mã chi tiết "{instanceId}" bị trùng.',
    en: 'Instance id "{instanceId}" is duplicated.',
  },
  'unknown-variant': {
    vi: 'Không tìm thấy biến thể "{variantId}".',
    en: 'Variant "{variantId}" was not found.',
  },
  'unknown-slot': {
    vi: 'Không tìm thấy vị trí gắn "{slotId}".',
    en: 'Mount slot "{slotId}" was not found.',
  },
  'category-not-accepted': {
    vi: 'Vị trí "{slotName}" không nhận chi tiết thuộc nhóm "{categoryId}".',
    en: 'Slot "{slotName}" does not accept parts from category "{categoryId}".',
  },
  'variant-not-accepted': {
    vi: 'Biến thể "{variantName}" không gắn được vào vị trí "{slotName}".',
    en: 'Variant "{variantName}" cannot be mounted on slot "{slotName}".',
  },
  'too-many-instances': {
    vi: 'Vị trí "{slotName}" chỉ nhận tối đa {max} chi tiết (hiện có {count}).',
    en: 'Slot "{slotName}" accepts at most {max} parts (currently {count}).',
  },
  'missing-required-slot': {
    vi: 'Thiếu chi tiết bắt buộc ở vị trí "{slotName}".',
    en: 'Required slot "{slotName}" is empty.',
  },
};

type ParamValue = string | number | LocalizedText;

function resolveParam(value: ParamValue, locale: Locale): string {
  return typeof value === 'object' ? value[locale] : String(value);
}

function interpolate(template: string, params: Record<string, ParamValue>, locale: Locale): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? resolveParam(params[key], locale) : match,
  );
}

/** Tham số dạng LocalizedText được thay theo từng ngôn ngữ; `params` trả về giữ bản tiếng Việt. */
function makeIssue(
  code: Exclude<CompatibilityIssueCode, 'rule-violation'>,
  params: Record<string, ParamValue>,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue {
  const tpl = MESSAGES[code];
  const flatParams = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? v.vi : v]),
  );
  return {
    code,
    messageKey: `compatibility.${code}`,
    message: { vi: interpolate(tpl.vi, params, 'vi'), en: interpolate(tpl.en, params, 'en') },
    params: flatParams,
    ...extra,
  };
}

const slotLabel = (s: MountSlot): LocalizedText => ({ vi: s.nameVi, en: s.nameEn });
const variantLabel = (v: ComponentVariant): LocalizedText => ({ vi: v.nameVi, en: v.nameEn });

interface Indexes {
  variants: Map<string, ComponentVariant>;
  slots: Map<string, MountSlot>;
}

function buildIndexes(catalog: Catalog): Indexes {
  return {
    variants: new Map(catalog.variants.map((v) => [v.id, v])),
    slots: new Map(catalog.compatibility.slots.map((s) => [s.id, s])),
  };
}

/**
 * Kiểm tra toàn bộ cấu hình theo bộ quy tắc. Hàm thuần: không thay đổi đầu vào,
 * cùng đầu vào luôn cho cùng danh sách lỗi (thứ tự ổn định). Mảng rỗng = hợp lệ.
 */
export function validateConfiguration(
  config: VehicleConfiguration,
  catalog: Catalog,
): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  const { variants, slots } = buildIndexes(catalog);

  // 1. Trùng instanceId
  const seen = new Set<string>();
  for (const inst of config.instances) {
    if (seen.has(inst.instanceId)) {
      issues.push(
        makeIssue('duplicate-instance-id', { instanceId: inst.instanceId }, { instanceId: inst.instanceId }),
      );
    }
    seen.add(inst.instanceId);
  }

  // 2. Từng chi tiết: biến thể/slot tồn tại, slot chấp nhận nhóm/biến thể
  const resolved: { inst: ComponentInstance; variant: ComponentVariant }[] = [];
  for (const inst of config.instances) {
    const variant = variants.get(inst.variantId);
    const slot = slots.get(inst.slotId);
    const ref = { instanceId: inst.instanceId, variantId: inst.variantId, slotId: inst.slotId };
    if (!variant) {
      issues.push(makeIssue('unknown-variant', { variantId: inst.variantId }, ref));
      continue;
    }
    if (!slot) {
      issues.push(makeIssue('unknown-slot', { slotId: inst.slotId }, ref));
      continue;
    }
    const slotName = slotLabel(slot);
    if (!slot.acceptedCategories.includes(variant.categoryId)) {
      issues.push(
        makeIssue('category-not-accepted', { slotName, categoryId: variant.categoryId }, ref),
      );
      continue;
    }
    if (slot.acceptedVariantIds && !slot.acceptedVariantIds.includes(variant.id)) {
      issues.push(
        makeIssue('variant-not-accepted', { slotName, variantName: variantLabel(variant) }, ref),
      );
      continue;
    }
    resolved.push({ inst, variant });
  }

  // 3. Số lượng tối đa và slot bắt buộc
  const countBySlot = new Map<string, number>();
  for (const inst of config.instances) {
    countBySlot.set(inst.slotId, (countBySlot.get(inst.slotId) ?? 0) + 1);
  }
  for (const slot of catalog.compatibility.slots) {
    const count = countBySlot.get(slot.id) ?? 0;
    if (count > slot.maximumInstances) {
      issues.push(
        makeIssue(
          'too-many-instances',
          { slotName: slotLabel(slot), max: slot.maximumInstances, count },
          { slotId: slot.id },
        ),
      );
    }
    const validCount = resolved.filter((r) => r.inst.slotId === slot.id).length;
    if (slot.required && validCount === 0) {
      issues.push(
        makeIssue('missing-required-slot', { slotName: slotLabel(slot) }, { slotId: slot.id }),
      );
    }
  }

  // 4. Quy tắc tương thích chéo giữa các nhóm (dựa trên thẻ)
  const tagsByCategory = new Map<string, Set<string>[]>();
  for (const { variant } of resolved) {
    const list = tagsByCategory.get(variant.categoryId) ?? [];
    list.push(new Set(variant.tags));
    tagsByCategory.set(variant.categoryId, list);
  }
  for (const rule of catalog.compatibility.rules) {
    const sources = resolved.filter(
      (r) => r.variant.categoryId === rule.source.categoryId && r.variant.tags.includes(rule.source.tag),
    );
    if (sources.length === 0) continue;
    const targets = tagsByCategory.get(rule.target.categoryId) ?? [];
    const anyMatch = targets.some((tags) => rule.target.tags.some((t) => tags.has(t)));
    const violated = rule.kind === 'requiresTag' ? !anyMatch : anyMatch;
    if (!violated) continue;
    for (const { inst, variant } of sources) {
      issues.push({
        code: 'rule-violation',
        messageKey: `compatibility.rule.${rule.id}`,
        message: { ...rule.message },
        params: { variantName: variant.nameVi, targetCategoryId: rule.target.categoryId },
        ruleId: rule.id,
        instanceId: inst.instanceId,
        variantId: variant.id,
        slotId: inst.slotId,
      });
    }
  }

  return issues;
}

export function isConfigurationValid(config: VehicleConfiguration, catalog: Catalog): boolean {
  return validateConfiguration(config, catalog).length === 0;
}

/**
 * Trả về cấu hình mới khi đặt biến thể vào slot (hàm thuần).
 * Slot chỉ nhận 1 chi tiết → thay thế; ngược lại → thêm mới.
 */
export function placeVariant(
  config: VehicleConfiguration,
  catalog: Catalog,
  slotId: string,
  variantId: string,
  instanceId?: string,
): VehicleConfiguration {
  const slot = catalog.compatibility.slots.find((s) => s.id === slotId);
  const replace = slot ? slot.maximumInstances === 1 : false;
  const kept = replace ? config.instances.filter((i) => i.slotId !== slotId) : [...config.instances];
  let id = instanceId;
  if (!id) {
    let n = 1;
    const used = new Set(config.instances.map((i) => i.instanceId));
    while (used.has(`${slotId}-${n}`)) n += 1;
    id = `${slotId}-${n}`;
  }
  return { ...config, instances: [...kept, { instanceId: id, variantId, slotId }] };
}

function issueKey(i: CompatibilityIssue): string {
  return [i.code, i.ruleId ?? '', i.slotId ?? '', i.instanceId ?? '', i.variantId ?? ''].join('|');
}

/**
 * Kiểm tra việc đặt một biến thể vào slot: trả về các lỗi MỚI phát sinh so với cấu hình hiện tại.
 * Mảng rỗng = biến thể tương thích.
 */
export function checkPlacement(
  config: VehicleConfiguration,
  catalog: Catalog,
  slotId: string,
  variantId: string,
): CompatibilityIssue[] {
  const before = new Set(validateConfiguration(config, catalog).map(issueKey));
  const next = placeVariant(config, catalog, slotId, variantId);
  return validateConfiguration(next, catalog).filter((i) => !before.has(issueKey(i)));
}

/** Danh sách biến thể có thể đặt vào slot mà không gây lỗi mới. */
export function listCompatibleVariants(
  config: VehicleConfiguration,
  catalog: Catalog,
  slotId: string,
): ComponentVariant[] {
  return catalog.variants.filter((v) => checkPlacement(config, catalog, slotId, v.id).length === 0);
}
