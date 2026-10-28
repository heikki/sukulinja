import { afterEach, beforeEach, expect, test } from 'bun:test';

import { startGlide } from './glide';

let now = 0;
let frames: FrameRequestCallback[] = [];

function runFrames() {
  while (frames.length > 0) {
    const next = frames.shift()!;
    now += 16;
    next(now);
  }
}

const real = { performance };

beforeEach(() => {
  now = 0;
  frames = [];
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

test('a glide makes the whole pan in steps, then ends', () => {
  const moved = { x: 0, y: 0 };
  let steps = 0;
  let ended = false;
  startGlide(120, -40, 200, {
    onTick: (dx, dy) => {
      moved.x += dx;
      moved.y += dy;
      steps++;
    },
    onEnd: () => {
      ended = true;
    }
  });
  runFrames();
  expect(moved.x).toBeCloseTo(120);
  expect(moved.y).toBeCloseTo(-40);
  expect(steps).toBeGreaterThan(5);
  expect(ended).toBe(true);
});

test('a cancelled glide stops where it is and never ends', () => {
  let moved = 0;
  let ended = false;
  const glide = startGlide(100, 0, 200, {
    onTick: (dx) => {
      moved += dx;
    },
    onEnd: () => {
      ended = true;
    }
  });
  frames.shift()!((now += 16));
  glide.cancel();
  runFrames();
  expect(moved).toBeGreaterThan(0);
  expect(moved).toBeLessThan(100);
  expect(ended).toBe(false);
});
