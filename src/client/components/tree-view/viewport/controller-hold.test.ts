import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { ReactiveControllerHost } from 'lit';

import { ViewportController } from './controller';
import type { ViewportMeasurements, ViewportOptions } from './controller';

const OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
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

// The dock beside the canvas takes its width from the canvas's left. The
// chart is wider than the canvas, so held still it keeps filling it.
function setup(chart = { x: 1000, y: 150 }) {
  let left = 0;
  const measurements: ViewportMeasurements = {
    chartExtents: () => ({
      min: { x: -chart.x, y: -chart.y },
      max: { x: chart.x, y: chart.y }
    }),
    canvasSize: () => ({ width: 800 - left, height: 600 }),
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

test('a resize leaving the chart out of bounds brings it back at once', () => {
  // 448 wide with its margin, centred: 176..624 on the canvas.
  const { controller, moveCanvasTo } = setup({ x: 200, y: 150 });
  // The dock takes 380: held still, the chart's left 204 px would be under
  // it, its right at 244 on the 420 px canvas. It overflows the canvas by
  // 28, so an edge may come in that far: its right comes back to 392.
  moveCanvasTo(380);
  const left = controller.chartToScreen({ x: -200, y: 0 })!.x - 24;
  const right = controller.chartToScreen({ x: 200, y: 0 })!.x + 24;
  expect(left).toBeCloseTo(-56, 6);
  expect(right).toBeCloseTo(392, 6);
});

test('a resize that keeps the left edge leaves pan alone', () => {
  const { controller, moveCanvasTo } = setup();
  const start = controller.pan;
  moveCanvasTo(0);
  expect(controller.pan).toEqual(start);
});

// A card 100 px square whose top-left is at `x`, `y` in the canvas, at
// scale 1: its centre in chart units.
function cardAt(controller: ViewportController, x: number, y: number) {
  const origin = controller.chartToScreen({ x: 0, y: 0 })!;
  return { x: x + 50 - origin.x, y: y + 50 - origin.y };
}

const HALF = { x: 50, y: 50 };

test('a card in view is shown where it is', () => {
  const { controller } = setup();
  controller.setScale(1);
  const start = controller.pan;
  controller.showCard([cardAt(controller, 300, 200)], HALF, 0, 0);
  expect(controller.pan).toEqual(start);
});

test('a card past an edge comes just inside the margin', () => {
  const { controller } = setup();
  controller.setScale(1);
  const start = controller.pan;
  // The canvas is 800 by 600 and the margin 24.
  controller.showCard([cardAt(controller, 750, -40)], HALF, 0, 0);
  expect(controller.pan).toEqual({ x: start.x - 74, y: start.y + 64 });
});

test('a card the opening column will cover comes clear of it', () => {
  const { controller } = setup();
  controller.setScale(1);
  const start = controller.pan;
  controller.showCard([cardAt(controller, 100, 200)], HALF, 300, 0);
  expect(controller.pan).toEqual({ x: start.x + 224, y: start.y });
});

test('of a person drawn twice, the card needing least is shown', () => {
  const { controller } = setup();
  controller.setScale(1);
  const start = controller.pan;
  const far = cardAt(controller, -400, 200);
  const near = cardAt(controller, 720, 200);
  controller.showCard([far, near], HALF, 0, 0);
  expect(controller.pan).toEqual({ x: start.x - 44, y: start.y });
});
