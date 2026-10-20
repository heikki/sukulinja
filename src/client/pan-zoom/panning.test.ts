import { afterEach, beforeEach, expect, test } from 'bun:test';

import { Panning } from './panning';
import type { Point, Transform } from './transform';

// Bun has no DOM: frames and timers run when the test says.
let frames: FrameRequestCallback[] = [];
let timers: Array<() => void> = [];
let now = 0;
const real = { setTimeout, clearTimeout };

function runFrames() {
  for (let i = 0; i < 500 && frames.length > 0; i++) {
    const next = frames.shift()!;
    now += 16;
    next(now);
  }
}

function runTimers() {
  const due = timers;
  timers = [];
  for (const fn of due) fn();
}

beforeEach(() => {
  frames = [];
  timers = [];
  now = 1000;
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
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.performance;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  g.setTimeout = real.setTimeout;
  g.clearTimeout = real.clearTimeout;
});

const BOUNDS = { minScale: 0.5, maxScale: 2 };
const SCREEN = { width: 800, height: 600 };

// Content the screen's size at scale 1, its top left at `pan`: larger it
// must fill the screen, smaller stay wholly on it.
function setup(pan: Point, scale = 1) {
  let view: Transform = { pan: { ...pan }, scale };
  let rests = 0;
  const panning = new Panning(
    {
      view: () => view,
      setView: (next) => {
        view = next;
      },
      content: (t) => contentAt(t),
      screen: () => SCREEN,
      scaleBounds: () => BOUNDS,
      fit: () => ({ pan: centred(BOUNDS.minScale), scale: BOUNDS.minScale }),
      onRest: () => {
        rests += 1;
      }
    },
    {
      fling: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
      dragThresholdPx: 4,
      zoomSettleMs: 200
    }
  );
  return { view: () => view, panning, rests: () => rests };
}

function contentAt(t: Transform) {
  return {
    min: t.pan,
    max: {
      x: t.pan.x + t.scale * SCREEN.width,
      y: t.pan.y + t.scale * SCREEN.height
    }
  };
}

// The pan centring content at `scale`.
function centred(scale: number): Point {
  return {
    x: (SCREEN.width * (1 - scale)) / 2,
    y: (SCREEN.height * (1 - scale)) / 2
  };
}

// Along one axis: whether content from `lo` to `hi` fills a screen `size`
// across or, smaller, stays on it.
function fits(lo: number, hi: number, size: number) {
  const e = 1e-6;
  return hi - lo <= size
    ? lo >= -e && hi <= size + e
    : lo <= e && hi >= size - e;
}

// Whether `t`'s content fills the screen or, smaller, stays on it.
function within(t: Transform) {
  const { min, max } = contentAt(t);
  return fits(min.x, max.x, SCREEN.width) && fits(min.y, max.y, SCREEN.height);
}

// Wheel steps `gap` ms apart, frames running between them.
function scroll(panning: Panning, factors: number[], gap: number, at = MID) {
  for (const factor of factors) {
    panning.wheel(factor, at);
    const until = now + gap;
    while (now < until) {
      now += 16;
      frames.shift()?.(now);
    }
  }
}

const MID = { x: 400, y: 300 };

test('a pinch carrying the content off its bounds stretches', () => {
  // 1200 × 900, its right and bottom edges on the screen's.
  const { view, panning } = setup({ x: -400, y: -300 }, 1.5);
  // Out around the top left: followed exactly, the right edge would come
  // in to 640, leaving the screen uncovered.
  panning.zoomBy(0.8, { x: 0, y: 0 });
  const right = contentAt(view()).max.x;
  expect(right).toBeGreaterThan(640);
  expect(right).toBeLessThan(800);
});

test('a pinch past the scale bounds stretches', () => {
  const { view, panning } = setup(centred(1.9), 1.9);
  panning.zoomBy(2, MID);
  expect(view().scale).toBeGreaterThan(2);
  expect(view().scale).toBeLessThan(3);
});

test('a pinch ending out of bounds settles back, then rests', () => {
  const { view, panning, rests } = setup({ x: 100, y: 0 });
  panning.settle();
  expect(rests()).toBe(0);
  runFrames();
  expect(view().pan.x).toBeCloseTo(0, 6);
  expect(rests()).toBe(1);
});

test('a zoom ending within bounds rests at once', () => {
  const { panning, rests } = setup({ x: 0, y: 0 });
  panning.settle();
  expect(frames).toHaveLength(0);
  expect(rests()).toBe(1);
});

test('a drag let go with the zoom stretched settles it', () => {
  const { view, panning } = setup(centred(2.4), 2.4);
  panning.start({ x: 0, y: 0 });
  panning.move({ x: 10, y: 0 });
  panning.end();
  runFrames();
  expect(view().scale).toBeCloseTo(BOUNDS.maxScale, 6);
});

test('a drag past an edge stretches, and let go springs back', () => {
  // 1200 wide, 200 px of it off each side.
  const { view, panning } = setup(centred(1.5), 1.5);
  panning.start({ x: 0, y: 0 });
  now += 100;
  panning.move({ x: 300, y: 0 });
  const left = view().pan.x;
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThan(100);
  now += 100;
  panning.move({ x: 300, y: 0 });
  panning.end();
  runFrames();
  expect(view().pan.x).toBeCloseTo(0, 6);
});

test('a fling eases to rest at an edge, never past it', () => {
  const { view, panning, rests } = setup(centred(1.5), 1.5);
  panning.start({ x: 0, y: 0 });
  now += 16;
  panning.move({ x: 20, y: 0 });
  now += 16;
  panning.move({ x: 100, y: 0 });
  panning.end();
  for (let i = 0; i < 500 && frames.length > 0; i++) {
    now += 16;
    frames.shift()!(now);
    expect(view().pan.x).toBeLessThanOrEqual(0);
  }
  expect(view().pan.x).toBe(0);
  expect(rests()).toBe(1);
});

test('a wheel zoom eases out to maxScale, never past it', () => {
  const { view, panning } = setup(centred(1.5), 1.5);
  let last = view().scale;
  for (let i = 0; i < 40; i++) {
    scroll(panning, [1.1], 16);
    expect(view().scale).toBeLessThanOrEqual(BOUNDS.maxScale);
    expect(view().scale).toBeGreaterThanOrEqual(last);
    last = view().scale;
  }
  expect(view().scale).toBe(BOUNDS.maxScale);
  runTimers();
  expect(frames).toHaveLength(0);
});

test("a trackpad's momentum slows to rest at the limit", () => {
  const { view, panning } = setup(centred(1.7), 1.7);
  // Smaller and smaller steps, unevenly so.
  const steps = [1.06, 1.05, 1.055, 1.03, 1.035, 1.015, 1.018, 1.006, 1.007];
  for (const factor of steps) {
    const before = view().scale;
    scroll(panning, [factor], 16);
    expect(view().scale).toBeLessThanOrEqual(BOUNDS.maxScale);
    // Each step gains less of its zoom as the limit nears.
    expect(view().scale / before).toBeLessThanOrEqual(factor);
  }
  runTimers();
  expect(frames).toHaveLength(0);
});

test('past the bounds, a wheel goes no further while the settle pulls on', () => {
  const { view, panning } = setup(centred(2.4), 2.4);
  panning.settle();
  now += 16;
  frames.shift()?.(now);
  const pulled = view().scale;
  panning.wheel(1.2, MID);
  expect(view().scale).toBeLessThanOrEqual(pulled);
  runTimers();
  runFrames();
  expect(view().scale).toBeCloseTo(BOUNDS.maxScale, 6);
});

test('a wheel zoom past the bounds goes on, then settles once it stops', () => {
  // Its right and bottom edges on the screen's: zooming out around the top
  // left uncovers them.
  const { view, panning, rests } = setup({ x: -400, y: -300 }, 1.5);
  scroll(panning, [0.95, 0.95, 0.95], 16, { x: 0, y: 0 });
  // Nothing holds it back meanwhile: it turns about the pointer alone.
  expect(contentAt(view()).max.x).toBeCloseTo(800 * 0.95 ** 3, 6);
  expect(frames).toHaveLength(0);
  runTimers();
  runFrames();
  expect(within(view())).toBe(true);
  expect(rests()).toBe(1);
});

test('a wheel within bounds sets nothing going', () => {
  const { panning } = setup(centred(1.5), 1.5);
  panning.wheel(1.1, MID);
  expect(frames).toHaveLength(0);
});

test('zoomBy says whether the view is still within bounds', () => {
  const { panning } = setup(centred(1.5), 1.5);
  expect(panning.zoomBy(1.2, MID)).toBe(true);
  expect(panning.zoomBy(1.5, MID)).toBe(false);
});

test('a wheel zoom turns about the pointer', () => {
  const { view, panning } = setup(centred(0.8), 0.8);
  scroll(panning, [0.95], 16, { x: 300, y: 250 });
  const after = view();
  const k = after.scale / 0.8;
  const before = centred(0.8);
  expect((after.pan.x - k * before.x) / (1 - k)).toBeCloseTo(300, 6);
  expect((after.pan.y - k * before.y) / (1 - k)).toBeCloseTo(250, 6);
});

test('a scroll reaching a limit settles at once, its momentum spent', () => {
  // Its right and bottom edges on the screen's.
  const { view, panning, rests } = setup({ x: -400, y: -300 }, 1.5);
  // Out around the top left, past the edges, down to minScale.
  for (let i = 0; i < 60 && view().scale > BOUNDS.minScale; i++) {
    panning.wheel(0.9, { x: 0, y: 0 });
  }
  expect(view().scale).toBe(BOUNDS.minScale);
  // The next step has nothing to zoom: the settle starts without waiting
  // for the wheel to stop.
  panning.wheel(0.95, { x: 0, y: 0 });
  expect(timers).toHaveLength(0);
  const settling = frames.length;
  expect(settling).toBe(1);
  // Momentum running on changes nothing.
  for (const factor of [0.97, 0.98, 0.99]) {
    panning.wheel(factor, { x: 0, y: 0 });
  }
  expect(frames).toHaveLength(settling);
  runFrames();
  expect(within(view())).toBe(true);
  expect(rests()).toBe(1);
});

// A screen whose size the test changes, and its fit of content the screen's
// starting size at scale 1.
function resizable(pan: Point, scale: number) {
  let screen = { ...SCREEN };
  let view: Transform = { pan, scale };
  function fit() {
    const s = Math.min(screen.width / 800, screen.height / 600);
    return {
      pan: {
        x: (screen.width - 800 * s) / 2,
        y: (screen.height - 600 * s) / 2
      },
      scale: s
    };
  }
  const panning = new Panning(
    {
      view: () => view,
      setView: (next) => {
        view = next;
      },
      content: (t) => contentAt(t),
      screen: () => screen,
      scaleBounds: () => ({ minScale: fit().scale, maxScale: 4 }),
      fit
    },
    {
      fling: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
      dragThresholdPx: 4,
      zoomSettleMs: 200
    }
  );
  // As a ResizeObserver reports the screen's first size.
  panning.keepWithin();
  return {
    view: () => view,
    panning,
    fit,
    resize: (width: number, height: number) => {
      screen = { width, height };
      return panning.keepWithin();
    }
  };
}

test('a screen growing past content zoomed in brings it back within bounds', () => {
  // 1200 × 900 on 800 × 600, its right and bottom edges on the screen's.
  const { view, resize } = resizable({ x: -400, y: -300 }, 1.5);
  expect(resize(1000, 600)).toBe(true);
  // It still fills the wider screen.
  expect(contentAt(view()).max.x).toBeCloseTo(1000, 6);
  expect(contentAt(view()).min.x).toBeLessThanOrEqual(1e-6);
});

test('a fitted view is fitted anew when the screen changes size', () => {
  const { view, resize, fit } = resizable({ x: 0, y: 0 }, 1);
  resize(1000, 900);
  expect(view()).toEqual(fit());
  resize(400, 600);
  expect(view()).toEqual(fit());
});

test('a view within bounds is left alone', () => {
  const { view, resize } = resizable({ x: -100, y: -100 }, 1.5);
  const before = view();
  expect(resize(820, 600)).toBe(false);
  expect(view()).toBe(before);
});

test('a drag going on is left alone', () => {
  const { view, panning, resize } = resizable({ x: -400, y: -300 }, 1.5);
  panning.start({ x: 0, y: 0 });
  const before = view();
  expect(resize(1000, 600)).toBe(false);
  expect(view()).toBe(before);
});
