import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { ReactiveControllerHost } from 'lit';

import { ViewportController } from './controller';
import type { ViewportMeasurements, ViewportOptions } from './controller';

const OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3 },
  dragThresholdPx: 4,
  svgMarginPx: 24
};

const host: ReactiveControllerHost = {
  updateComplete: Promise.resolve(true),
  addController: () => {
    // no-op
  },
  removeController: () => {
    // no-op
  },
  requestUpdate: () => {
    // no-op
  }
};

const canvas = {
  addEventListener: () => {
    // no-op
  },
  removeEventListener: () => {
    // no-op
  }
} as unknown as HTMLElement;

// Bun has no DOM; the fake hands each observer's callback to the test to fire.
let onResize: (() => void) | null = null;

beforeEach(() => {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    constructor(private readonly cb: () => void) {}
    observe() {
      onResize = this.cb;
    }
    disconnect() {
      if (onResize === this.cb) onResize = null;
    }
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).ResizeObserver;
  onResize = null;
});

function rectAt(left: number) {
  const rect: Partial<DOMRect> = { left };
  return rect as DOMRect;
}

function setup() {
  let left = 0;
  const measurements: ViewportMeasurements = {
    chartExtents: () => ({
      min: { x: -200, y: -150 },
      max: { x: 200, y: 150 }
    }),
    canvasSize: () => ({ width: 800, height: 600 }),
    canvasRect: () => rectAt(left)
  };
  const controller = new ViewportController(host, measurements, OPTIONS);
  controller.ensureInitialPan();
  controller.attachCanvas(canvas);
  function moveCanvasTo(x: number) {
    left = x;
    onResize?.();
  }
  return { controller, moveCanvasTo };
}

test('a canvas origin move shifts pan back so the chart holds still', () => {
  const { controller, moveCanvasTo } = setup();
  const start = controller.pan;
  moveCanvasTo(380);
  expect(controller.pan).toEqual({ x: start.x - 380, y: start.y });
  moveCanvasTo(40);
  expect(controller.pan).toEqual({ x: start.x - 40, y: start.y });
});

test('a resize that keeps the left edge leaves pan alone', () => {
  const { controller, moveCanvasTo } = setup();
  const start = controller.pan;
  moveCanvasTo(0);
  expect(controller.pan).toEqual(start);
});
