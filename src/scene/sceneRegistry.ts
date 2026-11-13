import { useCallback, useRef } from 'react';
import type { Object3D } from 'three';

export type RegistryListener = (componentId: string, object: Object3D | null) => void;

/**
 * Registry mapping stable `componentId` → live three.js Object3D.
 *
 * Object3D references are mutable, non-serializable runtime handles, so they live
 * here instead of in the (serializable) application store. Other systems
 * (selection, highlighting, animation, exploded views) look parts up by id.
 */
export class SceneRegistry {
  private readonly objects = new Map<string, Object3D>();
  private readonly listeners = new Set<RegistryListener>();

  register(componentId: string, object: Object3D): void {
    if (this.objects.get(componentId) === object) return;
    this.objects.set(componentId, object);
    this.emit(componentId, object);
  }

  /**
   * Removes an entry. If `object` is given, only removes when it is still the
   * registered instance (avoids a late unmount wiping a newer remount).
   */
  unregister(componentId: string, object?: Object3D): void {
    const current = this.objects.get(componentId);
    if (!current) return;
    if (object && current !== object) return;
    this.objects.delete(componentId);
    this.emit(componentId, null);
  }

  get(componentId: string): Object3D | undefined {
    return this.objects.get(componentId);
  }

  has(componentId: string): boolean {
    return this.objects.has(componentId);
  }

  ids(): string[] {
    return [...this.objects.keys()];
  }

  get size(): number {
    return this.objects.size;
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    for (const id of [...this.objects.keys()]) this.unregister(id);
  }

  private emit(componentId: string, object: Object3D | null): void {
    for (const listener of this.listeners) listener(componentId, object);
  }
}

/** Application-wide registry instance used by the procedural tank. */
export const sceneRegistry = new SceneRegistry();

/**
 * Returns a callback ref that registers the attached Object3D under
 * `componentId` and unregisters it when detached or when the id changes.
 */
export function useRegisterObject<T extends Object3D>(
  componentId: string,
  registry: SceneRegistry = sceneRegistry,
): (object: T | null) => void {
  const current = useRef<{ id: string; object: T } | null>(null);
  return useCallback(
    (object: T | null) => {
      const previous = current.current;
      if (previous && (previous.object !== object || previous.id !== componentId)) {
        registry.unregister(previous.id, previous.object);
        current.current = null;
      }
      if (object) {
        object.userData.componentId = componentId;
        registry.register(componentId, object);
        current.current = { id: componentId, object };
      }
    },
    [componentId, registry],
  );
}
