import { expect, test } from 'bun:test';

import {
  boxFromStage,
  boxOnStage,
  clampBox,
  newBox,
  wholeBox
} from './geometry';

test('places a Box by its pixels of the picture, as the view moves it', () => {
  const box = { left: 2000, top: 3000, width: 1000, height: 60 };
  expect(boxOnStage(box, { pan: { x: 0, y: 0 }, scale: 1 })).toEqual(box);
  expect(boxOnStage(box, { pan: { x: 16, y: -40 }, scale: 0.1 })).toEqual({
    left: 216,
    top: 260,
    width: 100,
    height: 6
  });
});

test('a rectangle drawn on the stage is the Box it covers, at any zoom and pan', () => {
  const box = { left: 2000, top: 3000, width: 3200, height: 300 };
  for (const view of [
    { scale: 0.1, pan: { x: 30, y: -12 } },
    { scale: 1.7, pan: { x: -4000, y: -2500 } }
  ]) {
    const back = boxFromStage(boxOnStage(box, view), view);
    expect(back.left).toBeCloseTo(box.left, 6);
    expect(back.top).toBeCloseTo(box.top, 6);
    expect(back.width).toBeCloseTo(box.width, 6);
    expect(back.height).toBeCloseTo(box.height, 6);
  }
});

const IMAGE = { width: 1000, height: 500 };

test('a Box is kept on its Image, with some size', () => {
  expect(
    clampBox({ left: -100, top: 450, width: 500, height: 100 }, IMAGE)
  ).toEqual({ left: 0, top: 450, width: 400, height: 50 });
  const tiny = clampBox({ left: 500, top: 250, width: 0, height: 0 }, IMAGE);
  expect(tiny.width).toBeCloseTo(2, 10);
  expect(tiny.height).toBeCloseTo(1, 10);
});

test('a Box is saved in whole pixels, on its Image', () => {
  expect(
    wholeBox({ left: 10.4, top: 20.6, width: 99.8, height: 0.2 }, IMAGE)
  ).toEqual({ left: 10, top: 21, width: 100, height: 1 });
  expect(wholeBox({ left: 999.7, top: 0, width: 5, height: 5 }, IMAGE)).toEqual(
    { left: 999, top: 0, width: 1, height: 5 }
  );
});

test('a new Box with no others around is the usual size asked for', () => {
  expect(
    newBox({ x: 500, y: 250 }, [], IMAGE, { width: 0.1, height: 0.2 })
  ).toEqual({ left: 450, top: 200, width: 100, height: 100 });
});
