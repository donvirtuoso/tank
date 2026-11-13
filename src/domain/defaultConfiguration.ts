import categoriesJson from '../data/categories.json';
import variantsJson from '../data/variants.json';
import compatibilityJson from '../data/compatibility.json';
import { SCHEMA_VERSION, type Catalog, type VehicleConfiguration } from './models/types';
import { parseCatalog } from './validators/schemas';

/** Catalog seed đã được kiểm tra bằng Zod khi nạp module. */
export const defaultCatalog: Catalog = parseCatalog({
  categories: categoriesJson,
  variants: variantsJson,
  compatibility: compatibilityJson,
});

export const DEFAULT_CONFIGURATION_ID = 'default-medium-tank';

const DEFAULT_PARTS: ReadonlyArray<readonly [slotId: string, variantId: string]> = [
  ['hull', 'hull-standard'],
  ['turret', 'turret-medium-cast'],
  ['barrel', 'barrel-medium'],
  ['mantlet', 'mantlet-rounded'],
  ['turret-hatch', 'hatch-round'],
  ['hull-hatch', 'hatch-square'],
  ['cupola', 'cupola-low'],
  ['engine', 'engine-rear-compact'],
  ['drivetrain', 'drivetrain-rear-sprocket'],
  ['suspension', 'suspension-torsion'],
  ['road-wheels', 'wheels-large-spaced'],
  ['track', 'track-standard'],
  ['fender', 'fender-straight'],
  ['exhaust', 'exhaust-twin'],
  ['headlight', 'headlight-round'],
  ['storage', 'storage-box-rear'],
  ['antenna', 'antenna-whip'],
  ['periscope', 'periscope-block'],
  ['camouflage', 'camo-olive'],
  ['insignia', 'insignia-number'],
];

/** Tạo cấu hình mặc định "Medium tank" (bản sao mới mỗi lần gọi). */
export function createDefaultConfiguration(): VehicleConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: DEFAULT_CONFIGURATION_ID,
    name: 'Medium tank',
    instances: DEFAULT_PARTS.map(([slotId, variantId]) => ({
      instanceId: `${slotId}-1`,
      slotId,
      variantId,
    })),
  };
}
