import { expect, test } from 'bun:test';

import { boxedOn, newTagBox, photoBoxes } from './photo-boxes';

const BOX = { left: 10, top: 20, width: 30, height: 40 };
const PEOPLE = [
  { personId: 1, box: BOX, tagged: false },
  { personId: 2, box: null, tagged: false },
  { personId: 3, box: BOX, tagged: true }
];

test("boxes the people marked on the Photo, the Selected person's marked", () => {
  expect(photoBoxes(PEOPLE, 3)).toEqual([
    { key: '1', box: BOX, marked: false },
    { key: '3', box: BOX, marked: true }
  ]);
});

test('a pending Tag gives way to its handles, and one taken back is faint', () => {
  expect(photoBoxes(PEOPLE, 1, { pending: 3, removing: null })).toEqual([
    { key: '1', box: BOX, marked: true }
  ]);
  expect(photoBoxes(PEOPLE, null, { pending: null, removing: 3 })).toEqual([
    { key: '1', box: BOX, marked: false },
    { key: '3', box: BOX, marked: true, faint: true }
  ]);
});

test("a new Tag's Box is square on its own, else as big as the others", () => {
  const size = { width: 1000, height: 500 };
  expect(newTagBox({ x: 500, y: 250 }, [], size)).toEqual({
    left: 463,
    top: 213,
    width: 75,
    height: 75
  });
  expect(newTagBox({ x: 0, y: 0 }, [BOX], size)).toEqual({
    left: 0,
    top: 0,
    width: 30,
    height: 40
  });
});

test('those marked on the Photo are not tagged there again', () => {
  expect([...boxedOn(PEOPLE)]).toEqual([1, 3]);
});
