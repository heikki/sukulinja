// The Scan cache: Astia's Images kept on disk for the Scan viewer and
// Vision Match. Full-size ones are fetched one at a time, the latest request
// first; thumbnails, a few KB each, go straight away, so one never waits
// behind a full Image. The cache is capped by a size the install sets,
// kept in the data folder rather than a viewer's cookie, and drops the
// least recently viewed Images first. Each Volume's Images, full size and
// thumbnails side by side, are kept in a folder named by its id.
//
// Astia may re-scan a Volume, giving every Image a new file id and none by
// the old ones. Switching to the new filming means asking for the
// Volume's list again and dropping the cached Images of the one replaced.
// The cache never switches on its own: the Scan viewer asks first (see
// pins/rescans.ts).
//
// An offloaded Volume keeps only its cited full-size Images, fetched first
// and named in `offloaded.json` in its folder; they're never pruned, and
// nothing of it is fetched from Astia until it's brought back.

import {
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  utimes
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { ScanCacheStatus, VolumeOnDisk } from '@/common/types';

import { NoImageError } from './astia';
import type { Astia, ImageRef, ImageSize } from './astia';
import { openCacheRoom } from './cache-room';
import { readSettings, saveSetting } from './install-settings';
import { jpegSize } from './jpeg';
import { openOffloadFolder } from './offload-folder';

const GB = 1024 ** 3;
// Every cap the cache can be set to; offered are those its disk has room
// for (`capChoices`).
export const CAPS = [5, 10, 20, 40, 80, 160, 320, 640].map((n) => n * GB);
// How many caps are offered at most: the largest that fit.
const OFFERED = 5;
const DEFAULT_CAP_BYTES = 5 * GB;
// In an offloaded Volume's folder: the Images it keeps.
const OFFLOADED = 'offloaded.json';

// What an offloaded Volume keeps: its Images by number, and their files;
// and what it offloaded, its full-size Images and their bytes.
interface Kept {
  images: number[];
  files: string[];
  away: { images: number; bytes: number };
}

// An Image of an offloaded Volume that isn't on disk.
export class OffloadedError extends Error {
  override name = 'OffloadedError';
}

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

// The Volumes' folders, each named by its id.
async function volumeDirs(dir: string) {
  const names = await readdir(dir).catch(() => []);
  return names.map((name) => join(dir, name));
}

// The cached Images, in their Volumes' folders; none before the first is
// fetched. One removed while they're listed is left out.
async function cachedFiles(dir: string) {
  const listed = await Promise.all(
    (await volumeDirs(dir)).map(async (volume) => {
      const names = await readdir(volume).catch(() => []);
      return names.map((name) => join(volume, name));
    })
  );
  const files = await Promise.all(
    listed
      .flat()
      .filter((path) => path.endsWith('.jpg'))
      .map(async (path) => {
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

// The cap saved for the install, if it's one of the choices.
async function savedCap(file: string) {
  const { scanCacheBytes } = await readSettings(file);
  return typeof scanCacheBytes === 'number' && CAPS.includes(scanCacheBytes)
    ? scanCacheBytes
    : DEFAULT_CAP_BYTES;
}

// The caps offered, smallest first: those the cache could fill, `room`
// being what it holds and the disk's free space together, the largest of
// them when more fit; the smallest when none does; and the one set.
export function capChoices(room: number, cap: number) {
  const fit = CAPS.filter((c) => c <= room || c === CAPS[0]);
  const offered = fit.slice(-OFFERED);
  return offered.includes(cap)
    ? offered
    : [...offered, cap].toSorted((a, b) => a - b);
}

// The free space on the disk holding `path`, in bytes.
async function diskFree(path: string) {
  const info = await statfs(path).catch(() => null);
  return info === null ? 0 : info.bavail * info.bsize;
}

// ---------------------------------------------------------------- the cache

// The Scan cache of the data folder at `root`, fetching from `astia`: its
// Images in `.astia-images/<volumeId>`, its cap in `settings.local.json`;
// the caps offered by `freeSpace`, the disk's by default.
export function openScanCache({
  astia,
  root,
  freeSpace = async () => await diskFree(root)
}: {
  astia: Astia;
  root: string;
  freeSpace?: () => Promise<number>;
}) {
  const dir = join(root, '.astia-images');
  const settingsFile = join(root, 'settings.local.json');
  const folder = openOffloadFolder(settingsFile);
  const inQueue = openQueue();
  const cacheRoom = openCacheRoom();
  function pathOf(volumeId: string, fileId: string) {
    return join(dir, volumeId, `${fileId}.jpg`);
  }
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
    const measured = cacheRoom.measuring();
    const files = await cachedFiles(dir);
    const kept = await keptPaths();
    let total = totalSize(files);
    const dropped: string[] = [];
    for (const f of files.sort((a, b) => a.viewed - b.viewed)) {
      if (total <= cap) break;
      if (f.path === keep || kept.has(f.path)) continue;
      dropped.push(f.path);
      total -= f.size;
    }
    await Promise.all(dropped.map((path) => rm(path, { force: true })));
    measured(cap - total);
  }

  // One Astia is known to no longer have isn't asked for. Writing the file
  // makes the Volume's folder.
  async function download(volumeId: string, fileId: string, path: string) {
    if (await astia.isGone(volumeId, fileId)) {
      throw new NoImageError(`gone with a re-scan: ${fileId}`);
    }
    const bytes = await astia.imageBytes(volumeId, fileId);
    // Written aside and moved in, so a cut-off fetch never shows as cached.
    const part = `${path}.part`;
    await Bun.write(part, bytes);
    await rename(part, path);
    // A copy into the offload folder too, aside: a slow drive never holds
    // up the Image.
    void folder.keep(volumeId, basename(path), bytes).catch(() => undefined);
    cacheRoom.wrote(bytes.length);
    if (cacheRoom.outgrown()) await prune(path);
  }

  async function fileAt(at: ImageRef, size: ImageSize) {
    return (await astia.volumeImages(at.volumeId, size))[at.image - 1];
  }

  // What an offloaded Volume keeps: its Images by number, and their
  // files; null for one not offloaded.
  async function keptOf(volumeId: string) {
    const file = Bun.file(join(dir, volumeId, OFFLOADED));
    if (!(await file.exists())) return null;
    const read = (await file.json().catch(() => null)) as Partial<Kept> | null;
    return {
      images: Array.isArray(read?.images) ? read.images : [],
      files: Array.isArray(read?.files) ? read.files : [],
      away: read?.away ?? { images: 0, bytes: 0 }
    };
  }

  // The files of every offloaded Volume's kept Images, by path: never
  // pruned, as they aren't fetched again.
  async function keptPaths() {
    const kept = await Promise.all(
      (await volumeDirs(dir)).map(async (volume) => {
        const id = basename(volume);
        const files = (await keptOf(id))?.files ?? [];
        return files.map((f) => pathOf(id, f));
      })
    );
    return new Set(kept.flat());
  }

  async function cached(
    at: ImageRef,
    size: ImageSize,
    fileId: string,
    signal: AbortSignal
  ) {
    const path = pathOf(at.volumeId, fileId);
    if (await touch(path)) return path;
    const away = await folder.find(at.volumeId, fileId);
    if (away !== null) return away;
    if ((await keptOf(at.volumeId)) !== null) {
      throw new OffloadedError(`offloaded: ${at.volumeId} ${at.image}`);
    }
    if (size === 'thumb') {
      await download(at.volumeId, fileId, path);
    } else {
      await inQueue(fileId, () => download(at.volumeId, fileId, path), signal);
    }
    return path;
  }

  // The Volume's files of those ids that are on disk, with their sizes.
  async function onDisk(fileIds: string[], volumeId: string) {
    const found = await Promise.all(
      fileIds.map(async (fileId) => {
        const from = pathOf(volumeId, fileId);
        const info = await stat(from).catch(() => null);
        return info === null ? [] : [{ from, fileId, size: info.size }];
      })
    );
    return found.flat();
  }

  // An Image an offload keeps, on disk before it's offloaded.
  async function fetchKept(volumeId: string, image: number) {
    const at = { volumeId, image };
    const fileId = await fileAt(at, 'full');
    if (fileId === undefined) return;
    await cached(at, 'full', fileId, new AbortController().signal);
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
  // file ids it no longer lists, here and in the offload folder.
  async function refresh(volumeId: string) {
    const before = await listed(volumeId);
    await astia.refreshImages(volumeId);
    const now = new Set(await listed(volumeId));
    const gone = before.filter((id) => !now.has(id));
    await Promise.all(
      gone.map((id) => rm(pathOf(volumeId, id), { force: true }))
    );
    await folder.drop(
      volumeId,
      gone.map((id) => `${id}.jpg`)
    );
  }

  // Drops from the offload folder whatever of the Volume's Astia's kept
  // list doesn't have, an old filming's Images, and copies left cut off;
  // none while that list isn't kept.
  async function dropOldFilming(volumeId: string) {
    if ((await astia.cachedImages(volumeId)) === null) return;
    const now = new Set((await listed(volumeId)).map((id) => `${id}.jpg`));
    const names = await folder.names(volumeId);
    await folder.drop(
      volumeId,
      // Only an Image or a copy of one: anything else there isn't the app's.
      names.filter(
        (n) => n.endsWith('.part') || (n.endsWith('.jpg') && !now.has(n))
      )
    );
  }

  return {
    // The cached file of a Volume's Image (numbered from 1), fetched if need
    // be; null when the Volume has no such Image. Throws when Astia fails,
    // or when `signal` aborts first.
    async image(at: ImageRef, size: ImageSize, signal: AbortSignal) {
      const fileId = await fileAt(at, size);
      if (fileId === undefined) return null;
      return await cached(at, size, fileId, signal);
    },

    refresh,

    // Whether a Volume's full-size Image is on disk already: a bulk job
    // paces only the fetches that reach Astia.
    async isCached(at: ImageRef) {
      const fileId = (await astia.volumeImages(at.volumeId))[at.image - 1];
      if (fileId === undefined) return false;
      if (await Bun.file(pathOf(at.volumeId, fileId)).exists()) return true;
      return (await folder.find(at.volumeId, fileId)) !== null;
    },

    async status(): Promise<ScanCacheStatus> {
      await ready;
      const used = totalSize(await cachedFiles(dir));
      const room = used + (await freeSpace());
      return { cap, used, caps: capChoices(room, cap) };
    },

    // What of the Volume is on disk: its full-size Images of Astia's list
    // (`images`, null until the list has been asked for) here or in the
    // offload folder while it's attached, and the space its files take
    // here, thumbnails and all. Never asks Astia.
    async onDisk(volumeId: string): Promise<VolumeOnDisk> {
      const names = await readdir(join(dir, volumeId)).catch(() => []);
      const files = new Set(names.filter((n) => n.endsWith('.jpg')));
      const away = new Set(await folder.names(volumeId));
      const listed = await astia.cachedImages(volumeId);
      const sizes = await Promise.all(
        [...files].map(
          async (n) =>
            (await stat(join(dir, volumeId, n)).catch(() => null))?.size ?? 0
        )
      );
      return {
        images: listed?.length ?? null,
        cached: (listed ?? []).filter(
          (id) => files.has(`${id}.jpg`) || away.has(`${id}.jpg`)
        ).length,
        bytes: sizes.reduce((sum, b) => sum + b, 0)
      };
    },

    // The Volumes with any Image on disk, or offloaded, by id.
    async volumes() {
      const listed = await Promise.all(
        (await volumeDirs(dir)).map(async (volume) => {
          const names = await readdir(volume).catch(() => []);
          const kept = names.some((n) => n.endsWith('.jpg') || n === OFFLOADED);
          return kept ? [volume] : [];
        })
      );
      return listed.flat().map((path) => basename(path));
    },

    // Offloads the Volume: fetches the Images numbered in `images` that
    // aren't on disk yet, then drops every other full-size one, and from
    // then on fetches none, nor prunes those kept, until it's brought back;
    // its thumbnails stay. Throws, offloading nothing, when Astia fails.
    async offload(volumeId: string, images: number[]) {
      await folder.ready();
      const marker = join(dir, volumeId, OFFLOADED);
      // Offloaded already, as it was until the cited ones are on disk.
      const before = await keptOf(volumeId);
      await rm(marker, { force: true });
      try {
        await Promise.all(
          images.map(async (n) => {
            await fetchKept(volumeId, n);
          })
        );
      } catch (err) {
        if (before !== null) await Bun.write(marker, JSON.stringify(before));
        throw err;
      }
      const full = await astia.volumeImages(volumeId, 'full');
      const sorted = images.toSorted((a, b) => a - b);
      const files = sorted.flatMap((n) => full[n - 1] ?? []);
      const keep = new Set(files);
      const leaving = await onDisk(
        full.filter((id) => !keep.has(id)),
        volumeId
      );
      const away = {
        images: leaving.length + (before?.away.images ?? 0),
        bytes: totalSize(leaving) + (before?.away.bytes ?? 0)
      };
      const kept: Kept = { images: sorted, files, away };
      await mkdir(join(dir, volumeId), { recursive: true });
      await Bun.write(marker, `${JSON.stringify(kept)}\n`);
      // Into the offload folder, if one is set; dropped with none.
      await folder.moveIn(volumeId, leaving);
      await Promise.all(
        leaving.map(async ({ from }) => {
          await rm(from, { force: true });
        })
      );
    },

    // Whether the Image is one an entry can be cited on: any of a Volume
    // not offloaded, and those an offloaded one keeps.
    async keeps(at: ImageRef) {
      const kept = await keptOf(at.volumeId);
      return kept === null || kept.images.includes(at.image);
    },

    // The offload folder: set, attached, or none.
    offloadFolder: folder,

    // Whether the Volume is offloaded.
    async isOffloaded(volumeId: string) {
      return (await keptOf(volumeId)) !== null;
    },

    // What an offloaded Volume offloaded: its full-size Images and their
    // bytes; null for one not offloaded.
    async offloadedOf(volumeId: string) {
      return (await keptOf(volumeId))?.away ?? null;
    },

    // The bytes an offload keeping the Images numbered in `images` would
    // free; null while Astia's list of the Volume isn't kept. Never asks
    // Astia.
    async freedBy(volumeId: string, images: number[]) {
      const full = await astia.cachedImages(volumeId);
      if (full === null) return null;
      const keep = new Set(images.map((n) => full[n - 1]));
      const leaving = full.filter((id) => !keep.has(id));
      return totalSize(await onDisk(leaving, volumeId));
    },

    // Its Images copied back from the offload folder, which keeps them;
    // those not there fetched from Astia again, as any Volume's. Throws
    // FolderAwayError, bringing back nothing, when the folder is set and
    // away.
    async bringBack(volumeId: string) {
      try {
        await folder.copyOut(volumeId, join(dir, volumeId));
      } finally {
        // Some may have arrived even if the copying failed.
        cacheRoom.forget();
      }
      await rm(join(dir, volumeId, OFFLOADED), { force: true });
    },

    // Copies into the offload folder every Image on disk it hasn't whole,
    // as those fetched before it was set or while it was away, or cut off
    // on their way in; then drops from it an old filming's Images, left
    // there by a switch to a re-scan made while it was away. Only names
    // and sizes are compared, and Astia isn't asked, so it's quick.
    async archive() {
      for (const { path } of await cachedFiles(dir)) {
        // eslint-disable-next-line no-await-in-loop -- one file at a time
        await folder
          .keep(basename(dirname(path)), basename(path), path)
          // One pruned meanwhile is let be; the rest are still copied.
          .catch(() => undefined);
      }
      for (const volumeId of await folder.volumes()) {
        // eslint-disable-next-line no-await-in-loop -- one Volume at a time
        await dropOldFilming(volumeId);
      }
    },

    // Drops the Volume's Images, and its folder.
    async remove(volumeId: string) {
      await rm(join(dir, volumeId), { recursive: true, force: true });
    },

    // Saves the cap for the install, and shrinks to it at once.
    async setCap(bytes: number) {
      await ready;
      await saveSetting(settingsFile, 'scanCacheBytes', bytes);
      cap = bytes;
      await prune(null);
    },

    // Drops every Image but those offloaded Volumes keep, as they aren't
    // fetched again; then the Volumes' folders that leaves empty.
    async clear() {
      const files = await cachedFiles(dir);
      const kept = await keptPaths();
      await Promise.all(
        files
          .filter((f) => !kept.has(f.path))
          .map(async (f) => {
            await rm(f.path, { force: true });
          })
      );
      const volumes = await volumeDirs(dir);
      // One a fetch is still writing into stays.
      await Promise.all(volumes.map((v) => rmdir(v).catch(() => undefined)));
    }
  };
}

export type ScanCache = ReturnType<typeof openScanCache>;

// The full-size Image's size in pixels, from its JPEG's header, through the
// cache; null when it can't be had.
export async function imageSize(cache: ScanCache, at: ImageRef) {
  const path = await cache
    .image(at, 'full', new AbortController().signal)
    .catch(() => null);
  if (path === null) return null;
  return jpegSize(
    await Bun.file(path)
      .slice(0, 1 << 18)
      .bytes()
  );
}
