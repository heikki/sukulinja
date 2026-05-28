import { describe, expect, test } from 'bun:test';

import type { Extents, Point } from '../emit';
import {
  chartToScreen,
  fitTo,
  pinChartPointAtScreen,
  zoomAt
} from './transform';
import type { FitOptions, ScaleBounds, Transform, Viewport } from './transform';

const BOUNDS: ScaleBounds = { minScale: 0.25, maxScale: 2 };

function approx(a: Point, b: Point, eps = 1e-9) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps);
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps);
}

describe('chartToScreen / pinChartPointAtScreen round-trip', () => {
  test('pin recovers the pan that maps chartPoint to screenPoint', () => {
    const t: Transform = { pan: { x: 17, y: -42 }, scale: 1.3 };
    const vbo = { x: -200, y: -150 };
    const chartPoint = { x: 60, y: 25 };
    const screen = chartToScreen(t, chartPoint, vbo);
    const recoveredPan = pinChartPointAtScreen(
      t.scale,
      chartPoint,
      screen,
      vbo
    );
    approx(recoveredPan, t.pan);
  });
});

describe('zoomAt cursor-anchor invariant', () => {
  const cases: Array<{
    name: string;
    t: Transform;
    cursor: Point;
    factor: number;
    vbo: Point;
  }> = [
    {
      name: 'scale=1, cursor at origin, vbo zero',
      t: { pan: { x: 0, y: 0 }, scale: 1 },
      cursor: { x: 100, y: 100 },
      factor: 1.5,
      vbo: { x: 0, y: 0 }
    },
    {
      name: 'starting scale 0.7, off-center cursor',
      t: { pan: { x: -50, y: 30 }, scale: 0.7 },
      cursor: { x: 320, y: 180 },
      factor: 1.25,
      vbo: { x: -100, y: -200 }
    },
    {
      name: 'zoom out (factor < 1) with non-zero vbo',
      t: { pan: { x: 200, y: 200 }, scale: 1.6 },
      cursor: { x: 400, y: 300 },
      factor: 0.5,
      vbo: { x: -345, y: 78 }
    }
  ];

  for (const c of cases) {
    test(c.name, () => {
      const cursorChart = {
        x: (c.cursor.x - c.t.pan.x) / c.t.scale + c.vbo.x,
        y: (c.cursor.y - c.t.pan.y) / c.t.scale + c.vbo.y
      };
      const next = zoomAt(c.t, c.cursor, c.factor, BOUNDS);
      const projected = chartToScreen(next, cursorChart, c.vbo);
      approx(projected, c.cursor, 1e-6);
      expect(next.scale).toBeCloseTo(c.t.scale * c.factor, 10);
    });
  }
});

describe('zoomAt clamping', () => {
  test('clamps at maxScale; cursor-anchor invariant still holds', () => {
    const t: Transform = { pan: { x: 10, y: -5 }, scale: 1.8 };
    const cursor = { x: 250, y: 250 };
    const vbo = { x: -50, y: -50 };
    const cursorChart = {
      x: (cursor.x - t.pan.x) / t.scale + vbo.x,
      y: (cursor.y - t.pan.y) / t.scale + vbo.y
    };
    const next = zoomAt(t, cursor, 5, BOUNDS);
    expect(next.scale).toBe(BOUNDS.maxScale);
    approx(chartToScreen(next, cursorChart, vbo), cursor, 1e-6);
  });

  test('clamps at minScale; cursor-anchor invariant still holds', () => {
    const t: Transform = { pan: { x: 10, y: -5 }, scale: 0.4 };
    const cursor = { x: 250, y: 250 };
    const vbo = { x: -50, y: -50 };
    const cursorChart = {
      x: (cursor.x - t.pan.x) / t.scale + vbo.x,
      y: (cursor.y - t.pan.y) / t.scale + vbo.y
    };
    const next = zoomAt(t, cursor, 0.01, BOUNDS);
    expect(next.scale).toBe(BOUNDS.minScale);
    approx(chartToScreen(next, cursorChart, vbo), cursor, 1e-6);
  });

  test('already clamped transform with same-direction factor stays put', () => {
    const t: Transform = {
      pan: { x: 7, y: 11 },
      scale: BOUNDS.maxScale
    };
    const next = zoomAt(t, { x: 100, y: 100 }, 2, BOUNDS);
    expect(next.scale).toBe(BOUNDS.maxScale);
    approx(next.pan, t.pan);
  });

  test('elastic min: scale below minScale stays put when zoomed further out', () => {
    // fitTo can produce sub-minScale scales for huge charts. Wheeling out
    // from there must not snap scale UP to minScale.
    const t: Transform = { pan: { x: 5, y: 5 }, scale: 0.1 };
    const next = zoomAt(t, { x: 100, y: 100 }, 0.5, BOUNDS);
    expect(next.scale).toBe(0.1);
    approx(next.pan, t.pan);
  });

  test('elastic min: can zoom back in toward bounds from below minScale', () => {
    const t: Transform = { pan: { x: 5, y: 5 }, scale: 0.1 };
    const next = zoomAt(t, { x: 100, y: 100 }, 1.5, BOUNDS);
    expect(next.scale).toBeCloseTo(0.15, 10);
  });
});

describe('zoomAt identity factor', () => {
  test('factor of 1 returns equal transform', () => {
    const t: Transform = { pan: { x: 3, y: -2 }, scale: 0.9 };
    const next = zoomAt(t, { x: 100, y: 200 }, 1, BOUNDS);
    expect(next.scale).toBe(t.scale);
    approx(next.pan, t.pan);
  });
});

describe('fitTo', () => {
  const OPTS: FitOptions = { maxScale: 1, marginPx: 24 };

  function projectCorners(extents: Extents, vbo: Point, t: Transform) {
    return {
      tl: chartToScreen(t, extents.min, vbo),
      br: chartToScreen(t, extents.max, vbo),
      center: chartToScreen(
        t,
        {
          x: (extents.min.x + extents.max.x) / 2,
          y: (extents.min.y + extents.max.y) / 2
        },
        vbo
      )
    };
  }

  test('fits content fully inside viewport with margin (wide chart)', () => {
    const extents: Extents = {
      min: { x: -1000, y: -100 },
      max: { x: 1000, y: 100 }
    };
    const vbo = { x: extents.min.x - 24, y: extents.min.y - 24 };
    const viewport: Viewport = { width: 800, height: 600 };
    const t = fitTo(extents, vbo, viewport, OPTS);
    const c = projectCorners(extents, vbo, t);
    // Content corners are inside viewport with at least marginPx breathing room
    expect(c.tl.x).toBeGreaterThanOrEqual(OPTS.marginPx - 1e-6);
    expect(c.tl.y).toBeGreaterThanOrEqual(OPTS.marginPx - 1e-6);
    expect(c.br.x).toBeLessThanOrEqual(viewport.width - OPTS.marginPx + 1e-6);
    expect(c.br.y).toBeLessThanOrEqual(viewport.height - OPTS.marginPx + 1e-6);
  });

  test('respects maxScale: small content not blown up past 1:1', () => {
    const extents: Extents = {
      min: { x: 0, y: 0 },
      max: { x: 50, y: 30 }
    };
    const vbo = { x: extents.min.x - 24, y: extents.min.y - 24 };
    const viewport: Viewport = { width: 1200, height: 800 };
    const t = fitTo(extents, vbo, viewport, OPTS);
    expect(t.scale).toBe(OPTS.maxScale);
  });

  test('centers content in viewport', () => {
    const extents: Extents = {
      min: { x: -345, y: 78 },
      max: { x: 220, y: 444 }
    };
    const vbo = { x: extents.min.x - 24, y: extents.min.y - 24 };
    const viewport: Viewport = { width: 900, height: 700 };
    const t = fitTo(extents, vbo, viewport, OPTS);
    const c = projectCorners(extents, vbo, t);
    approx(c.center, { x: viewport.width / 2, y: viewport.height / 2 }, 1e-6);
  });

  test('wide chart in tall viewport fits by width; tall chart by height', () => {
    const wide: Extents = {
      min: { x: 0, y: 0 },
      max: { x: 2000, y: 100 }
    };
    const tall: Extents = {
      min: { x: 0, y: 0 },
      max: { x: 100, y: 2000 }
    };
    const viewport: Viewport = { width: 800, height: 800 };
    const vboW = { x: wide.min.x - 24, y: wide.min.y - 24 };
    const vboT = { x: tall.min.x - 24, y: tall.min.y - 24 };
    const tw = fitTo(wide, vboW, viewport, OPTS);
    const tt = fitTo(tall, vboT, viewport, OPTS);
    const expectedW = (viewport.width - OPTS.marginPx * 2) / 2000;
    const expectedT = (viewport.height - OPTS.marginPx * 2) / 2000;
    expect(tw.scale).toBeCloseTo(expectedW, 10);
    expect(tt.scale).toBeCloseTo(expectedT, 10);
  });
});
