import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { ClaudeModel } from '@/common/assistant-choices';
import type { Link, VisionTry } from '@/common/types';

import type { Readable } from './selected';
import type { LinkOpen } from './source-open';

// Vision Match of the source's reference (ADR-0029): searching, with the
// model and since when; what it did and took; or refused in the server's
// words.
export type VisionMatch =
  | { searching: ClaudeModel; since: number }
  | { tried: VisionTry }
  | { refused: string };

// Whether the source's reference can be searched for: one with an
// estimate, not yet placed at its entry.
export function canFindByVision(source: LinkOpen | null) {
  return source?.link?.certainty === 'estimated';
}

// The Match the search saved, among the reference's Links.
function matchOf(tried: VisionTry): Link | null {
  if (tried.missed !== null || !('links' in tried.links)) return null;
  return tried.links.links.find((l) => l.certainty === 'match') ?? null;
}

// Runs a Vision Match with `find` for the source, as its menu asks, and
// says how it's going; on a Match, `follow` goes to it. What it says is
// kept for that source until `forget`, or another search.
export function visionMatching(
  source: Readable<LinkOpen | null>,
  find: (citationId: number, model: ClaudeModel) => Promise<VisionTry>,
  follow: (shown: LinkOpen, link: Link) => void
) {
  const kept = signal<{ citationId: number; status: VisionMatch } | null>(null);
  const status = computed(() => {
    const k = kept.get();
    return k !== null && k.citationId === source.get()?.citation.id
      ? k.status
      : null;
  });

  async function run(model: ClaudeModel) {
    const shown = source.get();
    if (shown === null || !canFindByVision(shown)) return;
    if (status.get() !== null && 'searching' in status.get()!) return;
    const citationId = shown.citation.id;
    kept.set({ citationId, status: { searching: model, since: Date.now() } });
    try {
      const tried = await find(citationId, model);
      kept.set({ citationId, status: { tried } });
      const link = matchOf(tried);
      if (link !== null && source.get()?.citation.id === citationId) {
        follow(source.get()!, link);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) {
        kept.set(null);
        throw err;
      }
      kept.set({ citationId, status: { refused: err.message } });
    }
  }

  function forget() {
    const s = status.get();
    if (s !== null && !('searching' in s)) kept.set(null);
  }

  return { status: status as Readable<VisionMatch | null>, run, forget };
}
