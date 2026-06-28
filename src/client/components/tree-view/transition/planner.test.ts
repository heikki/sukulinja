import { describe, expect, test } from 'bun:test';

import type { Box, DrawnLine, EmitOutput, Point } from '../emit';
import {
  captureFirst,
  chartIds,
  planEnter,
  planLeave,
  planMove
} from './planner';
import type { MovePlan, RelayoutKind, ToScreen } from './planner';

// A fake chart→screen mapping: a pure offset, so an item's old screen (its prev
// position) and new screen (its next position) stay distinct and easy to verify
// whenever the position changed across the relayout.
function screen(p: Point) {
  return { x: p.x + 1000, y: p.y + 2000 };
}

function box(key: string, personId: number, pos: Point): Box {
  return { key, personId, pos };
}

function tie(key: string, baseKey: string, from: Point, to: Point): DrawnLine {
  return { key, baseKey, kind: 'tie', from, to };
}

function chart(boxes: Box[], lines: DrawnLine[] = []): EmitOutput {
  return {
    boxes,
    lines,
    extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
  };
}

// Mirrors production: capture the old chart through the (old) mapping, then plan
// against the new chart through the (new) mapping. One fake mapping plays both.
function plan(
  prev: EmitOutput,
  next: EmitOutput,
  kind: RelayoutKind,
  toScreen: ToScreen = screen
): MovePlan {
  return planMove(captureFirst(prev, kind, toScreen), next, kind, toScreen);
}

describe('planMove — boxes', () => {
  test('Focus relayout matches survivors by personId; from old → to new', () => {
    // Re-rooting changes every key, so survivors must match by personId.
    const prev = chart([
      box('a', 10, { x: 0, y: 0 }),
      box('b', 20, { x: 100, y: 0 })
    ]);
    const next = chart([
      box('c', 10, { x: 10, y: 0 }),
      box('d', 20, { x: 110, y: 0 })
    ]);

    const { boxes } = plan(prev, next, 'focus');

    expect(boxes).toEqual([
      { key: 'c', from: { x: 1000, y: 2000 }, to: { x: 1010, y: 2000 } },
      { key: 'd', from: { x: 1100, y: 2000 }, to: { x: 1110, y: 2000 } }
    ]);
  });

  test('new cards (next-only) and leaving cards (prev-only) are not movers', () => {
    const prev = chart([
      box('a', 10, { x: 0, y: 0 }),
      box('gone', 99, { x: 0, y: 0 })
    ]);
    const next = chart([
      box('c', 10, { x: 5, y: 0 }),
      box('new', 30, { x: 0, y: 0 })
    ]);

    const { boxes } = plan(prev, next, 'focus');

    expect(boxes.map((b) => b.key)).toEqual(['c']);
  });

  test('Generation relayout keeps pedigree-collapse duplicates apart by key', () => {
    // One person (personId 5) drawn as two boxes with distinct keys. A levels
    // change is rooted, so each matches its own key and both slide — matching by
    // personId would collapse them onto one position.
    const prev = chart([
      box('root/p5', 5, { x: 0, y: 0 }),
      box('root/f/p5', 5, { x: 200, y: 0 })
    ]);
    const next = chart([
      box('root/p5', 5, { x: 0, y: 50 }),
      box('root/f/p5', 5, { x: 200, y: 50 })
    ]);

    const { boxes } = plan(prev, next, 'generation');

    expect(boxes).toEqual([
      { key: 'root/p5', from: { x: 1000, y: 2000 }, to: { x: 1000, y: 2050 } },
      { key: 'root/f/p5', from: { x: 1200, y: 2000 }, to: { x: 1200, y: 2050 } }
    ]);
  });
});

describe('planMove — edges', () => {
  test('surviving edge carries new local geometry plus old → new screen', () => {
    const prev = chart(
      [],
      [tie('f1/tie', 'tie-1', { x: 0, y: 0 }, { x: 100, y: 0 })]
    );
    const next = chart(
      [],
      [tie('f1/tie', 'tie-1', { x: 0, y: 20 }, { x: 100, y: 20 })]
    );

    const { edges } = plan(prev, next, 'generation');

    expect(edges).toEqual([
      {
        key: 'f1/tie',
        local: { from: { x: 0, y: 20 }, to: { x: 100, y: 20 } },
        from: { from: { x: 1000, y: 2000 }, to: { x: 1100, y: 2000 } },
        to: { from: { x: 1000, y: 2020 }, to: { x: 1100, y: 2020 } }
      }
    ]);
  });

  test('Focus relayout matches edges by baseKey across re-rooted keys', () => {
    const prev = chart(
      [],
      [tie('old/tie', 'tie-1', { x: 0, y: 0 }, { x: 80, y: 0 })]
    );
    const next = chart(
      [],
      [tie('new/tie', 'tie-1', { x: 0, y: 0 }, { x: 80, y: 0 })]
    );

    const { edges } = plan(prev, next, 'focus');

    expect(edges.map((e) => e.key)).toEqual(['new/tie']);
  });
});

describe('planEnter', () => {
  const O = { x: 0, y: 0 };

  test('marks only persons / families new since the last layout', () => {
    // A Focus Relayout re-keys every box and edge; matching by identity means
    // only the genuinely-new person (3) and family (tie-2) fade, not all of them.
    const prev = chartIds(
      chart([box('a', 1, O), box('b', 2, O)], [tie('old/tie-1', 'tie-1', O, O)])
    );
    const next = chartIds(
      chart(
        [box('c', 2, O), box('d', 3, O)],
        [tie('new/tie-1', 'tie-1', O, O), tie('new/tie-2', 'tie-2', O, O)]
      )
    );

    const entering = planEnter(next, prev);

    expect([...entering.boxIds]).toEqual([3]);
    expect([...entering.edgeKeys]).toEqual(['tie-2']);
  });

  test('chartIds folds pedigree-collapse duplicates to one identity', () => {
    const ids = chartIds(chart([box('root/p5', 5, O), box('root/f/p5', 5, O)]));

    expect([...ids.boxIds]).toEqual([5]);
  });
});

describe('planLeave', () => {
  const O = { x: 0, y: 0 };

  test('returns the boxes and edges the relayout drops, with geometry', () => {
    // A shrinking Generation Relayout: the outer person and family fall away.
    const prev = chart(
      [box('a', 1, { x: 0, y: 0 }), box('b', 2, { x: 50, y: 90 })],
      [
        tie('e1', 'tie-1', O, O),
        tie('e2', 'tie-2', { x: 50, y: 0 }, { x: 90, y: 0 })
      ]
    );
    const next = chart(
      [box('a', 1, { x: 0, y: 0 })],
      [tie('e1', 'tie-1', O, O)]
    );

    const leave = planLeave(prev, next, 'generation');

    expect(leave.boxes).toEqual([box('b', 2, { x: 50, y: 90 })]);
    expect(leave.edges).toEqual([
      tie('e2', 'tie-2', { x: 50, y: 0 }, { x: 90, y: 0 })
    ]);
  });

  test('Focus relayout: a person still drawn elsewhere does not leave', () => {
    // personId 2 re-keys but survives; only personId 3 actually departs.
    const prev = chart([box('old2', 2, O), box('old3', 3, O)]);
    const next = chart([box('new2', 2, O)]);

    const leave = planLeave(prev, next, 'focus');

    expect(leave.boxes.map((b) => b.personId)).toEqual([3]);
  });
});
