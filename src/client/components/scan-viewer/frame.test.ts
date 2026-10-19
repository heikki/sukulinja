import { expect, test } from 'bun:test';

import {
  boxFromStage,
  boxOnStage,
  clampBox,
  entriesShown,
  frameForFull,
  frameForThumb,
  layers
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

test('places an entry by its fractions of the Image, as the view moves it', () => {
  const frame = { size: { width: 8000, height: 6000 }, provisional: false };
  const box = { left: 0.25, top: 0.5, width: 0.125, height: 0.01 };
  expect(boxOnStage(box, { pan: { x: 0, y: 0 }, scale: 1 }, frame)).toEqual({
    left: 2000,
    top: 3000,
    width: 1000,
    height: 60
  });
  expect(
    boxOnStage(box, { pan: { x: 16, y: -40 }, scale: 0.1 }, frame)
  ).toEqual({ left: 216, top: 260, width: 100, height: 6 });
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
  const frame = { size: FULL, provisional: false };
  const box = { left: 0.25, top: 0.5, width: 0.4, height: 0.05 };
  for (const view of [
    { scale: 0.1, pan: { x: 30, y: -12 } },
    { scale: 1.7, pan: { x: -4000, y: -2500 } }
  ]) {
    const back = boxFromStage(boxOnStage(box, view, frame), view, frame);
    expect(back.left).toBeCloseTo(box.left, 10);
    expect(back.top).toBeCloseTo(box.top, 10);
    expect(back.width).toBeCloseTo(box.width, 10);
    expect(back.height).toBeCloseTo(box.height, 10);
  }
});

test('a Box is kept on its Image, with some size', () => {
  expect(clampBox({ left: -0.1, top: 0.9, width: 0.5, height: 0.2 })).toEqual({
    left: 0,
    top: 0.9,
    width: 0.4,
    height: expect.closeTo(0.1, 10) as number
  });
  const tiny = clampBox({ left: 0.5, top: 0.5, width: 0, height: 0 });
  expect(tiny.width).toBeCloseTo(0.002, 10);
  expect(tiny.height).toBeCloseTo(0.002, 10);
});
