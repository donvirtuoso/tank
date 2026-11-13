import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SceneRegistry } from './sceneRegistry';

describe('SceneRegistry', () => {
  it('registers, looks up and unregisters objects by componentId', () => {
    const reg = new SceneRegistry();
    const a = new Object3D();
    reg.register('hull', a);
    expect(reg.get('hull')).toBe(a);
    expect(reg.has('hull')).toBe(true);
    expect(reg.ids()).toEqual(['hull']);
    reg.unregister('hull');
    expect(reg.get('hull')).toBeUndefined();
    expect(reg.size).toBe(0);
  });

  it('ignores a stale unregister for an object that was replaced', () => {
    const reg = new SceneRegistry();
    const oldObj = new Object3D();
    const newObj = new Object3D();
    reg.register('turret', oldObj);
    reg.register('turret', newObj);
    reg.unregister('turret', oldObj);
    expect(reg.get('turret')).toBe(newObj);
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const reg = new SceneRegistry();
    const listener = vi.fn();
    const off = reg.subscribe(listener);
    const obj = new Object3D();
    reg.register('gun', obj);
    reg.register('gun', obj); // duplicate → no event
    reg.unregister('gun');
    expect(listener.mock.calls).toEqual([
      ['gun', obj],
      ['gun', null],
    ]);
    off();
    reg.register('gun', obj);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clear removes every entry', () => {
    const reg = new SceneRegistry();
    reg.register('a', new Object3D());
    reg.register('b', new Object3D());
    reg.clear();
    expect(reg.size).toBe(0);
  });
});
