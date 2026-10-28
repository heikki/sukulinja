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

// The chart, 400 × 300 at scale 1 and 448 × 348 with the fit's margin:
// centred on the 800 × 600 canvas, it spans 176..624 and has 176 px of room
// each way before it leaves the canvas.
const EXTENTS = { min: { x: -200, y: -150 }, max: { x: 200, y: 150 } };
const MARGIN = 24;
const WIDTH = 800;
const MID = 400;

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

class FakeResizeObserver {
  observed = false;
  observe() {
    this.observed = true;
  }
  disconnect() {
    this.observed = false;
  }
}

// Bun has no DOM: frames and timers run when the test says.
let frames: FrameRequestCallback[] = [];
let timers: Array<() => void> = [];
let now = 0;
let settles = 0;
const real = { performance, setTimeout, clearTimeout };

// Runs the frames due; how far the chart, with its margin, went each way.
function runFrames(controller: ViewportController) {
  let furthest = { left: Infinity, right: -Infinity };
  for (let i = 0; i < 500 && frames.length > 0; i++) {
    const next = frames.shift()!;
    now += 16;
    next(now);
    furthest = {
      left: Math.min(furthest.left, edges(controller).left),
      right: Math.max(furthest.right, edges(controller).right)
    };
  }
  return furthest;
}

function runTimers() {
  const due = timers;
  timers = [];
  for (const fn of due) fn();
}

// The left and right edges on screen of the chart with its margin.
function edges(controller: ViewportController) {
  return {
    left: controller.chartToScreen(EXTENTS.min)!.x - MARGIN,
    right: controller.chartToScreen(EXTENTS.max)!.x + MARGIN
  };
}

function mouse(x: number, t: number) {
  now = t;
  return { clientX: x, clientY: 0, button: 0 } as unknown as MouseEvent;
}

beforeEach(() => {
  frames = [];
  timers = [];
  now = 1000;
  settles = 0;
  const g = globalThis as Record<string, unknown>;
  g.performance = { now: () => now };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb);
  g.cancelAnimationFrame = () => {
    frames = [];
  };
  g.setTimeout = (fn: () => void) => timers.push(fn);
  g.clearTimeout = () => {
    timers = [];
  };
  g.ResizeObserver = FakeResizeObserver;
});

function setup() {
  const rect: Partial<DOMRect> = { left: 0, top: 0 };
  const measurements: ViewportMeasurements = {
    chartExtents: () => EXTENTS,
    canvasSize: () => ({ width: 800, height: 600 }),
    canvasRect: () => rect as DOMRect,
    onSettle: () => {
      settles += 1;
    }
  };
  const controller = new ViewportController(host, measurements, OPTIONS);
  controller.ensureInitialPan();
  controller.attachCanvas(canvas);
  return controller;
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  g.performance = real.performance;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  delete g.ResizeObserver;
  g.setTimeout = real.setTimeout;
  g.clearTimeout = real.clearTimeout;
});

test("a drag past the canvas's edge stretches", () => {
  const controller = setup();
  controller.onMouseDown(mouse(0, 1000));
  controller.onMouseMove(mouse(300, 1100));
  // Followed exactly, its right edge would be at 924.
  expect(edges(controller).right).toBeGreaterThan(WIDTH);
  expect(edges(controller).right).toBeLessThan(924);
});

test('a flick eases to rest at the edge, never past it, then settles', () => {
  const controller = setup();
  controller.onMouseDown(mouse(0, 1000));
  controller.onMouseMove(mouse(20, 1010));
  controller.onMouseMove(mouse(80, 1020));
  controller.onMouseUp();
  expect(settles).toBe(0);
  const furthest = runFrames(controller);
  expect(furthest.right).toBeLessThanOrEqual(WIDTH);
  expect(edges(controller).right).toBeCloseTo(WIDTH, 6);
  expect(settles).toBe(1);
});

test('let go past the edge at rest, it springs back', () => {
  const controller = setup();
  controller.onMouseDown(mouse(0, 1000));
  controller.onMouseMove(mouse(-500, 1100));
  controller.onMouseMove(mouse(-500, 1200));
  expect(edges(controller).left).toBeLessThan(0);
  controller.onMouseUp();
  runFrames(controller);
  expect(edges(controller).left).toBeCloseTo(0, 6);
  expect(settles).toBe(1);
});

function wheel(x: number, deltaY: number) {
  return {
    clientX: x,
    clientY: 300,
    deltaY,
    preventDefault: () => {
      // no-op
    }
  } as unknown as WheelEvent;
}

test("a wheel zoom past the canvas's edge goes on, and stays once it stops", () => {
  const controller = setup();
  // In around the canvas's left edge, which pushes the chart off its right.
  for (let i = 0; i < 5; i++) controller.onWheel(wheel(0, -100));
  const { right } = edges(controller);
  expect(right).toBeGreaterThan(WIDTH);
  runTimers();
  expect(frames).toHaveLength(0);
  expect(edges(controller).right).toBe(right);
  expect(settles).toBe(1);
});

test('a wheel zoom eases out to maxScale, never past it', () => {
  const controller = setup();
  let last = controller.scale;
  for (let i = 0; i < 40; i++) {
    controller.onWheel(wheel(MID, -100));
    expect(controller.scale).toBeLessThanOrEqual(OPTIONS.scaleBounds.maxScale);
    expect(controller.scale).toBeGreaterThanOrEqual(last);
    last = controller.scale;
  }
  expect(controller.scale).toBe(OPTIONS.scaleBounds.maxScale);
  runTimers();
  expect(frames).toHaveLength(0);
  expect(settles).toBe(1);
});

test('a drag let go with the chart left off the canvas by a zoom springs it back', () => {
  const controller = setup();
  // Right edge 100 px off the canvas.
  controller.setPan({ x: 452, y: 126 });
  controller.onMouseDown(mouse(0, 1000));
  controller.onMouseMove(mouse(-20, 2000));
  controller.onMouseMove(mouse(-20, 3000));
  controller.onMouseUp();
  runFrames(controller);
  expect(edges(controller).right).toBeCloseTo(WIDTH, 6);
  expect(settles).toBe(1);
});

test('a wheel zoom mid-drag leaves the drag to spring back once let go', () => {
  const controller = setup();
  controller.onMouseDown(mouse(0, 1000));
  controller.onMouseMove(mouse(-500, 1100));
  runTimers();
  controller.onWheel(wheel(0, 10));
  runTimers();
  expect(frames.length).toBe(0);
  controller.onMouseUp();
  runFrames(controller);
  expect(edges(controller).left).toBeCloseTo(0, 6);
});

test('zooming out stops at a fit of the whole chart', () => {
  const controller = setup();
  // The chart fits at scale 1, the fit's cap.
  for (let i = 0; i < 10; i++) controller.onWheel(wheel(MID, 100));
  expect(controller.scale).toBe(1);
  runTimers();
  expect(frames).toHaveLength(0);
});
