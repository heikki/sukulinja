// Astia re-scanning a pinned Volume: the pins made on the filming it
// replaced, which switching to the new one leaves out. scripts/check-rescans
// checks every pinned Volume this way; the Scan viewer asks about the one
// it shows, and switches when the person says so.

import type { Rescan, StalePin } from '@/common/types';

import { viewerUrls } from './astia';
import type { Astia } from './astia';
import { split } from './filming';
import type { Filming } from './filming';
import type { Pins } from './locate';
import type { LocalPins } from './pin-files';
import { markKey, recordMarkKey } from './record';
import type { ScanCache } from './scan-cache';

// The pins as kept: shipped with the app, and the data folder's own, in
// its file and in each dataset's Marks.
export interface KeptPins {
  shipped: Pins['volumes'];
  local: LocalPins[];
}

// One pin on an Image of a Volume, and how it's reported when stale.
interface Entry {
  volumeId: string;
  title: string | null;
  image: number;
  fileId?: string;
  about: Omit<StalePin, 'image'>;
}

function on(pin: { image: number; fileId?: string }) {
  return { image: pin.image, fileId: pin.fileId };
}

function provenance(pin: { by?: string }) {
  return pin.by === 'vision' ? ('vision' as const) : ('hand' as const);
}

function onImage<T extends { image?: number }>(
  pin: T
): pin is T & { image: number } {
  return pin.image !== undefined;
}

function volumeEntries(volumes: Pins['volumes'], from: StalePin['from']) {
  return Object.entries(volumes).flatMap(([volumeId, v]): Entry[] => {
    const title = v.title ?? null;
    const pages = v.pages.map((pin) => ({
      volumeId,
      title,
      ...on(pin),
      about: {
        kind: 'page' as const,
        from,
        by: provenance(pin),
        pages: pin.pages
      }
    }));
    const records = (v.records ?? []).map((pin) => ({
      volumeId,
      title,
      ...on(pin),
      about: {
        kind: 'record' as const,
        from,
        by: provenance(pin),
        record: pin.record,
        markKey: recordMarkKey(pin.record)
      }
    }));
    return [...pages, ...records];
  });
}

function localEntries(local: LocalPins): Entry[] {
  const references = Object.entries(local.references).flatMap(([url, pin]) =>
    onImage(pin)
      ? [
          {
            volumeId: pin.volumeId,
            title: pin.volume,
            ...on(pin),
            about: {
              kind: 'reference' as const,
              from: 'local' as const,
              by: provenance(pin),
              url,
              markKey: markKey({ url, recordId: null })
            }
          }
        ]
      : []
  );
  const rejected = Object.entries(local.rejected).flatMap(([url, list]) =>
    list.map((pin) => ({
      volumeId: pin.volumeId,
      title: null,
      ...on(pin),
      about: {
        kind: 'rejection' as const,
        from: 'local' as const,
        by: 'hand' as const,
        url
      }
    }))
  );
  return [...volumeEntries(local.volumes, 'local'), ...references, ...rejected];
}

// Every pin on an Image, shipped and local.
function entriesOf(pins: KeptPins) {
  return [
    ...volumeEntries(pins.shipped, 'shipped'),
    ...pins.local.flatMap(localEntries)
  ];
}

// The Volume's pins of `entries` that `filming` leaves out.
function staleIn(entries: Entry[], filming: Filming) {
  return split(filming, entries).stale.map((e): StalePin => ({
    ...e.about,
    image: e.image
  }));
}

function byVolume(entries: Entry[]) {
  const out = new Map<string, Entry[]>();
  for (const e of entries) {
    out.set(e.volumeId, [...(out.get(e.volumeId) ?? []), e]);
  }
  return out;
}

// ---------------------------------------------------------------- the check

export interface Rescanned extends Rescan {
  volumeId: string;
  title: string;
}

export interface CheckResult {
  volumes: number;
  // Pins on an Image saved without a file id, which can't be checked.
  unchecked: number;
  rescanned: Rescanned[];
}

type Lists = (volumeId: string) => Promise<string[]>;

// Checks every Volume with a pin on an Image against `now`, its list as
// Astia gives it now; `cached` is the list the data folder keeps, for its
// Image count.
export async function checkRescans(
  pins: KeptPins,
  now: Lists,
  cached: Lists
): Promise<CheckResult> {
  const all = entriesOf(pins);
  const checkable = all.filter((e) => e.fileId !== undefined);
  const groups = byVolume(checkable);
  const rescanned: Rescanned[] = [];
  for (const [volumeId, entries] of groups) {
    // eslint-disable-next-line no-await-in-loop -- one Volume at a time
    const files = await now(volumeId);
    const stale = staleIn(entries, { volumeId, files });
    if (stale.length === 0) continue;
    rescanned.push({
      volumeId,
      title: entries.find((e) => e.title !== null)?.title ?? volumeId,
      // eslint-disable-next-line no-await-in-loop -- as above
      cached: (await cached(volumeId)).length,
      images: files.length,
      stale
    });
  }
  return {
    volumes: groups.size,
    unchecked: all.length - checkable.length,
    rescanned
  };
}

// ---------------------------------------------------------------- the app

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Astia's re-scan of the Volume the cached list is of, not yet switched
// to: null when Astia lists the Volume as cached.
export async function rescanOf(
  astia: Astia,
  kept: () => Promise<KeptPins>,
  volumeId: string
): Promise<Rescan | null> {
  const [cached, now] = await Promise.all([
    astia.volumeImages(volumeId),
    astia.peekImages(volumeId)
  ]);
  if (sameList(cached, now)) return null;
  const entries = entriesOf(await kept()).filter(
    (e) => e.volumeId === volumeId
  );
  return {
    cached: cached.length,
    images: now.length,
    stale: staleIn(entries, { volumeId, files: now })
  };
}

// GET the Volume's re-scan not yet switched to, `{ rescan }`; POST to
// switch to the new filming, answered with its Images' viewer URLs.
export async function routeRescan(
  {
    astia,
    cache,
    kept
  }: { astia: Astia; cache: ScanCache; kept: () => Promise<KeptPins> },
  req: Request,
  volumeId: string
) {
  if (req.method === 'POST') {
    await cache.refresh(volumeId);
    return Response.json(await viewerUrls(astia, volumeId));
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return Response.json({ rescan: await rescanOf(astia, kept, volumeId) });
}
