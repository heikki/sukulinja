// Full-size Images for the vision model, through the Scan cache: one at a
// time, with a gap between the ones fetched from Astia, so a bulk run
// doesn't hammer the archive. Images already cached are read
// straight away, and the ones fetched stay for the Scan viewer.
//
// A scan is some 6700 × 5200 px and up to 8 MB, past what the API accepts;
// the models read at most 2576 px on the long edge and 3.75 MP. So each is
// scaled to fit before it's sent, with macOS's sips: the app and the
// scripts run on the Mac the app ships for.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ImageRef } from '../../astia/astia';
import type { ScanCache } from '../../astia/scan-cache';

const GAP_MS = 1000;
const MAX_EDGE = 2576;
const MAX_PIXELS = 3.75e6;
const JPEG_QUALITY = 85;

async function sips(args: string[]) {
  const proc = Bun.spawn(['sips', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error(
      `sips ${args.join(' ')}: ${await new Response(proc.stderr).text()}`
    );
  }
  return out;
}

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

async function sizeOf(path: string) {
  const info = await sips(['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  return {
    width: Number(/pixelWidth: (?<n>\d+)/.exec(info)?.groups?.n),
    height: Number(/pixelHeight: (?<n>\d+)/.exec(info)?.groups?.n)
  };
}

// The scan at `path`, or its `region`, scaled to send.
async function fitted(path: string, region: Region | null): Promise<Scan> {
  const dir = await mkdtemp(join(tmpdir(), 'sukulinja-scan-'));
  try {
    let from = path;
    let { width, height } = await sizeOf(path);
    if (region !== null) {
      const cropped = join(dir, 'region.jpg');
      const w = Math.round(width * region.width);
      const h = Math.round(height * region.height);
      await sips([
        '-c',
        String(h),
        String(w),
        '--cropOffset',
        String(Math.round(height * region.top)),
        String(Math.round(width * region.left)),
        path,
        '--out',
        cropped
      ]);
      from = cropped;
      ({ width, height } = await sizeOf(cropped));
    }
    const edge = fittedEdge(width, height);
    const scale = edge / Math.max(width, height);
    const out = join(dir, 'scan.jpg');
    await sips([
      '-Z',
      String(edge),
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      String(JPEG_QUALITY),
      from,
      '--out',
      out
    ]);
    return {
      bytes: await Bun.file(out).bytes(),
      width: Math.round(width * scale),
      height: Math.round(height * scale)
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
