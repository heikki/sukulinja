import { expect, test } from 'bun:test';

import { placeCard } from './entry-place';

const CARD = { width: 270, height: 150 };
const STAGE = { width: 1000, height: 600 };

test('the card sits right of its Box, its arrow at the Box', () => {
  const box = { left: 100, top: 200, width: 300, height: 40 };
  expect(placeCard(box, CARD, STAGE)).toEqual({
    left: 414,
    top: 202,
    side: 'right',
    arrow: 18
  });
});

test("it goes left of the Box when the right won't hold it", () => {
  const box = { left: 600, top: 200, width: 300, height: 40 };
  expect(placeCard(box, CARD, STAGE)).toMatchObject({
    left: 316,
    side: 'left'
  });
});

test('it stays inside the stage, its arrow still at the Box', () => {
  const low = { left: 100, top: 560, width: 300, height: 30 };
  expect(placeCard(low, CARD, STAGE)).toMatchObject({ top: 374, arrow: 136 });
  const high = { left: 100, top: -100, width: 300, height: 30 };
  expect(placeCard(high, CARD, STAGE)).toMatchObject({ top: 8, arrow: 14 });
  const wide = { left: 0, top: 200, width: 1000, height: 40 };
  expect(placeCard(wide, CARD, STAGE)).toMatchObject({
    left: 722,
    side: 'right'
  });
});
