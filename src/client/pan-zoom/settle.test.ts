import { afterEach, beforeEach, expect, test } from 'bun:test';

import { settledView, startSettle } from './settle';
import type { Transform } from './transform';

let now = 0;
let frames: FrameRequestCallback[] = [];

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

function run(from: Transform, to: Transform) {
  let view = from;
  const seen: Transform[] = [];
  let ended = false;
  const handle = startSettle(60, {
    view: () => view,
    rest: () => to,
    setView: (t) => {
      view = t;
      seen.push(t);
    },
    onEnd: () => {
      ended = true;
    }
  });
  for (let i = 0; i < 500 && frames.length > 0; i++) {
    now += 16;
    frames.shift()!(now);
  }
  return { handle, seen, ended };
}

test('nothing to do for a view already at rest', () => {
  const t = { pan: { x: 10, y: 20 }, scale: 1 };
  expect(run(t, t).handle).toBeNull();
});

test('arrives exactly, then ends', () => {
  const to = { pan: { x: -40, y: 15 }, scale: 2 };
  const { seen, ended } = run({ pan: { x: 0, y: 0 }, scale: 2.6 }, to);
  expect(seen.at(-1)).toEqual(to);
  expect(ended).toBe(true);
});

test('turns about the point both views share on screen', () => {
  const from = { pan: { x: 100, y: 50 }, scale: 3 };
  // Scaled to 2 about the screen point (400, 300).
  const to = {
    pan: { x: 400 - (2 / 3) * 300, y: 300 - (2 / 3) * 250 },
    scale: 2
  };
  const { seen } = run(from, to);
  for (const t of seen) {
    const content = {
      x: (400 - t.pan.x) / t.scale,
      y: (300 - t.pan.y) / t.scale
    };
    expect(content.x).toBeCloseTo(100, 6);
    expect(content.y).toBeCloseTo(250 / 3, 6);
  }
});

test('a settled view is within its scale and content bounds', () => {
  const to = settledView(
    { pan: { x: 500, y: 0 }, scale: 2.5 },
    { x: 400, y: 300 },
    {
      scale: { minScale: 0.5, maxScale: 2 },
      content: (t) => ({
        min: t.pan,
        max: { x: t.pan.x + t.scale * 400, y: t.pan.y + t.scale * 300 }
      }),
      screen: { width: 800, height: 600 }
    }
  );
  expect(to.scale).toBe(2);
  expect(to.pan.x).toBeLessThanOrEqual(400);
  expect(to.pan.y + to.scale * 300).toBeGreaterThanOrEqual(300);
});

test('sets off gently, then comes in without overshooting', () => {
  const from = { pan: { x: 100, y: 0 }, scale: 1 };
  const to = { pan: { x: 0, y: 0 }, scale: 1 };
  const { seen } = run(from, to);
  // A sixteenth of a second in, it has gone only a little of the way.
  expect(seen[0]!.pan.x).toBeGreaterThan(90);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]!.pan.x).toBeLessThanOrEqual(seen[i - 1]!.pan.x);
    expect(seen[i]!.pan.x).toBeGreaterThanOrEqual(0);
  }
});
