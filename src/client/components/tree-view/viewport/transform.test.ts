import { describe, expect, test } from 'bun:test';

import type { Extents, Point } from '../emit';
import {
  chartToScreen,
  fitTo,
  nudgeIntoView,
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

describe('nudgeIntoView', () => {
  const vbo = { x: 0, y: 0 };
  const canvas: Viewport = { width: 800, height: 600 };
  const focus = { x: 100, y: 100 };
  function region(min: Point, max: Point): Extents {
    return { min, max };
  }
  function nudge(
    t: Transform,
    r: Extents,
    chart: Extents = r,
    ...cores: Extents[]
  ) {
    return nudgeIntoView(t, {
      region: r,
      chart,
      cores: cores.length > 0 ? cores : [{ min: focus, max: focus }],
      focus,
      viewBoxOrigin: vbo,
      canvas,
      marginPx: 24
    });
  }

  test('returns the pan untouched when the region already fits', () => {
    const t: Transform = { pan: { x: 50, y: 50 }, scale: 1 };
    const next = nudge(t, region({ x: 0, y: 0 }, { x: 200, y: 200 }));
    approx(next, t.pan);
  });

  test('centres the region on an axis whose edge clips', () => {
    // Region spans screen x -30..170 and y 560..760: left clips, bottom clips.
    // Each axis ends centred: 200 wide in 800 → x 300; 200 tall in 600 → y 200.
    const t: Transform = { pan: { x: -30, y: 560 }, scale: 1 };
    const next = nudge(t, region({ x: 0, y: 0 }, { x: 200, y: 200 }));
    approx(next, { x: 300, y: 200 });
  });

  test('centres when the right and top edges clip', () => {
    // Region spans screen x 700..900 and y -50..150.
    const t: Transform = { pan: { x: 700, y: -50 }, scale: 1 };
    const next = nudge(t, region({ x: 0, y: 0 }, { x: 200, y: 200 }));
    approx(next, { x: 300, y: 200 });
  });

  test('measures the region at the current scale', () => {
    // 200 chart px at 2x is 400 screen px; right edge at 600+400 = 1000.
    const t: Transform = { pan: { x: 600, y: 50 }, scale: 2 };
    const next = nudge(t, region({ x: 0, y: 0 }, { x: 200, y: 100 }));
    approx(next, { x: 200, y: 50 });
  });

  test('centres Focus on an axis the region is too large for', () => {
    // 1000 chart px wide in an 800 px canvas: x cannot fit, y can.
    const t: Transform = { pan: { x: 10, y: 50 }, scale: 1 };
    const next = nudge(
      t,
      region({ x: 0, y: 0 }, { x: 1000, y: 200 }),
      region({ x: -2000, y: 0 }, { x: 3000, y: 200 })
    );
    // Focus x=100 lands at canvas centre 400 → pan.x = 300; y untouched.
    approx(next, { x: 300, y: 50 });
  });

  test('pulls a tall chart down when it clips on top with room below', () => {
    // Region fits (screen y 300..500) but the chart runs far above and ends at
    // screen y 500, leaving 76 px empty below the bottom margin.
    const t: Transform = { pan: { x: 50, y: 300 }, scale: 1 };
    const next = nudge(
      t,
      region({ x: 0, y: 0 }, { x: 200, y: 200 }),
      region({ x: 0, y: -1000 }, { x: 200, y: 200 })
    );
    approx(next, { x: 50, y: 376 });
  });

  test('leaves a tall chart alone while it still covers the canvas', () => {
    const t: Transform = { pan: { x: 50, y: 300 }, scale: 1 };
    const next = nudge(
      t,
      region({ x: 0, y: 0 }, { x: 200, y: 200 }),
      region({ x: 0, y: -1000 }, { x: 200, y: 1000 })
    );
    approx(next, t.pan);
  });

  test('centres a chart that fits the canvas but clips an edge', () => {
    // Chart 400 tall at screen y 300..700 clips the bottom; the region fits.
    const t: Transform = { pan: { x: 50, y: 300 }, scale: 1 };
    const next = nudge(
      t,
      region({ x: 0, y: 0 }, { x: 100, y: 100 }),
      region({ x: 0, y: 0 }, { x: 200, y: 400 })
    );
    approx(next, { x: 50, y: 100 });
  });

  describe('when the region is too wide to fit', () => {
    // Focus x=100 (screen 100 at pan 0); the region and chart both dwarf the
    // 800 px canvas, so Focus would be centred at screen 400 (pan x = 300).
    const wide = region({ x: 0, y: 0 }, { x: 3000, y: 200 });
    const chart = region({ x: -2000, y: 0 }, { x: 5000, y: 200 });
    const t: Transform = { pan: { x: 0, y: 50 }, scale: 1 };

    test('keeps a core reaching far left on screen, not centred away', () => {
      // Core 0..300 would land at screen 100..400 once Focus is centred, so
      // it is fine; widen it left: a spouse at x -500 would land at -100.
      const core = region({ x: -500, y: 0 }, { x: 150, y: 200 });
      const next = nudge(t, wide, chart, core);
      // Centred pan 300 puts the core at screen -200..450; its left edge is
      // pulled back to the 24 px margin: pan 300 + 224 = 524.
      approx(next, { x: 524, y: 50 });
    });

    test('keeps a core reaching far right on screen', () => {
      const core = region({ x: 50, y: 0 }, { x: 700, y: 200 });
      const next = nudge(t, wide, chart, core);
      // Centred pan 300 puts the core at screen 350..1000; its right edge is
      // pulled back to 776: pan 300 - 224 = 76.
      approx(next, { x: 76, y: 50 });
    });

    test('leaves Focus centred when the core already fits', () => {
      const core = region({ x: 0, y: 0 }, { x: 200, y: 200 });
      const next = nudge(t, wide, chart, core);
      approx(next, { x: 300, y: 50 });
    });

    test('leaves Focus centred when even the core is too wide', () => {
      const core = region({ x: -600, y: 0 }, { x: 600, y: 200 });
      const next = nudge(t, wide, chart, core);
      approx(next, { x: 300, y: 50 });
    });

    test('prefers the larger core when it fits', () => {
      const family = region({ x: -600, y: 0 }, { x: 150, y: 400 });
      const core = region({ x: -100, y: 0 }, { x: 150, y: 200 });
      const next = nudge(t, wide, chart, family, core);
      // Centred pan 300 puts the family at screen -300..450; pulled to the
      // margin: pan 300 + 324 = 624. (The smaller core alone would stay at 300.)
      approx(next, { x: 624, y: 50 });
    });

    test('falls back to the next core when the larger one is too wide', () => {
      const family = region({ x: -1500, y: 0 }, { x: 150, y: 400 });
      const core = region({ x: -500, y: 0 }, { x: 150, y: 200 });
      const next = nudge(t, wide, chart, family, core);
      // The family (1650 wide) cannot fit; the core can: -200 → margin 24.
      approx(next, { x: 524, y: 50 });
    });
  });

  test('never changes scale', () => {
    const t: Transform = { pan: { x: -500, y: 900 }, scale: 0.5 };
    const next = nudge(t, region({ x: 0, y: 0 }, { x: 200, y: 200 }));
    expect(Number.isFinite(next.x) && Number.isFinite(next.y)).toBe(true);
  });
});
