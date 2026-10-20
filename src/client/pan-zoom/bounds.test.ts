import { describe, expect, test } from 'bun:test';

import { coastWithin, dragWithin, holdScale, overshoot } from './bounds';

const VIEW = { width: 800, height: 600 };

function content(left: number, top: number, width = 400, height = 300) {
  return {
    min: { x: left, y: top },
    max: { x: left + width, y: top + height }
  };
}

describe('overshoot', () => {
  test('nothing while content that fits stays on screen', () => {
    expect(overshoot(content(200, 150), VIEW)).toEqual({ x: 0, y: 0 });
    expect(overshoot(content(400, 0), VIEW)).toEqual({ x: 0, y: 0 });
  });

  test('how far content that fits has gone off screen, signed by which way', () => {
    expect(overshoot(content(450, 150), VIEW)).toEqual({ x: 50, y: 0 });
    expect(overshoot(content(-30, -60), VIEW)).toEqual({ x: -30, y: -60 });
  });

  test('nothing while larger content fills the screen', () => {
    expect(overshoot(content(-200, -100, 1200, 900), VIEW)).toEqual({
      x: 0,
      y: 0
    });
  });

  test('how far larger content has uncovered the screen', () => {
    // Its left edge 50 px in; its bottom edge 100 px up.
    expect(overshoot(content(50, -400, 1200, 900), VIEW)).toEqual({
      x: 50,
      y: -100
    });
  });
});

describe('overshoot with a reach', () => {
  // Edges may come in as far as the middle.
  const REACHING = {
    ...VIEW,
    reach: { min: { x: 400, y: 300 }, max: { x: 400, y: 300 } }
  };

  test('larger content may uncover as much of the screen as it overflows', () => {
    // 1000 wide overflows the 800 by 200: its left edge may come 200 in.
    expect(overshoot(content(200, 0, 1000, 600), REACHING).x).toBe(0);
    expect(overshoot(content(250, 0, 1000, 600), REACHING).x).toBe(50);
    expect(overshoot(content(-450, 0, 1000, 600), REACHING).x).toBe(-50);
  });

  test('no further in than the reach, however far it overflows', () => {
    expect(overshoot(content(400, 0, 3000, 600), REACHING).x).toBe(0);
    expect(overshoot(content(450, 0, 3000, 600), REACHING).x).toBe(50);
  });

  test('content that fits stays on screen still', () => {
    expect(overshoot(content(450, 150), REACHING)).toEqual({ x: 50, y: 0 });
  });

  test('only at the edges it is given', () => {
    // Only the bottom edge, 100 px up.
    const foot = {
      ...VIEW,
      reach: { min: { x: 0, y: 0 }, max: { x: 0, y: 100 } }
    };
    expect(overshoot(content(0, -400, 800, 900), foot).y).toBe(0);
    expect(overshoot(content(0, -500, 800, 900), foot).y).toBe(-100);
    expect(overshoot(content(0, 50, 800, 900), foot).y).toBe(50);
  });
});

describe('coastWithin', () => {
  test('follows a coast well within bounds', () => {
    expect(coastWithin({ x: 30, y: -20 }, content(200, 150), VIEW)).toEqual({
      x: 30,
      y: -20
    });
  });

  test('slows near a bound and never passes it', () => {
    // 40 px of room to the right.
    const near = coastWithin({ x: 30, y: 0 }, content(360, 150), VIEW).x;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(30);
    let left = 300;
    for (let i = 0; i < 100; i++) {
      left += coastWithin({ x: 30, y: 0 }, content(left, 150), VIEW).x;
      expect(left).toBeLessThanOrEqual(400);
    }
    expect(left).toBeCloseTo(400, 9);
  });

  test('nothing at a bound', () => {
    expect(coastWithin({ x: 30, y: 0 }, content(400, 150), VIEW).x).toBe(0);
  });
});

describe('dragWithin', () => {
  test('follows the pointer within bounds', () => {
    expect(dragWithin({ x: 50, y: -40 }, content(200, 150), VIEW)).toEqual({
      x: 50,
      y: -40
    });
  });

  test('stretches the part of a move past the bounds', () => {
    // 100 px of room to the right, then 100 px past it.
    const move = dragWithin({ x: 200, y: 0 }, content(300, 150), VIEW);
    expect(move.x).toBeGreaterThan(100);
    expect(move.x).toBeLessThan(200);
  });

  test('gives less the further out it is', () => {
    const near = dragWithin({ x: 10, y: 0 }, content(410, 150), VIEW).x;
    const far = dragWithin({ x: 10, y: 0 }, content(600, 150), VIEW).x;
    expect(near).toBeLessThan(10);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(0);
  });

  test('a long drag out never takes the content a whole view past', () => {
    let left = 400;
    for (let i = 0; i < 200; i += 1) {
      left += dragWithin({ x: 100, y: 0 }, content(left, 150), VIEW).x;
    }
    expect(left - 400).toBeLessThan(VIEW.width);
  });

  test('stretches as much in many small moves as in one', () => {
    let left = 300;
    for (let i = 0; i < 40; i += 1) {
      left += dragWithin({ x: 5, y: 0 }, content(left, 150), VIEW).x;
    }
    const once = 300 + dragWithin({ x: 200, y: 0 }, content(300, 150), VIEW).x;
    expect(left).toBeCloseTo(once, 6);
  });

  test('follows the pointer back toward the bounds', () => {
    expect(dragWithin({ x: -30, y: 0 }, content(500, 150), VIEW)).toEqual({
      x: -30,
      y: 0
    });
  });
});

describe('holdScale', () => {
  const BOUNDS = { minScale: 0.25, maxScale: 2 };

  test('within bounds, the scale asked for', () => {
    expect(holdScale(1, 1.5, BOUNDS)).toBe(1.5);
  });

  test('past the bounds, no further than them', () => {
    expect(holdScale(1.5, 100, BOUNDS)).toBe(2);
    expect(holdScale(0.5, 0.001, BOUNDS)).toBe(0.25);
  });

  test('from past them, back in it follows and out it stays put', () => {
    expect(holdScale(2.4, 2.2, BOUNDS)).toBeCloseTo(2.2, 10);
    expect(holdScale(2.4, 3, BOUNDS)).toBeCloseTo(2.4, 10);
  });
});
