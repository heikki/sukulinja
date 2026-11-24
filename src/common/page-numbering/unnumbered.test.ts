import { expect, test } from 'bun:test';

import type { NumberedPin } from './index';
import { joiningSkips, skippedRuns, skipping, splitSkips } from './unnumbered';

test('Images without a page number are left out of the counting', () => {
  const s = skipping(
    [
      { image: 2, pages: [] },
      { image: 5, pages: [3] },
      { image: 3, pages: [] }
    ],
    10
  );
  expect(s.skipped).toEqual([2, 3]);
  expect(s.pins).toEqual([{ image: 3, pages: [3] }]);
  expect(s.images).toBe(8);
  expect([1, 2, 3, 4].map((i) => s.image(i))).toEqual([1, 4, 5, 6]);
});

test('two Images without a page number skip those between, unless a pin is there', () => {
  expect(
    skippedRuns([
      { image: 3, pages: [] },
      { image: 9, pages: [] },
      { image: 12, pages: [5] },
      { image: 15, pages: [] },
      { image: 20, pages: [] },
      { image: 22, pages: [8] },
      { image: 30, pages: [] }
    ])
  ).toEqual([
    { from: 3, to: 9 },
    { from: 15, to: 20 },
    { from: 30, to: 30 }
  ]);
  expect(
    skipping(
      [
        { image: 2, pages: [] },
        { image: 5, pages: [] }
      ],
      10
    )
  ).toMatchObject({ skipped: [2, 3, 4, 5], images: 6 });
});

test('a skip kept alone skips only its own Image', () => {
  expect(
    skippedRuns([
      { image: 3, pages: [] },
      { image: 9, pages: [], alone: true },
      { image: 14, pages: [] }
    ])
  ).toEqual([
    { from: 3, to: 3 },
    { from: 9, to: 9 },
    { from: 14, to: 14 }
  ]);
});

test('a page set in a run splits it, the rest either side still skipped', () => {
  const pins = [
    { image: 3, pages: [] },
    { image: 9, pages: [] }
  ];
  expect(splitSkips(pins, 6)).toEqual([5, 7]);
  expect(splitSkips(pins, 3)).toEqual([4]);
  expect(splitSkips(pins, 4)).toEqual([5]);
  expect(splitSkips(pins, 10)).toEqual([]);
});

// What a Volume's pins skipped before two skips joined: each its own
// Image.
function skippedBefore(pins: NumberedPin[]) {
  return [
    ...new Set(pins.filter((p) => p.pages.length === 0).map((p) => p.image))
  ].toSorted((a, b) => a - b);
}

test('pins saved before skips joined skip what they did, a long run kept at its ends', () => {
  const old: NumberedPin[] = [
    { image: 1, pages: [] },
    { image: 5, pages: [] },
    { image: 8, pages: [3] },
    ...Array.from({ length: 120 }, (_, i) => ({ image: 20 + i, pages: [] })),
    { image: 150, pages: [40] },
    { image: 151, pages: [] },
    { image: 152, pages: [] }
  ];
  const now = joiningSkips(old);
  expect(skipping(now, 200).skipped).toEqual(skippedBefore(old));
  // The skips at 1 and 5 alone, as joined they'd skip 2 to 4; the long
  // run and 151–152, past any other skip, at their ends.
  expect(now.filter((p) => p.pages.length === 0)).toEqual([
    { image: 1, pages: [], alone: true },
    { image: 5, pages: [], alone: true },
    { image: 20, pages: [] },
    { image: 139, pages: [] },
    { image: 151, pages: [] },
    { image: 152, pages: [] }
  ]);
});

test('any pins saved before skips joined skip what they did', () => {
  let seed = 7;
  function random(n: number) {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed % n;
  }
  for (let round = 0; round < 500; round += 1) {
    const old: NumberedPin[] = Array.from({ length: random(15) }, () =>
      random(3) === 0
        ? { image: 1 + random(30), pages: [random(50)] }
        : { image: 1 + random(30), pages: [] }
    );
    expect(skipping(joiningSkips(old), 30).skipped).toEqual(skippedBefore(old));
  }
});
