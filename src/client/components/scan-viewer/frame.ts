// The frame the viewer's transform is in: an Image's size in pixels. A
// thumbnail arrives first and sets it provisionally; the full Image then
// takes over without the view moving.

import type { Transform, Viewport } from '@client/pan-zoom';
import type { Box } from '@common/types';

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
export interface Arrival {
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

// Where an entry's Box is on the stage, in pixels: its fractions of the
// Image moved as the full Image is. Drawn untransformed, its outline keeps
// one width at any zoom.
export function boxOnStage(box: Box, view: Transform, frame: Frame) {
  const { width, height } = frame.size;
  return {
    left: view.pan.x + view.scale * box.left * width,
    top: view.pan.y + view.scale * box.top * height,
    width: view.scale * box.width * width,
    height: view.scale * box.height * height
  };
}

// A rectangle on the stage, in pixels.
export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The Box a rectangle on the stage covers, in fractions of the Image:
// `boxOnStage` undone.
export function boxFromStage(rect: StageRect, view: Transform, frame: Frame) {
  const { width, height } = frame.size;
  return {
    left: (rect.left - view.pan.x) / (view.scale * width),
    top: (rect.top - view.pan.y) / (view.scale * height),
    width: rect.width / (view.scale * width),
    height: rect.height / (view.scale * height)
  };
}

// The smallest Box kept, each way, in fractions of the Image.
export const MIN_BOX = 0.002;

// Kept on the Image, cut at its edges, and at least MIN_BOX each way.
export function clampBox(box: Box): Box {
  const left = Math.min(Math.max(0, box.left), 1 - MIN_BOX);
  const top = Math.min(Math.max(0, box.top), 1 - MIN_BOX);
  const right = Math.min(1, Math.max(box.left + box.width, left + MIN_BOX));
  const bottom = Math.min(1, Math.max(box.top + box.height, top + MIN_BOX));
  return { left, top, width: right - left, height: bottom - top };
}
