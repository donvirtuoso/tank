import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAncestorIds,
  initialSelectionState,
  isComponentVisible,
  shouldShowLabel,
  useSelectionStore,
} from './useSelectionStore';
import { TANK_COMPONENTS } from '../features/viewer/__fixtures__/tankComponents';

const byId = new Map(TANK_COMPONENTS.map((c) => [c.id, c]));
const store = () => useSelectionStore.getState();

beforeEach(() => {
  useSelectionStore.setState({ ...initialSelectionState });
});

describe('useSelectionStore', () => {
  it('select / hover / clearSelection', () => {
    store().select('engine');
    store().setHover('gun');
    expect(store().selectedId).toBe('engine');
    expect(store().hoverId).toBe('gun');
    store().clearSelection();
    expect(store().selectedId).toBeNull();
    expect(store().hoverId).toBe('gun');
  });

  it('hide removes selection/hover of hidden ids; show and toggle restore', () => {
    store().select('engine');
    store().setHover('engine');
    store().hide(['engine', 'gun']);
    expect(store().hidden).toEqual(['engine', 'gun']);
    expect(store().selectedId).toBeNull();
    expect(store().hoverId).toBeNull();

    store().show('engine');
    expect(store().hidden).toEqual(['gun']);
    store().toggleHidden('gun');
    expect(store().hidden).toEqual([]);
    store().toggleHidden('gun');
    expect(store().hidden).toEqual(['gun']);
  });

  it('isolate, showRelated and showAll/reset', () => {
    store().hide('engine');
    store().isolate('engine');
    expect(store().isolated).toEqual(['engine']);
    expect(store().hidden).toEqual([]);

    store().showRelated(byId.get('engine')!);
    expect(store().isolated).toEqual(['engine', 'transmission', 'fuel-tank']);

    store().showAll();
    expect(store().isolated).toBeNull();
    expect(store().hidden).toEqual([]);

    store().select('gun');
    store().hide('hull');
    store().isolate('turret');
    store().reset();
    expect(useSelectionStore.getState()).toMatchObject(initialSelectionState);
  });

  it('show while isolated adds the id to the isolated set', () => {
    store().isolate('engine');
    store().show('gun');
    expect(store().isolated).toEqual(['engine', 'gun']);
  });

  it('requestFocus uses the selected id and bumps the nonce', () => {
    store().requestFocus();
    expect(store().focusRequest).toBeNull();
    store().select('gun');
    store().requestFocus();
    const first = store().focusRequest!;
    expect(first.id).toBe('gun');
    store().requestFocus();
    expect(store().focusRequest!.nonce).toBeGreaterThan(first.nonce);
  });
});

describe('visibility helpers', () => {
  it('getAncestorIds walks up parents', () => {
    expect(getAncestorIds('sprocket', byId)).toEqual(['track-left', 'hull']);
    expect(getAncestorIds('hull', byId)).toEqual([]);
  });

  it('hiding an ancestor hides descendants', () => {
    const state = { hidden: ['turret'], isolated: null };
    expect(isComponentVisible('gun', state, byId)).toBe(false);
    expect(isComponentVisible('engine', state, byId)).toBe(true);
  });

  it('isolating keeps the subtree and hides others', () => {
    const state = { hidden: [], isolated: ['track-left'] };
    expect(isComponentVisible('track-left', state, byId)).toBe(true);
    expect(isComponentVisible('idler', state, byId)).toBe(true);
    expect(isComponentVisible('engine', state, byId)).toBe(false);
    expect(isComponentVisible('hull', state, byId)).toBe(false);
  });

  it('shouldShowLabel shows contextual labels only', () => {
    const engine = byId.get('engine')!;
    const state = { selectedId: 'engine', hoverId: 'gun' };
    expect(shouldShowLabel('engine', state, engine)).toBe(true);
    expect(shouldShowLabel('gun', state, engine)).toBe(true);
    expect(shouldShowLabel('transmission', state, engine)).toBe(true);
    expect(shouldShowLabel('idler', state, engine)).toBe(false);
  });
});
