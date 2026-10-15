import type { Scan, ScanMethod } from '@common/types';

// How the reference's link to an Image was found, said of the link.
export const LINK_LABELS: Record<ScanMethod, string> = {
  placed: 'Placed link',
  anchored: 'Anchored link',
  estimated: 'Estimated link',
  volume: 'Volume only'
};

// Image numbers run 1..count; before the count is known, only from 1.
export function clampImage(n: number, count: number | null) {
  const high = count ?? Infinity;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, high));
}

// Served by the app, which caches it; `retry` makes a failed load ask again.
export function imageUrl(volumeId: string, n: number, retry: number) {
  const url = `/astia/volumes/${volumeId}/images/${n}`;
  return retry === 0 ? url : `${url}?retry=${retry}`;
}

export interface Shown {
  volumeId: string;
  image: number;
}

export const MARK_HINTS: Record<'anchor' | 'placement', string> = {
  anchor: 'Also moves nearby references in this Volume',
  placement: 'Places only this record'
};

// What marking the shown Image would do: nothing when it is already the
// link, found by hand or from Anchors; an Anchor when the reference names a
// page in a Volume it links by its Book; otherwise a Placement. Unknown until
// the Volumes it links arrive.
export function markOffer(
  link: Scan,
  shown: Shown,
  hasPage: boolean,
  linked: ReadonlySet<string> | null
) {
  const sure = link.method === 'placed' || link.method === 'anchored';
  const here = link.volumeId === shown.volumeId && link.image === shown.image;
  if (sure && here) return 'linked';
  if (linked === null) return 'unknown';
  return hasPage && linked.has(shown.volumeId) ? 'anchor' : 'placement';
}
