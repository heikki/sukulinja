import { describe, expect, test } from 'bun:test';

import type { Box, DrawnLine, EmitOutput, Point } from '../emit';
import { captureFirst, enterAll, planTransition } from './planner';
import type { RelayoutKind, ToScreen, TransitionPlan } from './planner';

// A fake chart→screen mapping: a pure offset, so an item's old screen (its prev
// position) and new screen (its next position) stay distinct and easy to verify
// whenever the position changed across the relayout.
function screen(p: Point) {
  return { x: p.x + 1000, y: p.y + 2000 };
}

// Cards smaller than the spacing the tests lay them out at.
const CARD = { width: 40, height: 40 };

function box(key: string, personId: number, pos: Point): Box {
  return { key, personId, pos };
}

function tie(key: string, baseKey: string, from: Point, to: Point): DrawnLine {
  return { key, baseKey, kind: 'tie', points: [from, to], attach: [] };
}

// A line joined to the given boxes.
function attached(line: DrawnLine, attach: string[]): DrawnLine {
  return { ...line, attach };
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
): TransitionPlan {
  return planTransition(captureFirst(prev, toScreen), next, {
    kind,
    toScreen,
    card: CARD
  });
}

describe('planTransition — boxes', () => {
  test('Focus relayout pairs survivors by personId; from old → to new', () => {
    // Re-rooting changes every key, so survivors must match by personId.
    const prev = chart([
      box('a', 10, { x: 0, y: 0 }),
      box('b', 20, { x: 100, y: 0 })
    ]);
    const next = chart([
      box('c', 10, { x: 10, y: 0 }),
      box('d', 20, { x: 110, y: 0 })
    ]);

    const { move, pairs } = plan(prev, next, 'focus');

    expect(move.boxes).toEqual([
      { key: 'c', from: { x: 1000, y: 2000 }, to: { x: 1010, y: 2000 } },
      { key: 'd', from: { x: 1100, y: 2000 }, to: { x: 1110, y: 2000 } }
    ]);
    expect([...pairs.boxes]).toEqual([
      ['a', 'c'],
      ['b', 'd']
    ]);
  });

  test('every box lands in exactly one phase', () => {
    const prev = chart([
      box('a', 10, { x: 0, y: 0 }),
      box('gone', 99, { x: 100, y: 0 })
    ]);
    const next = chart([
      box('c', 10, { x: 5, y: 0 }),
      box('new', 30, { x: 100, y: 0 })
    ]);

    const { move, enter, leave } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => b.key)).toEqual(['c']);
    expect([...enter.boxKeys]).toEqual(['new']);
    expect(leave.boxes).toEqual([box('gone', 99, { x: 100, y: 0 })]);
  });

  test('Generation relayout keeps pedigree-collapse duplicates apart by key', () => {
    // One person (personId 5) drawn as two boxes with distinct keys. A levels
    // change is rooted, so each matches its own key and both slide.
    const prev = chart([
      box('root/p5', 5, { x: 0, y: 0 }),
      box('root/f/p5', 5, { x: 200, y: 0 })
    ]);
    const next = chart([
      box('root/p5', 5, { x: 0, y: 50 }),
      box('root/f/p5', 5, { x: 200, y: 50 })
    ]);

    const { move } = plan(prev, next, 'generation');

    expect(move.boxes).toEqual([
      { key: 'root/p5', from: { x: 1000, y: 2000 }, to: { x: 1000, y: 2050 } },
      { key: 'root/f/p5', from: { x: 1200, y: 2000 }, to: { x: 1200, y: 2050 } }
    ]);
  });

  test('Focus relayout pairs a repeated person one-to-one, nearest first', () => {
    // Person 5 is drawn twice before and once after. The nearer old instance
    // slides; the other fades out instead of vanishing or sharing the slide.
    const prev = chart([
      box('far', 5, { x: 0, y: 0 }),
      box('near', 5, { x: 500, y: 0 })
    ]);
    const next = chart([box('only', 5, { x: 520, y: 0 })]);

    const { move, leave } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => [b.key, b.from.x])).toEqual([['only', 1500]]);
    expect(leave.boxes.map((b) => b.key)).toEqual(['far']);
  });

  test('a person newly drawn twice slides into the nearer spot, fades into the other', () => {
    const prev = chart([box('old', 5, { x: 500, y: 0 })]);
    const next = chart([
      box('far', 5, { x: 0, y: 300 }),
      box('near', 5, { x: 520, y: 0 })
    ]);

    const { move, enter } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => b.key)).toEqual(['near']);
    expect([...enter.boxKeys]).toEqual(['far']);
  });

  test('a long slide that would cross another card fades instead', () => {
    // Person 2 jumps from the right of person 1 to its left along the same row,
    // passing through it. The far traveller leaves and re-enters; the short one
    // still slides.
    const prev = chart([
      box('a1', 1, { x: 0, y: 0 }),
      box('a2', 2, { x: 100, y: 0 })
    ]);
    const next = chart([
      box('b1', 1, { x: 10, y: -100 }),
      box('b2', 2, { x: -300, y: -100 })
    ]);

    const { move, enter, leave } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => b.key)).toEqual(['b1']);
    expect([...enter.boxKeys]).toEqual(['b2']);
    expect(leave.boxes.map((b) => b.key)).toEqual(['a2']);
  });

  test('slides that keep their order in a row all move', () => {
    const prev = chart([
      box('a1', 1, { x: 0, y: 0 }),
      box('a2', 2, { x: 100, y: 0 })
    ]);
    const next = chart([
      box('b1', 1, { x: -300, y: -100 }),
      box('b2', 2, { x: -200, y: -100 })
    ]);

    const { move } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => b.key)).toEqual(['b1', 'b2']);
  });
});

describe('planTransition — edges', () => {
  test('surviving edge carries its new local points plus old → new screen', () => {
    const prev = chart(
      [],
      [tie('f1/tie', 'tie-1', { x: 0, y: 0 }, { x: 100, y: 0 })]
    );
    const next = chart(
      [],
      [tie('f1/tie', 'tie-1', { x: 0, y: 20 }, { x: 100, y: 20 })]
    );

    const { move } = plan(prev, next, 'generation');

    expect(move.edges).toEqual([
      {
        key: 'f1/tie',
        kind: 'tie',
        local: [
          { x: 0, y: 20 },
          { x: 100, y: 20 }
        ],
        from: [
          { x: 1000, y: 2000 },
          { x: 1100, y: 2000 }
        ],
        to: [
          { x: 1000, y: 2020 },
          { x: 1100, y: 2020 }
        ]
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

    const { move } = plan(prev, next, 'focus');

    expect(move.edges.map((e) => e.key)).toEqual(['new/tie']);
  });

  test('an edge slides only alongside the boxes it touches', () => {
    // The tie joins persons 1 and 2. Before, it joined the instances that
    // survive; after, it joins a new instance of person 2 that fades in — so the
    // tie fades too rather than sliding with one end hanging free.
    const prev = chart(
      [box('a1', 1, { x: 0, y: 0 }), box('a2', 2, { x: 100, y: 0 })],
      [
        attached(tie('a/tie', 'tie-1', { x: 20, y: 0 }, { x: 80, y: 0 }), [
          'a1',
          'a2'
        ])
      ]
    );
    const next = chart(
      [
        box('b1', 1, { x: 0, y: 0 }),
        box('b2', 2, { x: 100, y: 0 }),
        box('b2dup', 2, { x: 0, y: 300 })
      ],
      [
        attached(tie('b/tie', 'tie-1', { x: 20, y: 300 }, { x: 80, y: 300 }), [
          'b1',
          'b2dup'
        ])
      ]
    );

    const { move, enter, leave } = plan(prev, next, 'focus');

    expect(move.edges).toEqual([]);
    expect([...enter.edgeKeys]).toEqual(['b/tie']);
    expect(leave.edges.map((e) => e.key)).toEqual(['a/tie']);
  });
  test("a sibship's connector fades as one when any kid jumps", () => {
    // Parent 1 over kids 2 and 3; the Drop, Bar and Legs all connect the same
    // boxes. Kid 3 jumps to the far side of kid 2, so the whole connector fades
    // out and back in with it — none of it slides toward an empty spot.
    const parts = ['drop', 'bar', 'leg'];
    const prev = chart(
      [
        box('a1', 1, { x: 0, y: 0 }),
        box('a2', 2, { x: 0, y: 100 }),
        box('a3', 3, { x: 100, y: 100 })
      ],
      parts.map((k) =>
        attached(tie(`a/${k}`, k, { x: 0, y: 50 }, { x: 100, y: 50 }), [
          'a1',
          'a2',
          'a3'
        ])
      )
    );
    const next = chart(
      [
        box('b1', 1, { x: 0, y: 0 }),
        box('b2', 2, { x: 10, y: 100 }),
        box('b3', 3, { x: -300, y: 100 })
      ],
      parts.map((k) =>
        attached(tie(`b/${k}`, k, { x: -300, y: 50 }, { x: 0, y: 50 }), [
          'b1',
          'b2',
          'b3'
        ])
      )
    );

    const { move, enter, leave } = plan(prev, next, 'focus');

    expect(move.boxes.map((b) => b.key)).toEqual(['b1', 'b2']);
    expect(move.edges).toEqual([]);
    expect([...enter.edgeKeys]).toEqual(['b/drop', 'b/bar', 'b/leg']);
    expect(leave.edges.map((e) => e.key)).toEqual(['a/drop', 'a/bar', 'a/leg']);
  });
});

describe('enterAll', () => {
  test('fades in every box and edge of a first paint', () => {
    const O = { x: 0, y: 0 };
    const entering = enterAll(
      chart([box('a', 1, O)], [tie('a/tie', 'tie-1', O, O)])
    );

    expect([...entering.boxKeys]).toEqual(['a']);
    expect([...entering.edgeKeys]).toEqual(['a/tie']);
  });
});
