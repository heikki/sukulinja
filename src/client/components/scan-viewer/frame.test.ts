import { expect, test } from 'bun:test';

import { frameForFull, frameForThumb, layers } from './frame';
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
