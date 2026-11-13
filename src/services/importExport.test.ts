import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfiguration, defaultCatalog } from '@/domain/defaultConfiguration';
import { SCHEMA_VERSION, type SavedDesign } from '@/domain/models/types';
import { validateConfiguration } from '@/domain/rules/compatibility';
import {
  MAX_IMPORT_BYTES,
  captureThumbnail,
  designFileName,
  downloadDesign,
  formatIssuePath,
  parseDesignJson,
  readDesignFile,
  sanitizeConfiguration,
  serializeDesign,
} from './importExport';

const NOW = '2026-03-01T12:00:00.000Z';
const now = () => NOW;

const design = (): SavedDesign => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'design-1',
  name: 'Xe thử',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  configuration: createDefaultConfiguration(),
});

afterEach(() => vi.restoreAllMocks());

describe('parseDesignJson — valid input', () => {
  it('imports an exported design unchanged and without warnings', () => {
    const original = design();
    const result = parseDesignJson(serializeDesign(original), { now });
    expect(result).toEqual({ ok: true, design: original, warnings: [] });
  });

  it('accepts a bare VehicleConfiguration and wraps it into a design', () => {
    const config = createDefaultConfiguration();
    const result = parseDesignJson(JSON.stringify(config), { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.configuration).toEqual(config);
    expect(result.design.createdAt).toBe(NOW);
    expect(result.design.name).toBe(config.name);
  });

  it('migrates legacy (schemaVersion-less) files with a warning', () => {
    const { schemaVersion: _a, ...legacy } = design();
    const { schemaVersion: _b, ...legacyConfig } = legacy.configuration;
    void _a;
    void _b;
    const result = parseDesignJson(JSON.stringify({ ...legacy, configuration: legacyConfig }), { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.warnings.map((w) => w.code)).toEqual(['migrated']);
  });
});

describe('parseDesignJson — invalid input is rejected with messages', () => {
  it('rejects malformed JSON', () => {
    const result = parseDesignJson('{"id": ', { now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe('');
    expect(result.errors[0]?.message).toMatch(/JSON không hợp lệ/);
  });

  it('rejects non-object JSON', () => {
    const result = parseDesignJson('[1,2,3]', { now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/đối tượng/);
  });

  it('reports schema errors by path', () => {
    const bad = design() as unknown as Record<string, unknown>;
    const config = { ...(bad.configuration as Record<string, unknown>) };
    const instances = [...(config.instances as Record<string, unknown>[])];
    instances[2] = { ...instances[2], variantId: 'Not Kebab' };
    const json = JSON.stringify({ ...bad, name: '', configuration: { ...config, instances } });
    const result = parseDesignJson(json, { now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('name');
    expect(paths).toContain('configuration.instances[2].variantId');
    for (const e of result.errors) expect(e.message.length).toBeGreaterThan(0);
  });

  it('rejects unknown fields (strict schema)', () => {
    const result = parseDesignJson(JSON.stringify({ ...design(), hacked: true }), { now });
    expect(result.ok).toBe(false);
  });

  it('rejects files from a newer schema version', () => {
    const result = parseDesignJson(JSON.stringify({ ...design(), schemaVersion: SCHEMA_VERSION + 1 }), { now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe('schemaVersion');
  });

  it('rejects content over the size limit', () => {
    const big = JSON.stringify({ ...design(), name: 'x'.repeat(MAX_IMPORT_BYTES) });
    const result = parseDesignJson(big, { now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/quá lớn/);
  });

  const fakeFile = (content: string, size = content.length) => {
    const text = vi.fn(async () => content);
    return { file: { size, text } as unknown as Blob, text };
  };

  it('readDesignFile checks the size before reading', async () => {
    const { file, text } = fakeFile('{}', MAX_IMPORT_BYTES + 1);
    const result = await readDesignFile(file, { now });
    expect(result.ok).toBe(false);
    expect(text).not.toHaveBeenCalled();
  });

  it('readDesignFile reads valid files', async () => {
    const { file, text } = fakeFile(serializeDesign(design()));
    const result = await readDesignFile(file, { now });
    expect(text).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, design: design(), warnings: [] });
  });
});

describe('parseDesignJson — missing variants are replaced with safe defaults', () => {
  it('replaces unknown variants with the slot default and warns', () => {
    const d = design();
    d.configuration.instances = d.configuration.instances.map((i) =>
      i.slotId === 'turret' ? { ...i, variantId: 'turret-from-the-future' } : i,
    );
    const result = parseDesignJson(JSON.stringify(d), { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const turret = result.design.configuration.instances.find((i) => i.slotId === 'turret');
    expect(turret?.variantId).toBe('turret-medium-cast');
    const warning = result.warnings.find((w) => w.code === 'variant-replaced');
    expect(warning?.path).toMatch(/^configuration\.instances\[\d+\]\.variantId$/);
    expect(warning?.message).toMatch(/turret-from-the-future/);
    expect(validateConfiguration(result.design.configuration, defaultCatalog)).toEqual([]);
  });

  it('drops parts in unknown slots and optional parts without default; adds missing required slots', () => {
    const d = design();
    d.configuration.instances = [
      ...d.configuration.instances.filter((i) => i.slotId !== 'hull'),
      { instanceId: 'ghost-1', slotId: 'ghost-slot', variantId: 'hull-standard' },
      { instanceId: 'side-skirt-1', slotId: 'side-skirt', variantId: 'skirt-unknown' },
    ];
    const result = sanitizeConfiguration(d.configuration, defaultCatalog);
    const codes = result.warnings.map((w) => w.code);
    expect(codes.filter((c) => c === 'instance-removed')).toHaveLength(2);
    expect(codes).toContain('required-slot-added');
    const slots = result.configuration.instances.map((i) => i.slotId);
    expect(slots).toContain('hull');
    expect(slots).not.toContain('ghost-slot');
    expect(slots).not.toContain('side-skirt');
  });

  it('does not mutate its input', () => {
    const d = design();
    d.configuration.instances[0] = { ...d.configuration.instances[0]!, variantId: 'nope' };
    const snapshot = JSON.stringify(d.configuration);
    sanitizeConfiguration(d.configuration, defaultCatalog);
    expect(JSON.stringify(d.configuration)).toBe(snapshot);
  });
});

describe('export', () => {
  it('formats issue paths', () => {
    expect(formatIssuePath(['configuration', 'instances', 2, 'variantId'])).toBe('configuration.instances[2].variantId');
    expect(formatIssuePath([])).toBe('');
  });

  it('builds a safe file name', () => {
    expect(designFileName({ name: 'Xe tăng Đỏ #1' })).toBe('tank-design-xe-tang-do-1.json');
    expect(designFileName({ name: '!!!' })).toBe('tank-design-untitled.json');
  });

  it('downloads a JSON Blob through an anchor', async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:mock';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadDesign(design());
    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0]?.type).toBe('application/json');
    expect(created[0]?.size).toBe(new TextEncoder().encode(serializeDesign(design())).length);
    expect(parseDesignJson(serializeDesign(design()), { now })).toEqual({ ok: true, design: design(), warnings: [] });
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('captureThumbnail', () => {
  it('renders first, then downsizes through a 2D canvas', () => {
    const source = document.createElement('canvas');
    source.width = 1024;
    source.height = 512;
    const drawImage = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,AAAA');
    const render = vi.fn();
    expect(captureThumbnail(source, { render, maxSize: 256 })).toBe('data:image/jpeg;base64,AAAA');
    expect(render.mock.invocationCallOrder[0]).toBeLessThan(drawImage.mock.invocationCallOrder[0]!);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 256, 128);
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
  });

  it('returns undefined for empty or failing canvases', () => {
    const empty = document.createElement('canvas');
    empty.width = 0;
    expect(captureThumbnail(empty)).toBeUndefined();
    const broken = document.createElement('canvas');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(broken, 'toDataURL').mockImplementation(() => {
      throw new Error('tainted');
    });
    expect(captureThumbnail(broken)).toBeUndefined();
  });
});
