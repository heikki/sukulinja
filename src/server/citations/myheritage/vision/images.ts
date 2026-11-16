// Full-size Images for the vision model, through the Scan cache: one at a
// time, with a gap between the ones fetched from Astia, so a bulk run
// doesn't hammer the archive. Images already cached are read
// straight away, and the ones fetched stay for the Scan viewer.
//
// A scan is some 6700 × 5200 px and up to 8 MB, past what the API accepts;
// the models read at most 2576 px on the long edge and 3.75 MP. So each is
// scaled to fit before it's sent, with Bun's own Bun.Image, on any system.

import type { ImageRef } from '../../astia/astia';
import type { ScanCache } from '../../astia/scan-cache';
import { cropImage } from './crop';

const GAP_MS = 1000;
const MAX_EDGE = 2576;
const MAX_PIXELS = 3.75e6;
const JPEG_QUALITY = 85;

// The longest edge that keeps the scan within the models' limits.
function fittedEdge(width: number, height: number) {
  const area = Math.sqrt(MAX_PIXELS / (width * height));
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), area);
  return Math.floor(Math.max(width, height) * scale);
}

// A part of a scan, in fractions of its width and height from its top
// left.
export interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Scan {
  bytes: Uint8Array;
  // The size it was scaled to, which the model's coordinates refer to.
  width: number;
  height: number;
}

// The image `input`, or its `region`, scaled to send.
export async function fitted(
  input: Uint8Array | string,
  region: Region | null
): Promise<Scan> {
  const whole = await new Bun.Image(input).metadata();
  let from = input;
  let { width, height } = whole;
  if (region !== null) {
    width = Math.round(whole.width * region.width);
    height = Math.round(whole.height * region.height);
    from = await cropImage(input, {
      left: Math.round(whole.width * region.left),
      top: Math.round(whole.height * region.top),
      width,
      height
    });
  }
  const edge = fittedEdge(width, height);
  const scale = edge / Math.max(width, height);
  const scaled = {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
  const bytes = await new Bun.Image(from)
    .resize(scaled.width, scaled.height)
    .jpeg({ quality: JPEG_QUALITY })
    .bytes();
  return { bytes, ...scaled };
}

// Loads Images through the Scan cache given, one at a time: whole, or a
// region of one.
export function pacedImages(cache: ScanCache) {
  let queue: Promise<unknown> = Promise.resolve();
  // Resolves when the next fetch from Astia may start.
  let gap: Promise<void> = Promise.resolve();

  async function load(at: ImageRef, region: Region | null) {
    const fetching = !(await cache.isCached(at));
    if (fetching) {
      const wait = gap;
      gap = wait.then(async () => {
        await Bun.sleep(GAP_MS);
      });
      await wait;
    }
    const path = await cache.image(at, 'full', new AbortController().signal);
    if (path === null) {
      throw new Error(`Volume ${at.volumeId} has no Image ${at.image}`);
    }
    return await fitted(path, region);
  }

  return function pacedImage(at: ImageRef, region: Region | null = null) {
    const run = queue.then(async () => await load(at, region));
    queue = run.catch(() => undefined);
    return run;
  };
}
