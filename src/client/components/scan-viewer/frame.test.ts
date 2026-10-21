import { expect, test } from 'bun:test';

import {
  boxFromStage,
  boxOnStage,
  clampBox,
  entriesShown,
  frameForFull,
  frameForThumb,
  layers,
  newBox,
  wholeBox
} from './frame';
import type { Loading } from './frame';

const THUMB = { width: 250, height: 196 };
const FULL = { width: 7500, height: 5880 };

test('a thumbnail frames the first Image until the full one arrives', () => {
  const thumb = frameForThumb(null, THUMB);
  expect(thumb).toEqual({
    frame: { size: { width: 7500, height: 5880 }, provisional: true },
    fit: true
  });
  const full = { width: 7400, height: 5802 };
  expect(frameForFull(thumb.frame, full)).toEqual({
    frame: { size: full, provisional: false },
    fit: false,
    rescale: 7500 / 7400
  });
});

test('a thumbnail of the same shape keeps the last Image frame', () => {
  const frame = { size: FULL, provisional: false };
  expect(frameForThumb(frame, THUMB)).toEqual({ frame, fit: false });
  expect(frameForFull(frame, FULL).fit).toBe(false);
});

test('a page of another shape is fitted anew', () => {
  const frame = { size: FULL, provisional: false };
  const cover = frameForThumb(frame, { width: 125, height: 196 });
  expect(cover.fit).toBe(true);
  expect(cover.frame.size).toEqual({ width: 7500, height: 11760 });
  expect(frameForFull(frame, { width: 3750, height: 5880 }).fit).toBe(true);
});

test('shows the thumbnail until the full Image has faded in', () => {
  const view = { pan: { x: 10, y: 20 }, scale: 0.1 };
  const frame = { size: FULL, provisional: false };
  const at = 'translate(10px, 20px) scale(0.1)';
  const thumb = `${at} scale(30)`;
  function arrived(loading: Loading, fading = false) {
    return layers(view, frame, { thumb: THUMB, loading, fading });
  }
  expect(
    layers(null, frame, { thumb: THUMB, loading: 'loading', fading: false })
  ).toEqual({
    frame: null,
    thumb: null,
    full: null,
    fade: false
  });
  expect(
    layers(view, frame, { thumb: null, loading: 'loading', fading: false })
  ).toEqual({ frame: at, thumb: null, full: at, fade: false });
  expect(arrived('loading')).toEqual({
    frame: at,
    thumb,
    full: null,
    fade: false
  });
  expect(arrived('shown', true)).toEqual({
    frame: at,
    thumb,
    full: at,
    fade: true
  });
  expect(arrived('shown').thumb).toBeNull();
  expect(arrived('failed')).toEqual({
    frame: at,
    thumb,
    full: null,
    fade: false
  });
});

test('places an entry by its pixels of the full Image, as the view moves it', () => {
  const box = { left: 2000, top: 3000, width: 1000, height: 60 };
  expect(boxOnStage(box, { pan: { x: 0, y: 0 }, scale: 1 })).toEqual(box);
  expect(boxOnStage(box, { pan: { x: 16, y: -40 }, scale: 0.1 })).toEqual({
    left: 216,
    top: 260,
    width: 100,
    height: 6
  });
});

test('marks entries only over the full Image', () => {
  const full = { size: { width: 8000, height: 6000 }, provisional: false };
  const guessed = { ...full, provisional: true };
  expect(entriesShown(full, 'shown')).toBe(true);
  expect(entriesShown(guessed, 'shown')).toBe(false);
  expect(entriesShown(full, 'loading')).toBe(false);
  expect(entriesShown(null, 'shown')).toBe(false);
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

test('a new Box is centred where asked, as big as the entries around it', () => {
  const others = [
    { left: 100, top: 100, width: 200, height: 10 },
    { left: 100, top: 150, width: 400, height: 20 },
    { left: 100, top: 200, width: 300, height: 16 }
  ];
  expect(newBox({ x: 500, y: 250 }, others, IMAGE)).toEqual({
    left: 350,
    top: 242,
    width: 300,
    height: 16
  });
});

test('a new Box on an Image with no others is the usual size, kept on it', () => {
  expect(newBox({ x: 990, y: -100 }, [], IMAGE)).toEqual({
    left: 710,
    top: 0,
    width: 290,
    height: 13
  });
});
