import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPORT_SCREENSHOT_MAX_SIZE,
  SCENE_CANVAS_ATTR,
  captureCanvas,
  captureSceneScreenshot,
  findSceneCanvas,
  isImageDataUrl,
} from './screenshot';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function mockCanvas2d(url = 'data:image/png;base64,iVBORw0KGgo=') {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(url);
  return { drawImage, toDataURL };
}

function sourceCanvas(width = 2400, height = 1200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('isImageDataUrl', () => {
  it('accepts raster data URLs only', () => {
    expect(isImageDataUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,AA+/==')).toBe(true);
    expect(isImageDataUrl('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isImageDataUrl('data:image/png;base64,AA"onerror="x')).toBe(false);
    expect(isImageDataUrl(null)).toBe(false);
  });
});

describe('findSceneCanvas', () => {
  it('finds the canvas inside the marked 3D viewport, not other canvases', () => {
    document.body.innerHTML = `<canvas id="chart"></canvas><section ${SCENE_CANVAS_ATTR}=""><canvas id="scene"></canvas></section>`;
    expect(findSceneCanvas()?.id).toBe('scene');
  });

  it('returns null when there is no 3D canvas', () => {
    document.body.innerHTML = '<canvas id="chart"></canvas>';
    expect(findSceneCanvas()).toBeNull();
  });
});

describe('captureCanvas', () => {
  it('captures a downsized PNG by default', () => {
    const { drawImage, toDataURL } = mockCanvas2d();
    const canvas = sourceCanvas();
    expect(captureCanvas(canvas)).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0, REPORT_SCREENSHOT_MAX_SIZE, REPORT_SCREENSHOT_MAX_SIZE / 2);
    expect(toDataURL).toHaveBeenCalledWith('image/png', 0.8);
  });

  it('returns undefined for empty canvases or unexpected output', () => {
    expect(captureCanvas(sourceCanvas(0, 0))).toBeUndefined();
    mockCanvas2d('data:,');
    expect(captureCanvas(sourceCanvas())).toBeUndefined();
  });
});

describe('captureSceneScreenshot', () => {
  it('captures the canvas after the next animation frame', async () => {
    mockCanvas2d();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    await expect(captureSceneScreenshot(() => sourceCanvas())).resolves.toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('resolves undefined when no canvas is available', async () => {
    await expect(captureSceneScreenshot(() => null)).resolves.toBeUndefined();
  });
});
