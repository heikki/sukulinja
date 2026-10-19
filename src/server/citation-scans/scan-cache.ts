// The Scan cache setting: how much space Astia's Images may take. It belongs
// to the install, so it is kept in the data folder rather than a viewer's
// cookie, beside the local pins.

import { join } from 'node:path';

import type { ScanCacheStatus } from '@common/types';

import {
  clearImageCache,
  imageCacheCap,
  imageCacheUsed,
  setImageCacheCap,
  shrinkImageCache
} from './images';

const GB = 1024 ** 3;
const CAPS = [1, 2, 5, 10].map((n) => n * GB);

let settingsFile = '';
// Reading the saved cap, which the route waits for.
let loaded: Promise<void> = Promise.resolve();

// The install's settings; none when the file is missing or unreadable.
async function readSettings() {
  const none: Record<string, unknown> = {};
  const file = Bun.file(settingsFile);
  if (!(await file.exists())) return none;
  const read = (await file.json().catch(() => null)) as typeof none | null;
  return read ?? none;
}

async function loadCap() {
  const { scanCacheBytes } = await readSettings();
  if (typeof scanCacheBytes === 'number' && CAPS.includes(scanCacheBytes)) {
    setImageCacheCap(scanCacheBytes);
  }
}

// The cap saved for this install, if any, from the data folder at `root`.
export function useScanCacheSettings(root: string) {
  settingsFile = join(root, 'settings.local.json');
  loaded = loadCap();
}

async function saveCap(cap: number) {
  const settings = { ...(await readSettings()), scanCacheBytes: cap };
  await Bun.write(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
}

async function status() {
  const body: ScanCacheStatus = {
    cap: imageCacheCap(),
    used: await imageCacheUsed(),
    caps: CAPS
  };
  return Response.json(body);
}

// A new cap takes effect at once, dropping the least recently viewed
// Images over it.
async function changeCap(req: Request) {
  const body = (await req.json().catch(() => null)) as { cap?: unknown } | null;
  const cap = body?.cap;
  if (typeof cap !== 'number' || !CAPS.includes(cap)) {
    return new Response(`expected { cap } of ${CAPS.join(', ')}`, {
      status: 400
    });
  }
  await saveCap(cap);
  setImageCacheCap(cap);
  await shrinkImageCache();
  return await status();
}

// GET the status, PUT `{ cap }`, DELETE to clear the cache.
export async function routeScanCache(req: Request) {
  await loaded;
  if (req.method === 'GET') return await status();
  if (req.method === 'PUT') return await changeCap(req);
  if (req.method === 'DELETE') {
    await clearImageCache();
    return await status();
  }
  return new Response('method not allowed', { status: 405 });
}
