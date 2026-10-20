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

// Bun has no DOM: the canvas keeps its listeners so a test can fire WebKit's
// gestures, and frames run when the test says.
let listeners = new Map<string, (e: Event) => void>();
let frames: FrameRequestCallback[] = [];
let now = 0;
let settles = 0;

const canvas = {
  addEventListener: (type: string, fn: (e: Event) => void) => {
    listeners.set(type, fn);
  },
  removeEventListener: () => {
    // no-op
  }
} as unknown as HTMLElement;

function fire(type: string, scale: number, t: number) {
  now = t;
  const e: Partial<Event> & { scale: number } = {
    scale,
    preventDefault: () => {
      // no-op
    }
  };
  listeners.get(type)!(
    Object.assign(e, { clientX: 400, clientY: 300 }) as Event
  );
}

function runFrames() {
  for (let i = 0; i < 200 && frames.length > 0; i++) {
    const next = frames.shift()!;
    now += 16;
    next(now);
  }
}

// attachCanvas observes the canvas; the hold it drives is covered in
// controller-hold.test.ts.
class FakeResizeObserver {
  observed = 0;
  observe() {
    this.observed += 1;
  }
  disconnect() {
    this.observed = 0;
  }
}

function setup() {
  const rect: Partial<DOMRect> = { left: 0, top: 0 };
  const measurements: ViewportMeasurements = {
    chartExtents: () => ({
      min: { x: -200, y: -150 },
      max: { x: 200, y: 150 }
    }),
    canvasSize: () => ({ width: 800, height: 600 }),
    canvasRect: () => rect as DOMRect,
    comfort: () => null,
    onSettle: () => {
      settles += 1;
    }
  };
  const controller = new ViewportController(host, measurements, OPTIONS);
  controller.ensureInitialPan();
  controller.attachCanvas(canvas);
  return controller;
}

// A quick pinch: ×1.3 over 32ms.
function pinch() {
  fire('gesturestart', 1, 1000);
  fire('gesturechange', 1.1, 1016);
  fire('gesturechange', 1.3, 1032);
  fire('gestureend', 1.3, 1032);
}

beforeEach(() => {
  listeners = new Map();
  frames = [];
  now = 0;
  settles = 0;
  const g = globalThis as Record<string, unknown>;
  g.performance = { now: () => now };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb);
  g.cancelAnimationFrame = () => {
    frames = [];
  };
  g.ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.performance;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  delete g.ResizeObserver;
});

test('a pinch zooms by the gesture, glides on, then settles', () => {
  const controller = setup();
  const before = controller.scale;
  pinch();
  expect(settles).toBe(0);
  runFrames();
  expect(controller.scale / before).toBeGreaterThan(1.3);
  expect(settles).toBe(1);
});

test('a drag stops the glide without settling it', () => {
  const controller = setup();
  pinch();
  expect(frames).toHaveLength(1);
  const down: Partial<MouseEvent> = { button: 0, clientX: 0, clientY: 0 };
  controller.onMouseDown(down as MouseEvent);
  expect(frames).toHaveLength(0);
  expect(settles).toBe(0);
});

test('a pinch ending out of bounds bounces back, then settles', () => {
  const controller = setup();
  // The chart, with the fit's 24 px margin, 100 px off the canvas's right.
  controller.setPan({ x: 452, y: 126 });
  pinch();
  runFrames();
  // Back on the canvas, its right edge on the canvas's.
  expect(controller.chartToScreen({ x: 200, y: 0 })!.x + 24).toBeCloseTo(
    800,
    6
  );
  expect(settles).toBe(1);
});
