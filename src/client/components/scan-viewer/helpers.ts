import { ApiError } from '@client/dataset-api';
import type { CitationLinks, Link } from '@common/types';

// One request at a time: asking again aborts the last one.
export class Latest {
  private abort: AbortController | null = null;

  // The answer; null when it failed, undefined when a later ask took over.
  async run<T>(ask: (signal: AbortSignal) => Promise<T>) {
    this.stop();
    const abort = new AbortController();
    this.abort = abort;
    try {
      return await ask(abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return undefined;
      if (err instanceof ApiError) return null;
      throw err;
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

// The Images beside `n` that exist, the one ahead of `step` first.
export function neighbours(n: number, count: number | null, step: 1 | -1) {
  const beside = [n + step, n - step];
  return beside.filter((i) => i >= 1 && (count === null || i <= count));
}

// A Mark saved: the reference's Links resolved again, and the one in the
// marked Volume for the viewer to follow.
export interface ScanMarked {
  resolved: CitationLinks;
  link: Link | null;
}

export type ScanMarkedEvent = CustomEvent<ScanMarked>;

// What a saved Mark reports: the resolved Links, and the one in the Volume
// marked.
export function markedIn(resolved: CitationLinks, volumeId: string) {
  const links = 'links' in resolved ? resolved.links : [];
  return {
    resolved,
    link: links.find((l) => l.volumeId === volumeId) ?? null
  };
}
