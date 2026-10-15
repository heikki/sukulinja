// Astia's Images for the Scan viewer, served through the app. Full-size ones
// are fetched one at a time, the latest request first; thumbnails, a few KB
// each, go straight away, so one never waits behind a full Image. All are
// kept in a disk cache capped by size that drops the least recently viewed
// first.

import { readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { imageBytes, volumeImages } from './astia';
import type { ImageSize } from './astia';

const DEFAULT_CAP_BYTES = 500 * 1024 * 1024;

let cacheDir = resolve('data/.astia-images');
let capBytes = DEFAULT_CAP_BYTES;

export function setImageCacheDir(dir: string) {
  cacheDir = dir;
}

export function setImageCacheCap(bytes: number) {
  capBytes = bytes;
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

// Drops the least recently viewed files until the cache fits its cap; the
// file just fetched stays even when it alone is over.
async function prune(keep: string) {
  const names = (await readdir(cacheDir)).filter((n) => n.endsWith('.jpg'));
  const files = await Promise.all(
    names.map(async (name) => {
      const path = join(cacheDir, name);
      const { size, mtimeMs } = await stat(path);
      return { path, size, viewed: mtimeMs };
    })
  );
  let total = files.reduce((sum, f) => sum + f.size, 0);
  const dropped: string[] = [];
  for (const f of files.sort((a, b) => a.viewed - b.viewed)) {
    if (total <= capBytes) break;
    if (f.path === keep) continue;
    dropped.push(f.path);
    total -= f.size;
  }
  await Promise.all(dropped.map((path) => rm(path, { force: true })));
}

async function download(volumeId: string, fileId: string, path: string) {
  const bytes = await imageBytes(volumeId, fileId);
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
  volumeId: string,
  image: number,
  size: ImageSize,
  signal: AbortSignal
) {
  const fileId = (await volumeImages(volumeId, size))[image - 1];
  if (fileId === undefined) return null;
  const path = join(cacheDir, `${fileId}.jpg`);
  if (await touch(path)) return path;
  if (size === 'thumb') {
    await download(volumeId, fileId, path);
  } else {
    await inLane(fileId, () => download(volumeId, fileId, path), signal);
  }
  return path;
}
