// Astia re-scanning a pinned Volume: the pins made on the filming it
// replaced, which switching to the new one leaves out. The Scan viewer asks
// about the Volume it shows, and switches when the person says so.

import type { Rescan, StalePin } from '@/common/types';

import { sameIds, viewerUrls } from '../../astia/astia';
import type { Astia } from '../../astia/astia';
import type { StorageImages } from '../../storage';
import { split } from '../../volume-facts';
import type { Filming, LocalPins, Pins } from '../../volume-facts';
import { markKey, recordMarkKey } from '../record';

// The pins as kept: the data folder's, in its file and in each dataset's
// Marks.
export type KeptPins = LocalPins[];

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

function volumeEntries(volumes: Pins['volumes']) {
  return Object.entries(volumes).flatMap(([volumeId, v]): Entry[] => {
    const title = v.title ?? null;
    const pages = v.pages.map((pin) => ({
      volumeId,
      title,
      ...on(pin),
      about: {
        kind: 'page' as const,
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
              by: provenance(pin),
              url,
              markKey: markKey({ url, recordId: null })
            }
          }
        ]
      : []
  );
  return [...volumeEntries(local.volumes), ...references];
}

// Every pin on an Image.
function entriesOf(pins: KeptPins) {
  return pins.flatMap(localEntries);
}

// The Volume's pins of `entries` that `filming` leaves out.
function staleIn(entries: Entry[], filming: Filming) {
  return split(filming, entries).stale.map((e): StalePin => ({
    ...e.about,
    image: e.image
  }));
}

// ---------------------------------------------------------------- the app

// Astia's re-scan of the Volume the cached list is of, not yet switched
// to: null when Astia lists the Volume as cached.
async function rescanOf(
  astia: Astia,
  kept: () => Promise<KeptPins>,
  volumeId: string
): Promise<Rescan | null> {
  const [cached, now] = await Promise.all([
    astia.volumeImages(volumeId),
    astia.peekImages(volumeId)
  ]);
  if (sameIds(cached, now)) return null;
  const entries = entriesOf(await kept()).filter(
    (e) => e.volumeId === volumeId
  );
  return {
    cached: cached.length,
    images: now.length,
    stale: staleIn(entries, { volumeId, files: now })
  };
}

interface RescanReads {
  astia: Astia;
  images: Pick<StorageImages, 'refresh'>;
  kept: () => Promise<KeptPins>;
}

// Switches the Volume to Astia's new filming: its Images' viewer URLs, and
// the re-scan it switched to, null when there was none.
export async function switchFilming(
  { astia, images, kept }: RescanReads,
  volumeId: string
) {
  const rescan = await rescanOf(astia, kept, volumeId);
  await images.refresh(volumeId);
  return { urls: await viewerUrls(astia, volumeId), rescan };
}

// GET the Volume's re-scan not yet switched to, `{ rescan }`. Switching is
// a dataset's, which says so in its Changes.
export async function routeRescan(
  { astia, kept }: RescanReads,
  req: Request,
  volumeId: string
) {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return Response.json({ rescan: await rescanOf(astia, kept, volumeId) });
}
