// Astia's Images for the Scan viewer, served through the app. Full-size ones
// are fetched one at a time, the latest request first; thumbnails, a few KB
// each, go straight away, so one never waits behind a full Image. All are
// kept in a disk cache capped by size that drops the least recently viewed
// first.

import { readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Astia, ImageSize } from './astia';
import type { ImageRef } from './reader';

const DEFAULT_CAP_BYTES = 2 * 1024 ** 3;

let cacheDir = resolve('data/.astia-images');
let capBytes = DEFAULT_CAP_BYTES;

export function setImageCacheDir(dir: string) {
  cacheDir = dir;
}

export function setImageCacheCap(bytes: number) {
  capBytes = bytes;
}

export function imageCacheCap() {
  return capBytes;
}

// The space the cached Images take, in bytes.
export async function imageCacheUsed() {
  return totalSize(await cachedFiles());
}

// Down to the cap, as after a fetch; for a cap just lowered.
export async function shrinkImageCache() {
  await prune(null);
}

// Whether a Volume's full-size Image is on disk already: a bulk job paces
// only the fetches that reach Astia.
export async function isImageCached(astia: Astia, at: ImageRef) {
  const fileId = (await astia.volumeImages(at.volumeId))[at.image - 1];
  if (fileId === undefined) return false;
  return await Bun.file(join(cacheDir, `${fileId}.jpg`)).exists();
}

export async function clearImageCache() {
  const files = await cachedFiles();
  await Promise.all(files.map((f) => rm(f.path, { force: true })));
}

// ---------------------------------------------------------------- the lane

// One fetch of a file, shared by everyone waiting for it. A job no one waits
// for any more is dropped before it starts.
interface Job {
  fileId: string;
  run: () => Promise<void>;
  started: boolean;
  waiters: number;
  done: PromiseWithResolvers<void>;
}

// Waiting jobs, the latest last: stepping through a Volume wants the Image
// now on screen, not the ones stepped past.
const queued: Job[] = [];
const jobs = new Map<string, Job>();
let busy = false;

function pump() {
  if (busy) return;
  const job = queued.pop();
  if (job === undefined) return;
  busy = true;
  job.started = true;
  void job
    .run()
    .then(job.done.resolve)
    .catch(job.done.reject)
    .finally(() => {
      jobs.delete(job.fileId);
      busy = false;
      pump();
    });
}

function unqueue(job: Job) {
  queued.splice(queued.indexOf(job), 1);
}

async function inLane(
  fileId: string,
  run: () => Promise<void>,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  let job = jobs.get(fileId);
  if (job === undefined) {
    job = {
      fileId,
      run,
      started: false,
      waiters: 0,
      done: Promise.withResolvers()
    };
    // Everyone waiting may have left by the time it fails.
    job.done.promise.catch(() => undefined);
    jobs.set(fileId, job);
  } else if (!job.started) {
    unqueue(job);
  }
  if (!job.started) queued.push(job);
  job.waiters += 1;
  const mine = job;
  const left = Promise.withResolvers<never>();
  function leave() {
    mine.waiters -= 1;
    if (mine.waiters === 0 && !mine.started) {
      unqueue(mine);
      jobs.delete(mine.fileId);
    }
    left.reject(signal.reason);
  }
  signal.addEventListener('abort', leave, { once: true });
  pump();
  try {
    await Promise.race([mine.done.promise, left.promise]);
  } finally {
    signal.removeEventListener('abort', leave);
  }
}

// ---------------------------------------------------------------- the cache

// A file's modification time is when it was last viewed.
async function touch(path: string) {
  const now = new Date();
  try {
    await utimes(path, now, now);
    return true;
  } catch {
    return false;
  }
}

// The cached Images; none before the first is fetched. One removed while
// they're listed is left out.
async function cachedFiles() {
  const names = await readdir(cacheDir).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.jpg'))
      .map(async (name) => {
        const path = join(cacheDir, name);
        const info = await stat(path).catch(() => null);
        return info === null
          ? null
          : { path, size: info.size, viewed: info.mtimeMs };
      })
  );
  return files.filter((f) => f !== null);
}

function totalSize(files: Array<{ size: number }>) {
  return files.reduce((sum, f) => sum + f.size, 0);
}

// Drops the least recently viewed files until the cache fits its cap; the
// file just fetched stays even when it alone is over.
async function prune(keep: string | null) {
  const files = await cachedFiles();
  let total = totalSize(files);
  const dropped: string[] = [];
  for (const f of files.sort((a, b) => a.viewed - b.viewed)) {
    if (total <= capBytes) break;
    if (f.path === keep) continue;
    dropped.push(f.path);
    total -= f.size;
  }
  await Promise.all(dropped.map((path) => rm(path, { force: true })));
}

async function download(
  astia: Astia,
  volumeId: string,
  fileId: string,
  path: string
) {
  const bytes = await astia.imageBytes(volumeId, fileId);
  // Written aside and moved in, so a cut-off fetch never shows as cached.
  const part = `${path}.part`;
  await Bun.write(part, bytes);
  await rename(part, path);
  await prune(path);
}

// The cached file of a Volume's Image (numbered from 1), fetched if need be;
// null when the Volume has no such Image. Throws when Astia can't be
// reached, or when `signal` aborts first.
export async function astiaImage(
  astia: Astia,
  at: ImageRef,
  size: ImageSize,
  signal: AbortSignal
) {
  const fileId = (await astia.volumeImages(at.volumeId, size))[at.image - 1];
  if (fileId === undefined) return null;
  const path = join(cacheDir, `${fileId}.jpg`);
  if (await touch(path)) return path;
  if (size === 'thumb') {
    await download(astia, at.volumeId, fileId, path);
  } else {
    await inLane(
      fileId,
      () => download(astia, at.volumeId, fileId, path),
      signal
    );
  }
  return path;
}
