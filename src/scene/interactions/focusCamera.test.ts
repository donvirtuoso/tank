import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyFocusPose, computeFocusPose, getObjectBounds } from './focusCamera';

describe('computeFocusPose', () => {
  const box = new THREE.Box3(new THREE.Vector3(9, -1, -1), new THREE.Vector3(11, 1, 1));

  it('targets the box center and keeps the viewing direction', () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5);
    camera.position.set(0, 0, 20);
    const pose = computeFocusPose(box, camera, new THREE.Vector3(0, 0, 0));
    expect(pose.target.toArray()).toEqual([10, 0, 0]);
    const dir = pose.position.clone().sub(pose.target).normalize();
    expect(dir.z).toBeCloseTo(1);
  });

  it('places the camera far enough for the bounding sphere to fit', () => {
    const camera = new THREE.PerspectiveCamera(50, 1);
    camera.position.set(0, 0, 20);
    const pose = computeFocusPose(box, camera, new THREE.Vector3(), 1);
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const distance = pose.position.distanceTo(pose.target);
    const halfFov = THREE.MathUtils.degToRad(25);
    expect(Math.asin(radius / distance)).toBeLessThanOrEqual(halfFov + 1e-6);
  });

  it('falls back to a default direction when camera sits on the target', () => {
    const camera = new THREE.PerspectiveCamera();
    const pose = computeFocusPose(box, camera, camera.position.clone());
    expect(Number.isFinite(pose.position.x)).toBe(true);
    expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(0);
  });

  it('computes a zoom for orthographic cameras', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10);
    camera.position.set(0, 0, 50);
    const pose = computeFocusPose(box, camera, new THREE.Vector3());
    expect(pose.zoom).toBeGreaterThan(1);
  });
});

describe('applyFocusPose / getObjectBounds', () => {
  it('reaches the destination at t=1 and updates controls', () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = { target: new THREE.Vector3(), update: () => undefined };
    const from = { position: new THREE.Vector3(0, 0, 10), target: new THREE.Vector3() };
    const to = { position: new THREE.Vector3(5, 5, 5), target: new THREE.Vector3(1, 2, 3) };
    applyFocusPose(camera, controls, from, to, 1);
    expect(camera.position.toArray()).toEqual([5, 5, 5]);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
  });

  it('returns null for empty objects', () => {
    expect(getObjectBounds(new THREE.Group())).toBeNull();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    expect(getObjectBounds(mesh)?.getSize(new THREE.Vector3()).toArray()).toEqual([2, 2, 2]);
  });
});
