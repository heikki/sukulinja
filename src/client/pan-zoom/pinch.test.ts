import { afterEach, beforeEach, expect, test } from 'bun:test';

import { Pinch } from './pinch';
import type { PinchOptions } from './pinch';
import type { Point } from './transform';

const OPTIONS: PinchOptions = {
  wheelK: 0.01,
  maxWheelDelta: 25,
  wheelEaseMs: 90,
  momentum: { tauMs: 100, minV: 0.0001, minReleaseV: 0.0008 },
  maxGlide: 1.4
};

let now = 0;
let frames: FrameRequestCallback[] = [];
let zooms: Array<{ factor: number; at: Point }> = [];
let ended = 0;
// The zoom past which the view is out of bounds.
let limit = Infinity;

function pinch() {
  return new Pinch(
    {
      onZoom: (factor, at) => {
        zooms.push({ factor, at });
        return zoomed() <= limit;
      },
      onEnd: () => {
        ended += 1;
      }
    },
    OPTIONS
  );
}

function gesture(type: string, scale: number, t: number) {
  now = t;
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { scale, clientX: 10, clientY: 20 });
  return e;
}

// Only the fields a pinch reads; tests have no DOM to make a real one.
function wheel(init: Partial<WheelEvent>) {
  const e: Partial<WheelEvent> = {
    deltaY: 0,
    ctrlKey: false,
    clientX: 10,
    clientY: 20,
    ...init
  };
  return e as WheelEvent;
}

function zoomed() {
  return zooms.reduce((product, z) => product * z.factor, 1);
}

// Runs the glide's frames 16ms apart until it stops.
function runFrames() {
  for (let i = 0; i < 1000 && frames.length > 0; i++) {
    const next = frames.shift()!;
    now += 16;
    next(now);
  }
}

const real = { performance };

beforeEach(() => {
  now = 0;
  frames = [];
  zooms = [];
  ended = 0;
  limit = Infinity;
  const g = globalThis as Record<string, unknown>;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb);
  g.cancelAnimationFrame = () => {
    frames = [];
  };
  g.performance = { now: () => now };
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  g.performance = real.performance;
});

test("zooms by each step of WebKit's gesture scale, at the pointer", () => {
  const p = pinch();
  const start = gesture('gesturestart', 1, 0);
  p.onGestureStart(start);
  p.onGestureChange(gesture('gesturechange', 1.2, 16));
  p.onGestureChange(gesture('gesturechange', 1.5, 32));
  expect(start.defaultPrevented).toBe(true);
  expect(zoomed()).toBeCloseTo(1.5, 10);
  expect(zooms.every((z) => z.at.x === 10 && z.at.y === 20)).toBe(true);
});

test('glides on after a quick pinch, slowing to a stop', () => {
  const p = pinch();
  p.onGestureStart(gesture('gesturestart', 1, 0));
  p.onGestureChange(gesture('gesturechange', 1.2, 16));
  p.onGestureChange(gesture('gesturechange', 1.5, 32));
  p.onGestureEnd(gesture('gestureend', 1.5, 40));
  expect(ended).toBe(0);
  runFrames();
  expect(ended).toBe(1);
  // ×1.5 by hand, then a glide capped near ×1.4 (frames add a little).
  expect(zoomed()).toBeGreaterThan(1.6);
  expect(zoomed()).toBeLessThan(1.5 * 1.45);
  const steps = zooms.slice(2).map((z) => z.factor);
  expect(steps.every((f, i) => i === 0 || f <= steps[i - 1]!)).toBe(true);
});

test('a glide that carries the view out of bounds ends there', () => {
  limit = 1.6;
  const p = pinch();
  p.onGestureStart(gesture('gesturestart', 1, 0));
  p.onGestureChange(gesture('gesturechange', 1.2, 16));
  p.onGestureChange(gesture('gesturechange', 1.5, 32));
  p.onGestureEnd(gesture('gestureend', 1.5, 40));
  runFrames();
  expect(ended).toBe(1);
  expect(frames).toHaveLength(0);
  // It stops on the first step past 1.6, well short of a full glide.
  expect(zoomed()).toBeGreaterThan(1.6);
  expect(zoomed()).toBeLessThan(1.8);
});

test('a pinch past the bounds by hand zooms on: only a glide stops', () => {
  limit = 1.1;
  const p = pinch();
  p.onGestureStart(gesture('gesturestart', 1, 0));
  p.onGestureChange(gesture('gesturechange', 1.2, 16));
  p.onGestureChange(gesture('gesturechange', 1.5, 32));
  expect(zoomed()).toBeCloseTo(1.5, 10);
  expect(ended).toBe(0);
});

test('a ctrl+wheel easing out of bounds ends there', () => {
  limit = 1.05;
  const p = pinch();
  p.wheel(wheel({ deltaY: -30, ctrlKey: true }));
  runFrames();
  expect(ended).toBe(1);
  expect(zoomed()).toBeLessThan(Math.exp(0.3));
});

test('ends without a glide after a slow pinch', () => {
  const p = pinch();
  p.onGestureStart(gesture('gesturestart', 1, 0));
  p.onGestureChange(gesture('gesturechange', 1.01, 100));
  p.onGestureChange(gesture('gesturechange', 1.02, 200));
  p.onGestureEnd(gesture('gestureend', 1.02, 210));
  expect(ended).toBe(1);
  expect(frames).toHaveLength(0);
});

test('eases a ctrl+wheel pinch to exactly its zoom, then ends', () => {
  const p = pinch();
  expect(p.wheel(wheel({ deltaY: -10 }))).toBe(false);
  expect(p.wheel(wheel({ deltaY: -10, ctrlKey: true }))).toBe(true);
  p.wheel(wheel({ deltaY: -500, ctrlKey: true }));
  // Nothing lands until a frame: the zoom trails the deltas.
  expect(zooms).toHaveLength(0);
  frames.shift()!((now += 16));
  const first = zoomed();
  expect(first).toBeGreaterThan(1);
  expect(first).toBeLessThan(Math.exp(0.35));
  runFrames();
  // -10 then -500, held to -25: 0.1 + 0.25 of log-zoom, no more.
  expect(zoomed()).toBeCloseTo(Math.exp(0.1 + 0.25), 10);
  expect(ended).toBe(1);
  // Each step smaller than the last, bar the sliver that lands at the end.
  const steps = zooms.slice(0, -1).map((z) => z.factor);
  expect(steps.every((f, i) => i === 0 || f <= steps[i - 1]!)).toBe(true);
});

test('a ctrl+wheel arriving mid-easing aims further', () => {
  const p = pinch();
  p.wheel(wheel({ deltaY: -10, ctrlKey: true }));
  frames.shift()!((now += 16));
  p.wheel(wheel({ deltaY: -10, ctrlKey: true }));
  runFrames();
  expect(zoomed()).toBeCloseTo(Math.exp(0.2), 10);
  expect(ended).toBe(1);
});

test('a cancel stops the easing without ending', () => {
  const p = pinch();
  p.wheel(wheel({ deltaY: -10, ctrlKey: true }));
  p.cancel();
  runFrames();
  expect(zooms).toHaveLength(0);
  expect(ended).toBe(0);
});

test('a cancel stops the glide without ending', () => {
  const p = pinch();
  p.onGestureStart(gesture('gesturestart', 1, 0));
  p.onGestureChange(gesture('gesturechange', 1.2, 16));
  p.onGestureChange(gesture('gesturechange', 1.5, 32));
  p.onGestureEnd(gesture('gestureend', 1.5, 40));
  p.cancel();
  runFrames();
  expect(ended).toBe(0);
  expect(zooms).toHaveLength(2);
});
