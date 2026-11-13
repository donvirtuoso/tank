import { SCHEMA_VERSION } from '../models/types';

/**
 * Migrate dữ liệu thiết kế đã lưu / nhập theo `schemaVersion`.
 *
 * - Dữ liệu không có `schemaVersion` được coi là phiên bản 0 (bản nháp trước khi có schema).
 * - Mỗi bước migrate nhận đối tượng ở phiên bản N và trả về phiên bản N+1.
 * - Phiên bản lớn hơn {@link SCHEMA_VERSION} (do bản ứng dụng mới hơn tạo ra) bị từ chối.
 *
 * Hàm chỉ chuyển đổi hình dạng dữ liệu; kiểm tra hợp lệ do Zod (`savedDesignSchema`) đảm nhận sau đó.
 */

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;

type JsonObject = Record<string, unknown>;
type Migration = (input: JsonObject) => JsonObject;

export type MigrationResult =
  | { ok: true; value: JsonObject; fromVersion: number; migrated: boolean }
  | { ok: false; code: 'not-object' | 'invalid-version' | 'future-version'; message: string };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v0 → v1: bản nháp cũ có thể chỉ là một VehicleConfiguration "trần" (có `instances`,
 * không có `configuration`) và thiếu `schemaVersion` ở cả hai cấp.
 */
function migrateV0ToV1(input: JsonObject): JsonObject {
  const bareConfiguration = !isJsonObject(input.configuration) && Array.isArray(input.instances);
  const design: JsonObject = bareConfiguration
    ? {
        id: input.id,
        name: input.name,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        configuration: { id: input.id, name: input.name, instances: input.instances },
      }
    : { ...input };
  const configuration = isJsonObject(design.configuration) ? design.configuration : {};
  return {
    ...design,
    schemaVersion: 1,
    configuration: { ...configuration, schemaVersion: 1 },
  };
}

/** `MIGRATIONS[n]` chuyển từ phiên bản n lên n+1. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: migrateV0ToV1,
};

export function readSchemaVersion(input: JsonObject): number | null {
  const raw = input.schemaVersion;
  if (raw === undefined) return 0;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

/** Đưa một thiết kế (dữ liệu thô) lên phiên bản schema hiện tại. */
export function migrateDesign(input: unknown): MigrationResult {
  if (!isJsonObject(input)) {
    return { ok: false, code: 'not-object', message: 'Dữ liệu thiết kế phải là một đối tượng JSON.' };
  }
  const fromVersion = readSchemaVersion(input);
  if (fromVersion === null) {
    return {
      ok: false,
      code: 'invalid-version',
      message: 'schemaVersion phải là số nguyên không âm.',
    };
  }
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'future-version',
      message: `schemaVersion ${fromVersion} mới hơn phiên bản ứng dụng hỗ trợ (${CURRENT_SCHEMA_VERSION}).`,
    };
  }
  let value = input;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v];
    if (!step) {
      return { ok: false, code: 'invalid-version', message: `Thiếu bước migrate từ phiên bản ${v}.` };
    }
    value = step(value);
  }
  return { ok: true, value, fromVersion, migrated: fromVersion !== CURRENT_SCHEMA_VERSION };
}
