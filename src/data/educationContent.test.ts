import { describe, expect, it } from 'vitest';
import lessons from './lessons.json';
import glossary from './glossary.json';

type Json = unknown;

/** Collects every object that has `vi` or `en` keys (a localized text). */
function collectLocalized(node: Json, path: string, out: { path: string; value: Record<string, unknown> }[]) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectLocalized(child, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('vi' in obj || 'en' in obj) out.push({ path, value: obj });
    else Object.entries(obj).forEach(([k, v]) => collectLocalized(v, `${path}.${k}`, out));
  }
  return out;
}

describe('education content', () => {
  it.each([
    ['lessons.json', lessons],
    ['glossary.json', glossary],
  ])('%s has Vietnamese and English for every text', (_, data) => {
    const texts = collectLocalized(data, '$', []);
    expect(texts.length).toBeGreaterThan(0);
    for (const { path, value } of texts) {
      expect(typeof value.vi === 'string' && value.vi.trim().length > 0, `${path}.vi`).toBe(true);
      expect(typeof value.en === 'string' && value.en.trim().length > 0, `${path}.en`).toBe(true);
    }
  });

  it('only references glossary terms that exist', () => {
    const terms = glossary.terms as Record<string, unknown>;
    const refs = JSON.stringify(lessons).match(/\[\[([\w-]+)/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(terms, ref).toHaveProperty(ref.slice(2));
  });

  it('assembly tutorial steps define target, camera focus and demo animation', () => {
    const { steps, summary } = lessons.assemblyTutorial;
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.target).toBeTruthy();
      expect(step.camera.position).toHaveLength(3);
      expect(step.camera.target).toHaveLength(3);
      expect(step.animation.id).toBeTruthy();
    }
    expect(summary.points.length).toBeGreaterThan(0);
  });

  it('onboarding covers welcome, mouse controls and the component explorer', () => {
    const pages = lessons.onboarding.pages as { id: string; highlight?: string; controls?: unknown[] }[];
    expect(pages.map((p) => p.id)).toEqual(['welcome', 'mouse', 'explorer']);
    expect(pages[1].controls?.length).toBeGreaterThanOrEqual(3);
    expect(pages[2].highlight).toBe('component-explorer');
  });
});
