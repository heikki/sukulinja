import { expect, test } from 'bun:test';

import { photoBoxes } from './photo-boxes';

const BOX = { left: 10, top: 20, width: 30, height: 40 };

test("boxes the people marked on the Photo, the Selected person's marked", () => {
  const people = [
    { personId: 1, box: BOX },
    { personId: 2, box: null },
    { personId: 3, box: BOX }
  ];
  expect(photoBoxes(people, 3)).toEqual([
    { key: '1', box: BOX, marked: false },
    { key: '3', box: BOX, marked: true }
  ]);
});
