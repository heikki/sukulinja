// A Box on a picture shown on a stage: where it is on screen as the view
// pans and zooms, the Box a rectangle drawn there covers, and keeping a Box
// on its picture. A Box is in pixels of the full-size picture.

import type { Point, Transform, Viewport } from '@/client/pan-zoom';
import type { Box } from '@/common/types';

// A rectangle on the stage, in pixels.
export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Where a Box is on the stage, in pixels: its pixels of the picture, moved
// as the picture is. Drawn untransformed, its outline keeps one width at
// any zoom.
export function boxOnStage(box: Box, view: Transform): StageRect {
  return {
    left: view.pan.x + view.scale * box.left,
    top: view.pan.y + view.scale * box.top,
    width: view.scale * box.width,
    height: view.scale * box.height
  };
}

// The Box a rectangle on the stage covers, in pixels of the picture:
// `boxOnStage` undone.
export function boxFromStage(rect: StageRect, view: Transform): Box {
  return {
    left: (rect.left - view.pan.x) / view.scale,
    top: (rect.top - view.pan.y) / view.scale,
    width: rect.width / view.scale,
    height: rect.height / view.scale
  };
}

// The smallest Box kept, each way, in fractions of the picture.
const MIN_BOX = 0.002;

// Kept on the picture of `size`, cut at its edges, and at least MIN_BOX of
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
// picture and at least a pixel each way.
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

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// A new Box centred on `at` (in pixels of the picture of `size`) and kept
// on it, in whole pixels: as big as the picture's other Boxes are, or with
// none, `usual` (in fractions of the picture).
export function newBox(
  at: Point,
  others: Box[],
  size: Viewport,
  usual: { width: number; height: number }
): Box {
  const width = Math.min(
    size.width,
    others.length === 0
      ? usual.width * size.width
      : median(others.map((b) => b.width))
  );
  const height = Math.min(
    size.height,
    others.length === 0
      ? usual.height * size.height
      : median(others.map((b) => b.height))
  );
  const left = Math.min(Math.max(0, at.x - width / 2), size.width - width);
  const top = Math.min(Math.max(0, at.y - height / 2), size.height - height);
  return wholeBox({ left, top, width, height }, size);
}
