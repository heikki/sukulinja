import { computed, signal } from '@lit-labs/signals';

import type { CitationRow, Link, UnlinkedResolution } from '@/common/types';

import type { Readable } from './selected';
import type { Source, SourceGroup } from './sources';

// A church-book source opened in the Scan viewer, on one Link of its
// reference, or with none, to look through its parish's Volumes for it:
// `unlinked` says why it has none.
export type LinkOpen =
  | { citation: CitationRow; link: Link }
  | { citation: CitationRow; link: null; unlinked: UnlinkedResolution };

// An Image of a Volume opened in the Scan viewer with no source, as an
// Image's Reminder opens it.
export interface ImageOpen {
  volumeId: string;
  volume: string;
  image: number;
}

// What opening the source in the Scan viewer opens: its Link, or failing
// one its parish's Volumes to look through; null when it has neither.
export function viewerOpening({ citation, status }: Source): LinkOpen | null {
  const link = status?.link ?? null;
  if (link !== null) return { citation, link };
  const unlinked = status?.browse ?? null;
  return unlinked === null ? null : { citation, link: null, unlinked };
}

// The source before or after the Citation with a Link, in the panel's
// order; null at either end, or if it isn't listed.
export function linkedBeside(
  groups: SourceGroup[],
  citationId: number,
  by: 1 | -1
): LinkOpen | null {
  const linked = groups.flatMap((g) =>
    g.sources.flatMap(({ citation, status }) => {
      const link = status?.link ?? null;
      return link === null ? [] : [{ citation, link }];
    })
  );
  const at = linked.findIndex((l) => l.citation.id === citationId);
  return (at < 0 ? undefined : linked[at + by]) ?? null;
}

// The open Sources is to be brought to: the source shown, unless it was
// opened quietly or the viewer has moved off its Link. Each open is a new
// object, so opening the same source again brings Sources to it again.
export function revealingOf(
  source: Readable<LinkOpen | null>,
  away: Readable<boolean>
) {
  // The open made with `reveal: false`, if it's the one shown.
  const quiet = signal<LinkOpen | null>(null);
  const revealing = computed(() => {
    const shown = source.get();
    if (shown === null || away.get() || shown === quiet.get()) return null;
    return shown;
  });
  return {
    revealing,
    // Told of each open, as it's shown.
    opened(at: LinkOpen, reveal: boolean) {
      quiet.set(reveal ? null : at);
    }
  };
}
