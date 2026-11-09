// Downloading a Volume: every Image, full size and thumbnail, fetched into
// the Scan cache, so stepping through it works without Astia. They're
// ordinary cache, under its cap like any Image viewed. One Volume at a
// time, the rest queued behind it, and one Image at a time through the
// cache's full-size lane: an Image the Scan viewer asks for meanwhile goes
// first, as the lane takes the latest request first and a download only
// ever has one waiting.
//
// Nothing here is saved: quitting the app stops a download, and nothing
// starts again on its own at launch. Started again, a download carries on
// from what's in the cache.

import type { DownloadError, DownloadStatus } from '@/common/types';

import { AstiaError, NoImageError } from './astia';
import type { Astia, ImageRef } from './astia';
import type { ScanCache } from './scan-cache';

const GAP_MS = 1000;
const RETRY_MS = 30_000;
const RETRIES = 3;

interface Options {
  // The pause after each Image fetched from Astia.
  gapMs?: number;
  // The wait before trying an Image again after Astia failed on it, and
  // how many times.
  retryMs?: number;
  retries?: number;
}

// Waits, unless `signal` aborts first.
async function pause(ms: number, signal: AbortSignal) {
  if (signal.aborted) return;
  const waited = Promise.withResolvers<undefined>();
  const timer = setTimeout(() => {
    waited.resolve(undefined);
  }, ms);
  function stop() {
    clearTimeout(timer);
    waited.resolve(undefined);
  }
  signal.addEventListener('abort', stop, { once: true });
  await waited.promise;
  signal.removeEventListener('abort', stop);
}

// Whether the download was stopped by now, however it looked before.
function stopped(signal: AbortSignal) {
  return signal.aborted;
}

// A download stopped by what Astia answered.
class Stopped extends Error {
  override name = 'Stopped';
  constructor(readonly why: DownloadError) {
    super(why);
  }
}

// Why a download stopped, from what was thrown: Astia failing, or what it
// answered; anything else is a bug.
function errorOf(err: unknown): DownloadError {
  if (err instanceof Stopped) return err.why;
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  if (!(err instanceof AstiaError)) throw err;
  return 'unreachable';
}

export function openDownloads(
  { astia, cache }: { astia: Astia; cache: ScanCache },
  options: Options = {}
) {
  const gapMs = options.gapMs ?? GAP_MS;
  const retryMs = options.retryMs ?? RETRY_MS;
  const retries = options.retries ?? RETRIES;
  const queue: string[] = [];
  let running: { volumeId: string; stop: AbortController } | null = null;
  // Those stopped short this run, and why: null when stopped by hand.
  const ended = new Map<string, DownloadError | null>();
  let idle = Promise.withResolvers<undefined>();
  idle.resolve(undefined);

  // Whether Astia's own list, asked for past the cache, no longer has the
  // Image's file: a re-scan. Astia answers a file it has with its "no
  // preview" placeholder now and then too, so that alone says nothing.
  async function rescanned(at: ImageRef) {
    const kept = (await astia.volumeImages(at.volumeId))[at.image - 1];
    const now = await astia.peekImages(at.volumeId);
    return kept !== undefined && !now.includes(kept);
  }

  // The full-size Image, tried again while Astia fails or gives no image,
  // up to `retries` times. Says whether it was fetched from Astia.
  async function fetchFull(at: ImageRef, signal: AbortSignal) {
    const fetched = !(await cache.isCached(at));
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one try at a time
        await cache.image(at, 'full', signal);
        return fetched;
      } catch (err) {
        if (stopped(signal)) return false;
        // Stops on anything but Astia failing.
        errorOf(err);
        if (attempt >= retries) {
          if (!(err instanceof NoImageError)) throw err;
          // eslint-disable-next-line no-await-in-loop -- once, at the end
          throw new Stopped((await rescanned(at)) ? 'rescanned' : 'no-image');
        }
        // eslint-disable-next-line no-await-in-loop -- waiting out Astia
        await pause(retryMs, signal);
      }
    }
  }

  // The Image's thumbnail, if Astia gives it: only the Scan viewer's
  // placeholder while the full Image loads, so one missing stops nothing.
  async function fetchThumb(at: ImageRef, signal: AbortSignal) {
    try {
      await cache.image(at, 'thumb', signal);
    } catch (err) {
      if (!stopped(signal)) errorOf(err);
    }
  }

  async function download(volumeId: string, signal: AbortSignal) {
    const images = (await astia.volumeImages(volumeId)).length;
    for (let image = 1; image <= images && !signal.aborted; image += 1) {
      const at = { volumeId, image };
      // eslint-disable-next-line no-await-in-loop -- one Image at a time
      const full = await fetchFull(at, signal);
      // Stopped while the full Image came, its thumbnail can wait too.
      if (stopped(signal)) break;
      // eslint-disable-next-line no-await-in-loop -- its thumbnail beside it
      await fetchThumb(at, signal);
      // eslint-disable-next-line no-await-in-loop -- paced, only past the cache
      if (full) await pause(gapMs, signal);
    }
  }

  function pump() {
    if (running !== null) return;
    const volumeId = queue.shift();
    if (volumeId === undefined) {
      idle.resolve(undefined);
      return;
    }
    const stop = new AbortController();
    running = { volumeId, stop };
    void download(volumeId, stop.signal)
      .then(() => {
        if (stop.signal.aborted) ended.set(volumeId, null);
      })
      .catch((err: unknown) => {
        ended.set(volumeId, errorOf(err));
      })
      .finally(() => {
        running = null;
        pump();
      });
  }

  function unqueue(volumeId: string) {
    const at = queue.indexOf(volumeId);
    if (at !== -1) {
      queue.splice(at, 1);
      ended.set(volumeId, null);
    }
    if (running?.volumeId === volumeId) running.stop.abort();
  }

  function stateOf(volumeId: string): DownloadStatus | null {
    if (running?.volumeId === volumeId) {
      return { volumeId, state: 'downloading', error: null };
    }
    if (queue.includes(volumeId)) {
      return { volumeId, state: 'queued', error: null };
    }
    const error = ended.get(volumeId);
    return error === undefined ? null : { volumeId, state: 'stopped', error };
  }

  return {
    // Downloads the Volume, or carries on from the first Image not on
    // disk; one queued or on its way already stays as it is.
    start(volumeId: string) {
      if (running?.volumeId === volumeId || queue.includes(volumeId)) return;
      ended.delete(volumeId);
      if (running === null && queue.length === 0) {
        idle = Promise.withResolvers();
      }
      queue.push(volumeId);
      pump();
    },

    // Stops the Volume's download; what it fetched stays in the cache.
    stop(volumeId: string) {
      unqueue(volumeId);
    },

    // The Volume's download this run; null for none, or one that finished.
    of: stateOf,

    // Every download this run that hasn't finished: on its way, queued in
    // the order asked for, then those stopped short.
    list() {
      const ids = [
        ...(running === null ? [] : [running.volumeId]),
        ...queue,
        ...ended.keys()
      ];
      return ids.map((id) => stateOf(id)!);
    },

    // Settles once nothing is queued or on its way.
    idle: () => idle.promise
  };
}

export type Downloads = ReturnType<typeof openDownloads>;

// GET the downloads this run; on one Volume, PUT to download or carry on,
// POST `stop` to stop. Each answers with the downloads.
export function routeDownloads(
  downloads: Downloads,
  req: Request,
  at: { volumeId: string; stop: boolean } | null
) {
  const method = at === null ? 'GET' : at.stop ? 'POST' : 'PUT';
  if (req.method !== method) {
    return new Response('method not allowed', { status: 405 });
  }
  if (at?.stop === true) downloads.stop(at.volumeId);
  else if (at !== null) downloads.start(at.volumeId);
  return Response.json(downloads.list());
}
