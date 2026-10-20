import { afterEach, beforeEach, expect, test } from 'bun:test';

import { startFling } from './fling';
import type { Point } from './transform';

const OPTIONS = { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 };

let now = 0;
let frames: FrameRequestCallback[] = [];

function runFrames(limit = 1000) {
  let n = 0;
  while (frames.length > 0 && n < limit) {
    const next = frames.shift()!;
    now += 16;
    next(now);
    n += 1;
  }
  return n;
}

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
  delete g.performance;
});

// Content whose bound sits at `bound` on each axis: past it is over.
function flingFrom(at: Point, v: Point, bound: Point = { x: 500, y: 500 }) {
  const pos = { ...at };
  let peak = { ...at };
  let ended = false;
  function over() {
    return {
      x: Math.max(0, pos.x - bound.x),
      y: Math.max(0, pos.y - bound.y)
    };
  }
  function moveBy(dx: number, dy: number) {
    pos.x += dx;
    pos.y += dy;
    peak = { x: Math.max(peak.x, pos.x), y: Math.max(peak.y, pos.y) };
  }
  const handle = startFling(v, OPTIONS, {
    over,
    onTick: moveBy,
    // Within bounds a coast stops at them.
    coast: (dx, dy) => {
      const moved = {
        x: pos.x > bound.x ? dx : Math.min(dx, bound.x - pos.x),
        y: pos.y > bound.y ? dy : Math.min(dy, bound.y - pos.y)
      };
      moveBy(moved.x, moved.y);
      return moved;
    },
    onEnd: () => {
      ended = true;
    }
  });
  const frameCount = runFrames();
  return { handle, pos, peak, ended: () => ended, frameCount };
}

test('nothing to do when let go slowly within bounds', () => {
  const { handle } = flingFrom({ x: 0, y: 0 }, { x: 0.1, y: 0 });
  expect(handle).toBeNull();
});

test('within bounds it coasts as momentum does', () => {
  const { pos, ended } = flingFrom({ x: 0, y: 0 }, { x: 1, y: 0 });
  // An exponential decay's whole travel is about v · tau.
  expect(pos.x).toBeGreaterThan(200);
  expect(pos.x).toBeLessThan(300);
  expect(ended()).toBe(true);
});

test('a fling into the bound stops there, never past it', () => {
  const { pos, peak, ended } = flingFrom({ x: 400, y: 0 }, { x: 3, y: 0 });
  expect(peak.x).toBe(500);
  expect(pos.x).toBe(500);
  expect(ended()).toBe(true);
});

test('let go past the bound, it springs back even at rest', () => {
  const { pos, peak, ended } = flingFrom({ x: 650, y: 0 }, { x: 0, y: 0 });
  expect(peak.x).toBe(650);
  expect(pos.x).toBeCloseTo(500, 6);
  expect(ended()).toBe(true);
});

test('each axis goes its own way: one stops at its bound, the other coasts on', () => {
  const { pos } = flingFrom(
    { x: 0, y: 490 },
    { x: 1, y: 1 },
    { x: 10_000, y: 500 }
  );
  expect(pos.y).toBeCloseTo(500, 6);
  expect(pos.x).toBeGreaterThan(200);
});

test('a cancelled fling stops without ending', () => {
  const pos = { x: 600, y: 0 };
  let ended = false;
  const handle = startFling({ x: 0, y: 0 }, OPTIONS, {
    over: () => ({ x: Math.max(0, pos.x - 500), y: 0 }),
    onTick: (dx) => {
      pos.x += dx;
    },
    coast: (dx, dy) => {
      pos.x += dx;
      return { x: dx, y: dy };
    },
    onEnd: () => {
      ended = true;
    }
  });
  handle?.cancel();
  runFrames();
  expect(pos.x).toBe(600);
  expect(ended).toBe(false);
});

test('let go past the bound still moving out, it goes no further', () => {
  const { pos, peak, ended } = flingFrom({ x: 650, y: 0 }, { x: 5, y: 0 });
  expect(peak.x).toBe(650);
  expect(pos.x).toBeCloseTo(500, 6);
  expect(ended()).toBe(true);
});
