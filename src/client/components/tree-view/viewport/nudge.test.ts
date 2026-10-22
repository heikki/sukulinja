import { describe, expect, test } from 'bun:test';

import type { Extents, Point, Transform, Viewport } from '@/client/pan-zoom';

import { nudgeIntoView } from './nudge';

function approx(a: Point, b: Point, eps = 1e-9) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps);
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps);
}

describe('nudgeIntoView', () => {
  const vbo = { x: 0, y: 0 };
  const canvas: Viewport = { width: 800, height: 600 };
  const root = { x: 100, y: 100 };
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
      cores: cores.length > 0 ? cores : [{ min: root, max: root }],
      root,
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

  test('centres Root on an axis the region is too large for', () => {
    // 1000 chart px wide in an 800 px canvas: x cannot fit, y can.
    const t: Transform = { pan: { x: 10, y: 50 }, scale: 1 };
    const next = nudge(
      t,
      region({ x: 0, y: 0 }, { x: 1000, y: 200 }),
      region({ x: -2000, y: 0 }, { x: 3000, y: 200 })
    );
    // Root x=100 lands at canvas centre 400 → pan.x = 300; y untouched.
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
    // Root x=100 (screen 100 at pan 0); the region and chart both dwarf the
    // 800 px canvas, so Root would be centred at screen 400 (pan x = 300).
    const wide = region({ x: 0, y: 0 }, { x: 3000, y: 200 });
    const chart = region({ x: -2000, y: 0 }, { x: 5000, y: 200 });
    const t: Transform = { pan: { x: 0, y: 50 }, scale: 1 };

    test('keeps a core reaching far left on screen, not centred away', () => {
      // Core 0..300 would land at screen 100..400 once Root is centred, so
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

    test('leaves Root centred when the core already fits', () => {
      const core = region({ x: 0, y: 0 }, { x: 200, y: 200 });
      const next = nudge(t, wide, chart, core);
      approx(next, { x: 300, y: 50 });
    });

    test('leaves Root centred when even the core is too wide', () => {
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
