import { apiUrl } from '@client/api';
import type { CitationScans, Scan } from '@common/types';

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

// A mark saved: the reference's links resolved again, and the one in the
// marked Volume for the viewer to follow.
export interface ScanMarked {
  resolved: CitationScans;
  link: Scan | null;
}

export type ScanMarkedEvent = CustomEvent<ScanMarked>;

// What a saved mark reports: the resolved scans, and the link in the
// Volume marked.
export function markedIn(resolved: CitationScans, volumeId: string) {
  const scans = 'scans' in resolved ? resolved.scans : [];
  return {
    resolved,
    link: scans.find((s) => s.volumeId === volumeId) ?? null
  };
}
