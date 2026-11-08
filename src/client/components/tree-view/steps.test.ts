import { describe, expect, test } from 'bun:test';

import type { Box } from './emit';
import { stepFrom } from './steps';
import type { Step } from './steps';

// Three rows, 200 apart. A couple over a lone card centred under them, an
// unrelated card far right on the middle row, and two cards below.
const BOXES: Box[] = [
  { key: 'fa', personId: 1, pos: { x: -66, y: -200 } },
  { key: 'mo', personId: 2, pos: { x: 66, y: -200 } },
  { key: 'kid', personId: 3, pos: { x: 0, y: 0 } },
  { key: 'far', personId: 4, pos: { x: 900, y: 0 } },
  { key: 'left', personId: 5, pos: { x: -100, y: 200 } },
  { key: 'right', personId: 6, pos: { x: 700, y: 200 } }
];

function stepOn(from: string, step: Step) {
  return stepFrom(BOXES, from, step)?.key ?? null;
}

describe('stepFrom', () => {
  test('↑ from a card centred under a couple goes to the left one', () => {
    expect(stepOn('kid', 'up')).toBe('fa');
  });

  test('↑ and ↓ go to the nearest card on the next row, whoever it is', () => {
    expect(stepOn('mo', 'down')).toBe('kid');
    expect(stepOn('far', 'up')).toBe('mo');
    expect(stepOn('far', 'down')).toBe('right');
    expect(stepOn('kid', 'down')).toBe('left');
  });

  test('past the top and bottom rows, ↑ and ↓ go nowhere', () => {
    expect(stepOn('fa', 'up')).toBeNull();
    expect(stepOn('left', 'down')).toBeNull();
  });

  test('←/→ walk the row in drawn order, without wrapping', () => {
    expect(stepOn('kid', 'right')).toBe('far');
    expect(stepOn('far', 'left')).toBe('kid');
    expect(stepOn('far', 'right')).toBeNull();
    expect(stepOn('kid', 'left')).toBeNull();
  });

  test('a step from a box the chart no longer draws goes nowhere', () => {
    expect(stepOn('gone', 'up')).toBeNull();
  });
});
