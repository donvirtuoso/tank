import { describe, expect, it } from 'vitest';
import {
  CAMERA_PRESET_IDS,
  easeInOutCubic,
  getPresetPose,
  interpolatePose,
  type CameraPose,
  type Vec3Tuple,
} from './cameraPresets';

const dist = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('camera presets', () => {
  const target: Vec3Tuple = [0, 1, 0];

  it('defines the 6 required presets', () => {
    expect([...CAMERA_PRESET_IDS].sort()).toEqual(['front', 'iso', 'rear', 'reset', 'side', 'top']);
  });

  it('places each preset on the expected side of the tank', () => {
    expect(getPresetPose('front', target, 5).position[0]).toBeGreaterThan(5);
    expect(getPresetPose('rear', target, 5).position[0]).toBeLessThan(-5);
    expect(getPresetPose('side', target, 5).position[2]).toBeGreaterThan(5);
    const top = getPresetPose('top', target, 5).position;
    expect(top[1]).toBeGreaterThan(10);
    expect(Math.hypot(top[0], top[2])).toBeLessThan(0.05);
    const iso = getPresetPose('iso', target, 5).position;
    expect(iso.every((v) => v > 0)).toBe(true);
  });

  it('scales distance with the subject radius', () => {
    const near = getPresetPose('iso', target, 3);
    const far = getPresetPose('iso', target, 6);
    expect(dist(far.position, target)).toBeCloseTo(dist(near.position, target) * 2, 6);
  });
});

describe('interpolatePose', () => {
  const from = getPresetPose('front', [0, 1, 0], 5);
  const to = getPresetPose('rear', [0, 1, 0], 5);

  it('hits both endpoints exactly', () => {
    const start = interpolatePose(from, to, 0);
    start.position.forEach((v, i) => expect(v).toBeCloseTo(from.position[i], 9));
    expect(interpolatePose(from, to, 1)).toEqual(to);
  });

  it('orbits around the target instead of cutting through the tank', () => {
    const r = dist(from.position, from.target);
    for (let t = 0.1; t < 1; t += 0.1) {
      const p = interpolatePose(from, to, t);
      expect(dist(p.position, p.target)).toBeCloseTo(r, 6);
    }
  });

  it('moves the target linearly', () => {
    const a: CameraPose = { position: [5, 5, 5], target: [0, 0, 0] };
    const b: CameraPose = { position: [5, 5, 5], target: [2, 4, 6] };
    expect(interpolatePose(a, b, 0.5).target).toEqual([1, 2, 3]);
  });

  it('clamps t outside [0, 1]', () => {
    expect(interpolatePose(from, to, 2)).toEqual(to);
  });
});

describe('easeInOutCubic', () => {
  it('is monotonic from 0 to 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
