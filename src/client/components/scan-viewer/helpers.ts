import { apiUrl } from '@client/api';
import type {
  BookKind,
  CitationScans,
  CitationVolume,
  Scan
} from '@common/types';

import { methodLabel } from './citations';

// How the reference's link to an Image was found, said of the link.
export function linkLabel(link: Scan) {
  const label = methodLabel(link.method, link.by);
  const own = link.method === 'volume' || link.by === 'vision';
  return own ? label : `${label} link`;
}

// One JSON request at a time: asking again aborts the last one.
export class Latest {
  private abort: AbortController | null = null;

  // The answer; null when it failed, undefined when a later ask took over.
  async get<T>(url: string) {
    this.stop();
    const abort = new AbortController();
    this.abort = abort;
    try {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    } catch {
      return abort.signal.aborted ? undefined : null;
    }
  }

  stop() {
    this.abort?.abort();
  }
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
// link; an Anchor when the reference names a
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

// The shown Image is the link, placed or counted from Anchors; a vision
// match there is confirmed from the people beside the scan.
function isSure(link: Scan, shown: Shown) {
  const here = link.volumeId === shown.volumeId && link.image === shown.image;
  return here && (link.method === 'placed' || link.method === 'anchored');
}

export function isVerified(link: Pick<Scan, 'method' | 'by'>) {
  return link.method === 'placed' && link.by !== 'vision';
}

// Saves by hand where a citation's record is: the reference's scans
// resolved again, or why they couldn't be saved.
export async function saveMark(
  citationId: number,
  target: Shown
): Promise<{ resolved: CitationScans } | { error: string }> {
  try {
    const res = await fetch(apiUrl(`/api/citations/${citationId}/scans`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(target)
    });
    if (!res.ok) return { error: await res.text() };
    return { resolved: (await res.json()) as CitationScans };
  } catch {
    return { error: 'The app is not responding.' };
  }
}

// What a saved mark reports: the resolved scans, and the link in the
// Volume marked.
export function markedIn(resolved: CitationScans, volumeId: string) {
  const scans = 'scans' in resolved ? resolved.scans : [];
  return {
    resolved,
    link: scans.find((s) => s.volumeId === volumeId) ?? null
  };
}

const KINDS: Array<{ kind: BookKind | null; label: string }> = [
  { kind: 'rippi', label: 'Pää- ja rippikirjat' },
  { kind: 'lasten', label: 'Lastenkirjat' },
  { kind: 'kastetut', label: 'Syntyneiden ja kastettujen luettelot' },
  { kind: 'vihityt', label: 'Vihittyjen luettelot' },
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
