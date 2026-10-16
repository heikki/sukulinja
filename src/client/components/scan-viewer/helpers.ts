import type { BookKind, CitationVolume, Scan, ScanMethod } from '@common/types';

// How the reference's link to an Image was found, said of the link.
export const LINK_LABELS: Record<ScanMethod, string> = {
  placed: 'Placed link',
  anchored: 'Anchored link',
  estimated: 'Estimated link',
  volume: 'Volume only'
};

// A Placed link the vision model matched rather than a person.
export function linkLabel(link: Scan) {
  return link.method === 'placed' && link.by === 'vision'
    ? 'Vision match'
    : LINK_LABELS[link.method];
}

// A JSON answer; a failed one throws.
export async function getJson<T>(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

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

// Astia's 250px thumbnail of an Image.
export function thumbUrl(volumeId: string, n: number) {
  return `/astia/volumes/${volumeId}/images/${n}?size=thumb`;
}

// The Images beside `n` that exist, the one ahead of `step` first.
export function neighbours(n: number, count: number | null, step: 1 | -1) {
  const beside = [n + step, n - step];
  return beside.filter((i) => i >= 1 && (count === null || i <= count));
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
  link: Scan | null,
  shown: Shown,
  hasPage: boolean,
  volumes: CitationVolume[] | null
) {
  if (link !== null && isSure(link, shown)) return 'linked';
  if (volumes === null) return 'unknown';
  const linked = volumes.some(
    (v) => v.id === shown.volumeId && v.image !== null
  );
  return hasPage && linked ? 'anchor' : 'placement';
}

// The shown Image is the link, found by hand or from Anchors.
function isSure(link: Scan, shown: Shown) {
  const here = link.volumeId === shown.volumeId && link.image === shown.image;
  return here && (link.method === 'placed' || link.method === 'anchored');
}

const KINDS: Array<{ kind: BookKind | null; label: string }> = [
  { kind: 'rippi', label: 'Communion books' },
  { kind: 'lasten', label: "Children's books" },
  { kind: 'kastetut', label: 'Baptisms' },
  { kind: 'vihityt', label: 'Marriages' },
  { kind: null, label: 'Other' }
];

export interface VolumeGroup {
  label: string;
  volumes: CitationVolume[];
}

function firstYear(v: CitationVolume) {
  return v.years?.from ?? Infinity;
}

function byYears(a: CitationVolume, b: CitationVolume) {
  const from = { a: firstYear(a), b: firstYear(b) };
  if (from.a === from.b) return a.label.localeCompare(b.label);
  return from.a < from.b ? -1 : 1;
}

// The switcher's list: the Volumes the reference links first, then the rest
// by Book kind, each group in order of years.
export function groupVolumes(volumes: CitationVolume[]) {
  const linked = volumes.filter((v) => v.image !== null);
  const rest = volumes.filter((v) => v.image === null);
  const groups: VolumeGroup[] = [
    { label: 'Linked by this reference', volumes: linked },
    ...KINDS.map(({ kind, label }) => ({
      label,
      volumes: rest.filter((v) => v.kind === kind)
    }))
  ];
  return groups
    .map((g) => ({ ...g, volumes: [...g.volumes].sort(byYears) }))
    .filter((g) => g.volumes.length > 0);
}
