// Which pinned Volumes Astia has re-scanned: those where a pin's file id is
// no longer the one the Volume's list gives at its Image number.

import { isCurrent } from '@server/citation-scans/locate';
import type { Pins } from '@server/citation-scans/locate';
import type { LocalPins } from '@server/citation-scans/pin-files';

// A pin made on a filming Astia has since replaced.
export interface StalePin {
  kind: 'Page pin' | 'Record pin' | 'Reference pin' | 'Rejection';
  from: 'shipped' | 'local';
  by: 'hand' | 'vision';
  image: number;
  // The pages, record or reference it pins.
  what: string;
}

export interface Rescanned {
  volumeId: string;
  title: string;
  // Images in the Volume's cached list, when there is one, and now.
  cached: number | null;
  images: number;
  stale: StalePin[];
}

export interface CheckResult {
  volumes: number;
  // Pins on an Image saved without a file id, which can't be checked.
  unchecked: number;
  rescanned: Rescanned[];
}

type Lists = (volumeId: string) => Promise<string[]>;

interface Entry extends Omit<StalePin, 'image'> {
  volumeId: string;
  title: string | null;
  pin: { image?: number; fileId?: string };
}

function provenance(pin: { by?: string }) {
  return pin.by === 'vision' ? ('vision' as const) : ('hand' as const);
}

function pagesOf(pages: number[]) {
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join('–')}`;
}

function volumeEntries(
  volumes: Pins['volumes'],
  from: StalePin['from']
): Entry[] {
  return Object.entries(volumes).flatMap(([volumeId, v]) => {
    const title = v.title ?? null;
    const pages = v.pages.map((pin) => ({
      volumeId,
      title,
      pin,
      kind: 'Page pin' as const,
      from,
      by: provenance(pin),
      what: pagesOf(pin.pages)
    }));
    const records = (v.records ?? []).map((pin) => ({
      volumeId,
      title,
      pin,
      kind: 'Record pin' as const,
      from,
      by: provenance(pin),
      what: `record ${pin.record}`
    }));
    return [...pages, ...records];
  });
}

function localEntries(local: LocalPins): Entry[] {
  const references = Object.entries(local.references).map(([url, pin]) => ({
    volumeId: pin.volumeId,
    title: pin.volume,
    pin,
    kind: 'Reference pin' as const,
    from: 'local' as const,
    by: provenance(pin),
    what: url
  }));
  const rejected = Object.entries(local.rejected).flatMap(([url, list]) =>
    list.map((pin) => ({
      volumeId: pin.volumeId,
      title: null,
      pin,
      kind: 'Rejection' as const,
      from: 'local' as const,
      by: 'hand' as const,
      what: url
    }))
  );
  return [...volumeEntries(local.volumes, 'local'), ...references, ...rejected];
}

function byVolume(entries: Entry[]) {
  const out = new Map<string, Entry[]>();
  for (const e of entries) {
    out.set(e.volumeId, [...(out.get(e.volumeId) ?? []), e]);
  }
  return out;
}

// Checks the shipped pins and, when given, a data folder's local ones
// against `now`, each Volume's list as Astia gives it now; `cached` gives
// the list the data folder keeps, for its Image count.
export async function checkRescans(
  pins: { shipped: Pins['volumes']; local?: LocalPins },
  now: Lists,
  cached?: Lists
): Promise<CheckResult> {
  const all = [
    ...volumeEntries(pins.shipped, 'shipped'),
    ...(pins.local === undefined ? [] : localEntries(pins.local))
  ].filter((e) => e.pin.image !== undefined);
  const checkable = all.filter((e) => e.pin.fileId !== undefined);
  const groups = byVolume(checkable);
  const rescanned: Rescanned[] = [];
  for (const [volumeId, entries] of groups) {
    // eslint-disable-next-line no-await-in-loop -- one Volume at a time
    const files = await now(volumeId);
    const stale = entries.filter((e) => !isCurrent(e.pin, files));
    if (stale.length === 0) continue;
    rescanned.push({
      volumeId,
      title: entries.find((e) => e.title !== null)?.title ?? volumeId,
      // eslint-disable-next-line no-await-in-loop -- as above
      cached: cached === undefined ? null : (await cached(volumeId)).length,
      images: files.length,
      stale: stale.map(({ kind, from, by, pin, what }) => ({
        kind,
        from,
        by,
        image: pin.image!,
        what
      }))
    });
  }
  return {
    volumes: groups.size,
    unchecked: all.length - checkable.length,
    rescanned
  };
}

// The report, a line each: the Volumes re-scanned, each with its stale
// pins, hand ones first.
export function reportLines(result: CheckResult) {
  const head = `${result.volumes} pinned Volumes checked; ${result.rescanned.length} re-scanned.`;
  const unchecked =
    result.unchecked === 0
      ? []
      : [`${result.unchecked} pins on an Image have no file id to check.`];
  const volumes = result.rescanned.flatMap((r) => {
    const count =
      r.cached === null ? `${r.images}` : `${r.cached} → ${r.images}`;
    const stale = r.stale.toSorted((a, b) =>
      a.by === b.by ? a.image - b.image : a.by === 'hand' ? -1 : 1
    );
    return [
      '',
      `${r.title} (${r.volumeId}): ${count} Images`,
      ...stale.map(
        (s) =>
          `  ${s.from} ${s.kind} by ${s.by}, was Image ${s.image}: ${s.what}`
      )
    ];
  });
  return [head, ...unchecked, ...volumes];
}
