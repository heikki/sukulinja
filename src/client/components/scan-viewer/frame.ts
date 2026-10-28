// The frame the viewer's transform is in: an Image's size in pixels. A
// thumbnail arrives first and sets it provisionally; the full Image then
// takes over without the view moving.

import type { Point, Transform, Viewport } from '@/client/pan-zoom';
import type { Box } from '@/common/types';

export interface Frame {
  size: Viewport;
  // From a thumbnail: the full Image's pixels are still unknown.
  provisional: boolean;
}

// Within 1%: the same page photographed at another size.
function sameShape(a: Viewport, b: Viewport) {
  return Math.abs(a.width / a.height / (b.width / b.height) - 1) < 0.01;
}

// Astia's thumbnails are about a thirtieth of the full Image, which a frame
// from one assumes, so it fits as the full Image will.
const THUMB_SCALE = 30;

// A thumbnail gives a frame when there is none, or its shape when it
// differs from the last Image's; `fit` when the view should fit it anew.
export function frameForThumb(frame: Frame | null, thumb: Viewport) {
  if (frame === null) {
    const size = {
      width: thumb.width * THUMB_SCALE,
      height: thumb.height * THUMB_SCALE
    };
    return { frame: { size, provisional: true }, fit: true };
  }
  if (sameShape(frame.size, thumb)) return { frame, fit: false };
  const width = frame.size.width;
  const size = { width, height: (width * thumb.height) / thumb.width };
  return { frame: { size, provisional: true }, fit: true };
}

// The full Image's size becomes the frame. Over a provisional frame of its
// shape, the view's scale is multiplied by `rescale` so it stays where it
// is on screen; a frame of another size or shape is fitted anew.
export function frameForFull(frame: Frame | null, full: Viewport) {
  const next: Frame = { size: full, provisional: false };
  if (frame === null) return { frame: next, fit: true, rescale: 1 };
  const { size } = frame;
  if (size.width === full.width && size.height === full.height) {
    return { frame: next, fit: false, rescale: 1 };
  }
  if (frame.provisional && sameShape(size, full)) {
    return { frame: next, fit: false, rescale: size.width / full.width };
  }
  return { frame: next, fit: true, rescale: 1 };
}

export type Loading = 'loading' | 'shown' | 'failed';

// How far the shown Image has come: its thumbnail once loaded, and whether
// the full Image is fading in over it.
interface Arrival {
  thumb: Viewport | null;
  loading: Loading;
  fading: boolean;
}

// What the stage draws, as CSS transforms; null where it stays hidden. The
// frame shows empty until something arrives; the thumbnail, blurred, until
// the full Image has faded in over it. Without a thumbnail the last full
// Image stays up while the next loads, so a cached one doesn't flicker.
export function layers(
  view: Transform | null,
  frame: Frame | null,
  { thumb, loading, fading }: Arrival
) {
  if (view === null || frame === null) {
    return { frame: null, thumb: null, full: null, fade: false };
  }
  const at = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
  const thumbShown = thumb !== null && (loading !== 'shown' || fading);
  const fullShown =
    loading === 'shown' || (loading === 'loading' && thumb === null);
  return {
    frame: at,
    // Drawn at its own size and scaled up to the frame, which keeps the
    // blur cheap.
    thumb: thumbShown ? `${at} scale(${frame.size.width / thumb.width})` : null,
    full: fullShown ? at : null,
    fade: fading
  };
}

// Entries are marked once the full Image is shown, not over the blurred
// thumbnail, whose frame is only a guess at the full Image's size.
export function entriesShown(frame: Frame | null, loading: Loading) {
  return frame !== null && !frame.provisional && loading === 'shown';
}

// Where an entry's Box is on the stage, in pixels: its pixels of the full
// Image, moved as the Image is. Drawn untransformed, its outline keeps one
// width at any zoom.
export function boxOnStage(box: Box, view: Transform) {
  return {
    left: view.pan.x + view.scale * box.left,
    top: view.pan.y + view.scale * box.top,
    width: view.scale * box.width,
    height: view.scale * box.height
  };
}

// A rectangle on the stage, in pixels.
interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The Box a rectangle on the stage covers, in pixels of the full Image:
// `boxOnStage` undone.
export function boxFromStage(rect: StageRect, view: Transform) {
  return {
    left: (rect.left - view.pan.x) / view.scale,
    top: (rect.top - view.pan.y) / view.scale,
    width: rect.width / view.scale,
    height: rect.height / view.scale
  };
}

// The smallest Box kept, each way, in fractions of the Image.
const MIN_BOX = 0.002;

// Kept on the Image of `size`, cut at its edges, and at least MIN_BOX of
// it each way.
export function clampBox(box: Box, size: Viewport): Box {
  const min = { x: MIN_BOX * size.width, y: MIN_BOX * size.height };
  const left = Math.min(Math.max(0, box.left), size.width - min.x);
  const top = Math.min(Math.max(0, box.top), size.height - min.y);
  const right = Math.min(
    size.width,
    Math.max(box.left + box.width, left + min.x)
  );
  const bottom = Math.min(
    size.height,
    Math.max(box.top + box.height, top + min.y)
  );
  return { left, top, width: right - left, height: bottom - top };
}

// The Box in whole pixels, as it's saved (GEDCOM's CROP), still on the
// Image and at least a pixel each way.
export function wholeBox(box: Box, size: Viewport): Box {
  const left = Math.min(Math.round(box.left), size.width - 1);
  const top = Math.min(Math.round(box.top), size.height - 1);
  const right = Math.min(size.width, Math.round(box.left + box.width));
  const bottom = Math.min(size.height, Math.round(box.top + box.height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

// How big an entry's Box usually is, in fractions of its Image: the median
// of the Boxes saved so far.
const ENTRY_SIZE = { width: 0.29, height: 0.025 };

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// A new entry Box centred on `at` (in pixels of the Image of `size`) and
// kept on it, in whole pixels, as big as the Image's other entries are, or
// as entries usually are.
export function newBox(at: Point, others: Box[], size: Viewport): Box {
  const width = Math.min(
    size.width,
    others.length === 0
      ? ENTRY_SIZE.width * size.width
      : median(others.map((b) => b.width))
  );
  const height = Math.min(
    size.height,
    others.length === 0
      ? ENTRY_SIZE.height * size.height
      : median(others.map((b) => b.height))
  );
  const left = Math.min(Math.max(0, at.x - width / 2), size.width - width);
  const top = Math.min(Math.max(0, at.y - height / 2), size.height - height);
  return wholeBox({ left, top, width, height }, size);
}
