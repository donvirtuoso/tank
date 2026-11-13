/**
 * Domain model cho trình lắp ráp xe tăng mô hình.
 *
 * Lưu ý: mọi dữ liệu chỉ mô tả bề ngoài và mang tính giáo dục.
 * Các chỉ số (ratings) là điểm giả lập 0–100 dùng cho trò chơi,
 * KHÔNG phản ánh bất kỳ thông số kỹ thuật thực tế nào.
 */

export const SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

export type Locale = 'vi' | 'en';

export interface LocalizedText {
  vi: string;
  en: string;
}

export type Vec3 = [number, number, number];

/** 5 chỉ số giả lập, mỗi chỉ số nằm trong [0, 100]. */
export const RATING_KEYS = [
  'mobility',
  'protection',
  'firepower',
  'reliability',
  'concealment',
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export type SimulatedRatings = Record<RatingKey, number>;
/** Hệ số cộng/trừ mà mỗi biến thể đóng góp vào điểm giả lập. */
export type RatingModifiers = Partial<Record<RatingKey, number>>;

export const MATERIAL_PRESETS = [
  'steel-matte',
  'steel-worn',
  'cast-rough',
  'rubber',
  'glass',
  'canvas',
  'brass',
  'paint-olive',
  'paint-sand',
  'paint-grey',
  'paint-camo',
  'decal',
] as const;
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];

export const PRIMITIVES = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'torus',
  'capsule',
  'plane',
  'composite',
] as const;
export type ProceduralPrimitive = (typeof PRIMITIVES)[number];

export interface ProceduralParams {
  primitive: ProceduralPrimitive;
  /** Kích thước theo đơn vị cảnh 3D (scene units), không phải đơn vị thực. */
  dimensions: Record<string, number>;
  /** Số phần lặp lại (ví dụ số bánh, số mắt xích hiển thị). */
  repeat?: number;
  segments?: number;
}

export const ANCHOR_PARENTS = ['root', 'hull', 'turret', 'barrel', 'chassis'] as const;
export type AnchorParent = (typeof ANCHOR_PARENTS)[number];

export interface AttachmentAnchor {
  parent: AnchorParent;
  position: Vec3;
  rotation: Vec3;
  /** Đặt đối xứng hai bên trái/phải. */
  mirrored?: boolean;
}

export const ANIMATION_KINDS = [
  'none',
  'rotate',
  'spin',
  'hinge',
  'scroll',
  'sway',
  'translate',
] as const;
export type AnimationKind = (typeof ANIMATION_KINDS)[number];

export interface AnimationMetadata {
  kind: AnimationKind;
  axis?: 'x' | 'y' | 'z';
  /** Tốc độ hoạt ảnh (đơn vị cảnh / giây), chỉ dùng để hiển thị. */
  speed?: number;
  range?: [number, number];
}

export interface ComponentCategory {
  id: string;
  nameVi: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
}

export interface ComponentVariant {
  id: string;
  categoryId: string;
  nameVi: string;
  nameEn: string;
  geometrySource: 'procedural';
  procedural: ProceduralParams;
  attachmentAnchor: AttachmentAnchor;
  materialPreset: MaterialPreset;
  animationMetadata: AnimationMetadata;
  /** Hệ số điều chỉnh điểm giả lập (mỗi giá trị trong [-30, 30]). */
  simulatedRatings: RatingModifiers;
  educationalNotes: LocalizedText;
  /** Thẻ dùng cho quy tắc tương thích. */
  tags: string[];
}

export interface MountSlot {
  id: string;
  nameVi: string;
  nameEn: string;
  acceptedCategories: string[];
  /** Nếu có, chỉ các biến thể này được gắn vào slot. */
  acceptedVariantIds?: string[];
  required: boolean;
  maximumInstances: number;
}

export type CompatibilityRuleKind = 'requiresTag' | 'forbidsTag';

export interface CompatibilityRule {
  id: string;
  kind: CompatibilityRuleKind;
  /** Điều kiện kích hoạt: có biến thể thuộc nhóm này mang thẻ này. */
  source: { categoryId: string; tag: string };
  /**
   * requiresTag: phải có ít nhất một biến thể thuộc nhóm đích mang một trong các thẻ.
   * forbidsTag: không biến thể nào thuộc nhóm đích được mang các thẻ này.
   */
  target: { categoryId: string; tags: string[] };
  message: LocalizedText;
}

export interface CompatibilityData {
  schemaVersion: SchemaVersion;
  slots: MountSlot[];
  rules: CompatibilityRule[];
}

export interface ComponentInstance {
  instanceId: string;
  variantId: string;
  slotId: string;
  colorOverride?: string;
}

export interface VehicleConfiguration {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  instances: ComponentInstance[];
}

export interface SavedDesign {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  configuration: VehicleConfiguration;
  thumbnailDataUrl?: string;
}

export interface Catalog {
  categories: ComponentCategory[];
  variants: ComponentVariant[];
  compatibility: CompatibilityData;
}
