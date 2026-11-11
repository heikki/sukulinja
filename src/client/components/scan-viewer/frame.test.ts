import { expect, test } from 'bun:test';

import {
  entriesShown,
  frameForFull,
  frameForThumb,
  layers,
  newEntryBox
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

test('marks entries only over the full Image', () => {
  const full = { size: { width: 8000, height: 6000 }, provisional: false };
  const guessed = { ...full, provisional: true };
  expect(entriesShown(full, 'shown')).toBe(true);
  expect(entriesShown(guessed, 'shown')).toBe(false);
  expect(entriesShown(full, 'loading')).toBe(false);
  expect(entriesShown(null, 'shown')).toBe(false);
});

const IMAGE = { width: 1000, height: 500 };

test('a new Box is centred where asked, as big as the entries around it', () => {
  const others = [
    { left: 100, top: 100, width: 200, height: 10 },
    { left: 100, top: 150, width: 400, height: 20 },
    { left: 100, top: 200, width: 300, height: 16 }
  ];
  expect(newEntryBox({ x: 500, y: 250 }, others, IMAGE)).toEqual({
    left: 350,
    top: 242,
    width: 300,
    height: 16
  });
});

test('a new Box on an Image with no others is the usual size, kept on it', () => {
  expect(newEntryBox({ x: 990, y: -100 }, [], IMAGE)).toEqual({
    left: 710,
    top: 0,
    width: 290,
    height: 13
  });
});
