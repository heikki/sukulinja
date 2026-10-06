import { describe, expect, test } from 'bun:test';

import { transitionSchedule } from './schedule';

describe('transitionSchedule', () => {
  test('staggers Leave before the Move', () => {
    // Leave fades before the slide starts.
    expect(transitionSchedule(0).leave.delay).toBeLessThan(
      transitionSchedule(0).move.delay
    );
  });

  test('slides on an eased Move', () => {
    expect(transitionSchedule(0).move.duration).toBeGreaterThan(0);
    // An easing curve, not a linear ramp — the slide decelerates into place.
    expect(transitionSchedule(0).move.easing).not.toBe('linear');
  });

  test('short travel keeps the base duration', () => {
    expect(transitionSchedule(0).move.duration).toBe(
      transitionSchedule(100).move.duration
    );
  });

  test('longer travel takes longer, up to a cap', () => {
    const short = transitionSchedule(300).move.duration;
    const long = transitionSchedule(800).move.duration;
    const huge = transitionSchedule(5000).move.duration;
    expect(long).toBeGreaterThan(short);
    expect(huge).toBeGreaterThanOrEqual(long);
    expect(transitionSchedule(50000).move.duration).toBe(huge);
  });

  test('Enter waits out the whole Move at any distance', () => {
    for (const d of [0, 400, 5000]) {
      const { move, enter } = transitionSchedule(d);
      expect(enter.delay).toBe(move.delay + move.duration);
    }
  });
});
