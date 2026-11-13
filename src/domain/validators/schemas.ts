import { z } from 'zod';
import {
  ANCHOR_PARENTS,
  ANIMATION_KINDS,
  MATERIAL_PRESETS,
  PRIMITIVES,
  SCHEMA_VERSION,
  type Catalog,
  type CompatibilityData,
  type ComponentCategory,
  type ComponentInstance,
  type ComponentVariant,
  type MountSlot,
  type SavedDesign,
  type VehicleConfiguration,
} from '../models/types';

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id phải ở dạng kebab-case');

export const schemaVersionSchema = z.literal(SCHEMA_VERSION);

export const localizedTextSchema = z
  .object({ vi: z.string().min(1), en: z.string().min(1) })
  .strict();

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const modifierSchema = z.number().int().min(-30).max(30);

export const ratingModifiersSchema = z
  .object({
    mobility: modifierSchema.optional(),
    protection: modifierSchema.optional(),
    firepower: modifierSchema.optional(),
    reliability: modifierSchema.optional(),
    concealment: modifierSchema.optional(),
  })
  .strict();

export const proceduralParamsSchema = z
  .object({
    primitive: z.enum(PRIMITIVES),
    dimensions: z.record(z.string(), z.number().positive()),
    repeat: z.number().int().positive().optional(),
    segments: z.number().int().positive().optional(),
  })
  .strict();

export const attachmentAnchorSchema = z
  .object({
    parent: z.enum(ANCHOR_PARENTS),
    position: vec3Schema,
    rotation: vec3Schema,
    mirrored: z.boolean().optional(),
  })
  .strict();

export const animationMetadataSchema = z
  .object({
    kind: z.enum(ANIMATION_KINDS),
    axis: z.enum(['x', 'y', 'z']).optional(),
    speed: z.number().nonnegative().optional(),
    range: z.tuple([z.number(), z.number()]).optional(),
  })
  .strict();

export const componentCategorySchema = z
  .object({
    id: idSchema,
    nameVi: z.string().min(1),
    nameEn: z.string().min(1),
    icon: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const componentVariantSchema = z
  .object({
    id: idSchema,
    categoryId: idSchema,
    nameVi: z.string().min(1),
    nameEn: z.string().min(1),
    geometrySource: z.literal('procedural'),
    procedural: proceduralParamsSchema,
    attachmentAnchor: attachmentAnchorSchema,
    materialPreset: z.enum(MATERIAL_PRESETS),
    animationMetadata: animationMetadataSchema,
    simulatedRatings: ratingModifiersSchema,
    educationalNotes: localizedTextSchema,
    tags: z.array(idSchema),
  })
  .strict();

export const mountSlotSchema = z
  .object({
    id: idSchema,
    nameVi: z.string().min(1),
    nameEn: z.string().min(1),
    acceptedCategories: z.array(idSchema).min(1),
    acceptedVariantIds: z.array(idSchema).min(1).optional(),
    required: z.boolean(),
    maximumInstances: z.number().int().min(1),
  })
  .strict();

export const compatibilityRuleSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['requiresTag', 'forbidsTag']),
    source: z.object({ categoryId: idSchema, tag: idSchema }).strict(),
    target: z.object({ categoryId: idSchema, tags: z.array(idSchema).min(1) }).strict(),
    message: localizedTextSchema,
  })
  .strict();

export const categoriesFileSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    categories: z.array(componentCategorySchema),
  })
  .strict();

export const variantsFileSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    variants: z.array(componentVariantSchema),
  })
  .strict();

export const compatibilityFileSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    slots: z.array(mountSlotSchema),
    rules: z.array(compatibilityRuleSchema),
  })
  .strict();

export const componentInstanceSchema = z
  .object({
    instanceId: z.string().min(1),
    variantId: idSchema,
    slotId: idSchema,
    colorOverride: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .strict();

export const vehicleConfigurationSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    instances: z.array(componentInstanceSchema),
  })
  .strict();

export const savedDesignSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    configuration: vehicleConfigurationSchema,
    thumbnailDataUrl: z.string().startsWith('data:image/').optional(),
  })
  .strict();

/* Kiểm tra tại thời điểm biên dịch: kiểu suy ra từ schema khớp interface domain. */
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type SchemaTypeChecks = [
  Assert<Same<z.infer<typeof componentCategorySchema>, ComponentCategory>>,
  Assert<Same<z.infer<typeof componentVariantSchema>, ComponentVariant>>,
  Assert<Same<z.infer<typeof mountSlotSchema>, MountSlot>>,
  Assert<Same<z.infer<typeof componentInstanceSchema>, ComponentInstance>>,
  Assert<Same<z.infer<typeof vehicleConfigurationSchema>, VehicleConfiguration>>,
  Assert<Same<z.infer<typeof savedDesignSchema>, SavedDesign>>,
  Assert<Same<z.infer<typeof compatibilityFileSchema>, CompatibilityData>>,
];

/** Parse dữ liệu thô (ví dụ JSON import) thành Catalog đã kiểm tra. Ném lỗi Zod nếu sai. */
export function parseCatalog(raw: {
  categories: unknown;
  variants: unknown;
  compatibility: unknown;
}): Catalog {
  return {
    categories: categoriesFileSchema.parse(raw.categories).categories,
    variants: variantsFileSchema.parse(raw.variants).variants,
    compatibility: compatibilityFileSchema.parse(raw.compatibility),
  };
}
