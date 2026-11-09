// Downloaded Volumes: every Image of a Volume, full size and thumbnail,
// fetched into the Scan cache and kept there whole, so stepping through
// it works without Astia. One Volume at a time, the rest queued behind it,
// and one Image at a time through the cache's full-size lane: an Image the
// Scan viewer asks for meanwhile goes first, as the lane takes the latest
// request first and a download only ever has one waiting.
//
// Nothing here is saved but which Volumes the cache keeps: quitting the
// app stops a download, and nothing starts again on its own at launch.

import type {
  DownloadError,
  DownloadState,
  DownloadStatus
} from '@/common/types';

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
  const waited = Promise.withResolvers<void>();
  const timer = setTimeout(waited.resolve, ms);
  const stop = () => {
    clearTimeout(timer);
    waited.resolve();
  };
  signal.addEventListener('abort', stop, { once: true });
  await waited.promise;
  signal.removeEventListener('abort', stop);
}

// Why a download stopped, from what Astia threw; anything else is a bug.
function errorOf(err: unknown): DownloadError {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  if (!(err instanceof AstiaError)) throw err;
  return err instanceof NoImageError ? 'rescanned' : 'unreachable';
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
  // Why each stopped, until it's started again.
  const errors = new Map<string, DownloadError>();
  let idle = Promise.withResolvers<void>();
  idle.resolve();

  // One size of an Image, tried again while Astia fails, up to `retries`
  // times. Says whether it fetched a full-size one from Astia.
  async function fetchOne(
    at: ImageRef,
    size: 'full' | 'thumb',
    signal: AbortSignal
  ) {
    if (signal.aborted) return false;
    const fetched = size === 'full' && !(await cache.isCached(at));
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one try at a time
        await cache.image(at, size, signal);
        return fetched;
      } catch (err) {
        if (signal.aborted) return false;
        if (err instanceof NoImageError || attempt >= retries) throw err;
        // Stops on anything but Astia failing.
        errorOf(err);
        // eslint-disable-next-line no-await-in-loop -- waiting out Astia
        await pause(retryMs, signal);
      }
    }
  }

  async function download(volumeId: string, signal: AbortSignal) {
    const images = (await astia.volumeImages(volumeId)).length;
    for (let image = 1; image <= images && !signal.aborted; image += 1) {
      const at = { volumeId, image };
      // eslint-disable-next-line no-await-in-loop -- one Image at a time
      const full = await fetchOne(at, 'full', signal);
      // eslint-disable-next-line no-await-in-loop -- its thumbnail beside it
      await fetchOne(at, 'thumb', signal);
      // eslint-disable-next-line no-await-in-loop -- paced, only past the cache
      if (full) await pause(gapMs, signal);
    }
  }

  function pump() {
    if (running !== null) return;
    const volumeId = queue.shift();
    if (volumeId === undefined) {
      idle.resolve();
      return;
    }
    const stop = new AbortController();
    running = { volumeId, stop };
    void download(volumeId, stop.signal)
      .catch((err: unknown) => {
        errors.set(volumeId, errorOf(err));
      })
      .finally(() => {
        running = null;
        pump();
      });
  }

  function unqueue(volumeId: string) {
    const at = queue.indexOf(volumeId);
    if (at !== -1) queue.splice(at, 1);
    if (running?.volumeId === volumeId) running.stop.abort();
  }

  async function stateOf(volumeId: string): Promise<DownloadStatus> {
    const onDisk = await cache.onDisk(volumeId);
    const whole = onDisk.images !== null && onDisk.cached === onDisk.images;
    let state: DownloadState = 'stopped';
    if (running?.volumeId === volumeId) state = 'downloading';
    else if (queue.includes(volumeId)) state = 'queued';
    else if (whole) state = 'complete';
    const error = state === 'stopped' ? (errors.get(volumeId) ?? null) : null;
    return { volumeId, state, error, ...onDisk };
  }

  return {
    // Downloads the Volume, or carries on from the first Image not on
    // disk; one queued or on its way already stays as it is.
    async start(volumeId: string) {
      await cache.keep(volumeId);
      if (running?.volumeId === volumeId || queue.includes(volumeId)) return;
      errors.delete(volumeId);
      if (running === null && queue.length === 0) {
        idle = Promise.withResolvers();
      }
      queue.push(volumeId);
      pump();
    },

    // Stops the Volume's download, keeping what's on disk kept.
    stop(volumeId: string) {
      unqueue(volumeId);
    },

    // Stops it, and hands its Images back to the cap.
    async remove(volumeId: string) {
      unqueue(volumeId);
      errors.delete(volumeId);
      await cache.release(volumeId);
    },

    // The Volume's download; null when it isn't a Downloaded Volume.
    async of(volumeId: string) {
      const kept = await cache.kept();
      return kept.includes(volumeId) ? await stateOf(volumeId) : null;
    },

    // Every Downloaded Volume, in the order asked for.
    async list() {
      return await Promise.all((await cache.kept()).map(stateOf));
    },

    // Settles once nothing is queued or on its way.
    idle: () => idle.promise
  };
}

export type Downloads = ReturnType<typeof openDownloads>;

// GET every Downloaded Volume; on one Volume, PUT to download or resume,
// POST `stop`, DELETE to remove. Each answers with the downloads.
export async function routeDownloads(
  downloads: Downloads,
  req: Request,
  at: { volumeId: string; stop: boolean } | null
) {
  if (at === null) {
    if (req.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }
  } else if (at.stop) {
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    downloads.stop(at.volumeId);
  } else if (req.method === 'PUT') {
    await downloads.start(at.volumeId);
  } else if (req.method === 'DELETE') {
    await downloads.remove(at.volumeId);
  } else {
    return new Response('method not allowed', { status: 405 });
  }
  return Response.json(await downloads.list());
}
