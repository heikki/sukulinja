import { describe, expect, test } from 'bun:test';

import { transitionSchedule } from './schedule';

describe('transitionSchedule', () => {
  test('staggers Leave before the Move', () => {
    // Leave fades before the slide starts.
    expect(transitionSchedule.leave.delay).toBeLessThan(
      transitionSchedule.move.delay
    );
  });

  test('slides on a fixed-duration eased Move', () => {
    expect(transitionSchedule.move.duration).toBeGreaterThan(0);
    // An easing curve, not a linear ramp — the slide decelerates into place.
    expect(transitionSchedule.move.easing).not.toBe('linear');
  });
});
