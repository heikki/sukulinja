// The Scan cache: Astia's Images kept on disk for the Scan viewer and the
// vision pass. Full-size ones are fetched one at a time, the latest request
// first; thumbnails, a few KB each, go straight away, so one never waits
// behind a full Image. The cache is capped by a size the install sets,
// kept in the data folder rather than a viewer's cookie, and drops the
// least recently viewed Images first.
//
// Astia may re-scan a Volume, giving every Image a new file id and none by
// the old ones. An Image whose id Astia no longer has sends for the
// Volume's list again, and is fetched once more by its new id; the cached
// Images of the filming replaced go.

import { readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';

import type { ScanCacheStatus } from '@common/types';

import { NoImageError } from './astia';
import type { Astia, ImageSize } from './astia';
import type { ImageRef } from './reader';

const GB = 1024 ** 3;
const CAPS = [2, 5, 10, 20].map((n) => n * GB);
const DEFAULT_CAP_BYTES = 2 * GB;

// ---------------------------------------------------------------- the queue

// One fetch of a file, shared by everyone waiting for it. A job no one waits
// for any more is dropped before it starts.
interface Job {
  fileId: string;
  run: () => Promise<void>;
  started: boolean;
  waiters: number;
  done: PromiseWithResolvers<void>;
}

// Full-size fetches, one at a time. Waiting jobs are taken latest first:
// stepping through a Volume wants the Image now on screen, not the ones
// stepped past.
function openQueue() {
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

  return async function inQueue(
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
  };
}

// ---------------------------------------------------------------- the files

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
async function cachedFiles(dir: string) {
  const names = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.jpg'))
      .map(async (name) => {
        const path = join(dir, name);
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

// ---------------------------------------------------------------- the setting

// The install's settings; none when the file is missing or unreadable.
async function readSettings(file: string) {
  const none: Record<string, unknown> = {};
  const settings = Bun.file(file);
  if (!(await settings.exists())) return none;
  const read = (await settings.json().catch(() => null)) as typeof none | null;
  return read ?? none;
}

// The cap saved for the install, if it's one of the choices.
async function savedCap(file: string) {
  const { scanCacheBytes } = await readSettings(file);
  return typeof scanCacheBytes === 'number' && CAPS.includes(scanCacheBytes)
    ? scanCacheBytes
    : DEFAULT_CAP_BYTES;
}

// ---------------------------------------------------------------- the cache

// The Scan cache of the data folder at `root`, fetching from `astia`: its
// Images in `.astia-images`, its cap in `settings.local.json`.
export function openScanCache({ astia, root }: { astia: Astia; root: string }) {
  const dir = join(root, '.astia-images');
  const settingsFile = join(root, 'settings.local.json');
  const inQueue = openQueue();
  let cap = DEFAULT_CAP_BYTES;
  // Read before anything prunes or reports, so the default never stands in
  // for a cap saved larger.
  const ready = savedCap(settingsFile).then((saved) => {
    cap = saved;
  });

  // Drops the least recently viewed files until the cache fits its cap; the
  // file just fetched stays even when it alone is over.
  async function prune(keep: string | null) {
    await ready;
    const files = await cachedFiles(dir);
    let total = totalSize(files);
    const dropped: string[] = [];
    for (const f of files.sort((a, b) => a.viewed - b.viewed)) {
      if (total <= cap) break;
      if (f.path === keep) continue;
      dropped.push(f.path);
      total -= f.size;
    }
    await Promise.all(dropped.map((path) => rm(path, { force: true })));
  }

  async function download(volumeId: string, fileId: string, path: string) {
    const bytes = await astia.imageBytes(volumeId, fileId);
    // Written aside and moved in, so a cut-off fetch never shows as cached.
    const part = `${path}.part`;
    await Bun.write(part, bytes);
    await rename(part, path);
    await prune(path);
  }

  async function fileAt(at: ImageRef, size: ImageSize) {
    return (await astia.volumeImages(at.volumeId, size))[at.image - 1];
  }

  async function cached(
    at: ImageRef,
    size: ImageSize,
    fileId: string,
    signal: AbortSignal
  ) {
    const path = join(dir, `${fileId}.jpg`);
    if (await touch(path)) return path;
    if (size === 'thumb') {
      await download(at.volumeId, fileId, path);
    } else {
      await inQueue(fileId, () => download(at.volumeId, fileId, path), signal);
    }
    return path;
  }

  // The Image's id after asking Astia for the Volume's list again, unless
  // another request already has since `gone` was read from it.
  async function listed(volumeId: string) {
    const sizes = await Promise.all([
      astia.volumeImages(volumeId, 'full'),
      astia.volumeImages(volumeId, 'thumb')
    ]);
    return sizes.flat();
  }

  // Asks Astia for the Volume's list again, and drops the cached Images of
  // file ids it no longer lists.
  async function refresh(volumeId: string) {
    const before = await listed(volumeId);
    await astia.refreshImages(volumeId);
    const now = new Set(await listed(volumeId));
    const gone = before.filter((id) => !now.has(id));
    await Promise.all(
      gone.map((id) => rm(join(dir, `${id}.jpg`), { force: true }))
    );
  }

  async function renewed(at: ImageRef, size: ImageSize, gone: string) {
    if ((await fileAt(at, size)) === gone) await refresh(at.volumeId);
    return await fileAt(at, size);
  }

  return {
    // The cached file of a Volume's Image (numbered from 1), fetched if need
    // be; null when the Volume has no such Image. Throws when Astia fails,
    // or when `signal` aborts first.
    async image(at: ImageRef, size: ImageSize, signal: AbortSignal) {
      const fileId = await fileAt(at, size);
      if (fileId === undefined) return null;
      try {
        return await cached(at, size, fileId, signal);
      } catch (err) {
        if (!(err instanceof NoImageError)) throw err;
        const now = await renewed(at, size, fileId);
        if (now === undefined) return null;
        if (now === fileId) throw err;
        return await cached(at, size, now, signal);
      }
    },

    refresh,

    // Whether a Volume's full-size Image is on disk already: a bulk job
    // paces only the fetches that reach Astia.
    async isCached(at: ImageRef) {
      const fileId = (await astia.volumeImages(at.volumeId))[at.image - 1];
      if (fileId === undefined) return false;
      return await Bun.file(join(dir, `${fileId}.jpg`)).exists();
    },

    async status(): Promise<ScanCacheStatus> {
      await ready;
      return { cap, used: totalSize(await cachedFiles(dir)), caps: CAPS };
    },

    // Saves the cap for the install, and shrinks to it at once.
    async setCap(bytes: number) {
      await ready;
      const settings = await readSettings(settingsFile);
      const saved = { ...settings, scanCacheBytes: bytes };
      await Bun.write(settingsFile, `${JSON.stringify(saved, null, 2)}\n`);
      cap = bytes;
      await prune(null);
    },

    async clear() {
      const files = await cachedFiles(dir);
      await Promise.all(files.map((f) => rm(f.path, { force: true })));
    }
  };
}

export type ScanCache = ReturnType<typeof openScanCache>;

// GET the status, PUT `{ cap }` of the choices, DELETE to clear the cache;
// each answers with the status.
export async function routeScanCache(cache: ScanCache, req: Request) {
  if (req.method === 'PUT') {
    const body = (await req.json().catch(() => null)) as {
      cap?: unknown;
    } | null;
    const cap = body?.cap;
    if (typeof cap !== 'number' || !CAPS.includes(cap)) {
      return new Response(`expected { cap } of ${CAPS.join(', ')}`, {
        status: 400
      });
    }
    await cache.setCap(cap);
  } else if (req.method === 'DELETE') {
    await cache.clear();
  } else if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return Response.json(await cache.status());
}
