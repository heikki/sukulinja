import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { ClaudeModel } from '@/common/assistant-choices';
import type {
  CitationLinks,
  VisionPageTry,
  VisionTry,
  VolumeCitation
} from '@/common/types';

import type { Readable } from './selected';

// Where a batch searches: an Image of a Volume.
export interface ImageAt {
  volumeId: string;
  image: number;
}

// What a search took.
export type Took = Omit<VisionPageTry, 'tries'>;

// Vision Match of every estimate on an Image (ADR-0029), in one question
// for the Image and one for each Image around it while some aren't found:
// how long it has been at it, then each one's try and what it took, or
// the refusal.
export type VisionBatch =
  | { searching: ClaudeModel; since: number; of: number }
  | {
      tries: Array<{ row: VolumeCitation; tried: VisionTry }>;
      of: number;
      refused: string | null;
      took: Took | null;
    };

// What a batch asks of the server.
export interface BatchAsks {
  findAllOnImage: (
    citationIds: number[],
    at: ImageAt,
    model: ClaudeModel
  ) => Promise<VisionPageTry>;
  discard: (citationId: number, at: ImageAt) => Promise<CitationLinks>;
}

// The rows on the Image whose Link is an estimate there, one per record:
// a Match saved for one is saved for everyone citing it.
export function estimatesOn(rows: VolumeCitation[], image: number) {
  const byRecord = new Map<string, VolumeCitation>();
  for (const row of rows) {
    const { link } = row;
    if (link.certainty !== 'estimated' || link.precision !== 'image') continue;
    if (link.image !== image) continue;
    const key = row.citation.markKey;
    if (!byRecord.has(key)) byRecord.set(key, row);
  }
  return [...byRecord.values()];
}

// What the Scan viewer shows that a batch reads.
interface Shown {
  volume: Readable<{ id: string } | null>;
  image: Readable<number>;
  citations: Readable<VolumeCitation[] | null | 'failed'>;
}

// Runs Vision Match over the estimates on the Image shown, saying
// how it goes; `settled` is told once it's done, for the citations to
// reload. What it says is kept for its Image while that's shown, until
// `forget`.
export function visionBatching(
  { volume, image, citations }: Shown,
  { findAllOnImage, discard }: BatchAsks,
  settled: () => Promise<void>
) {
  const shown = computed(() => {
    const v = volume.get();
    return v === null ? null : { volumeId: v.id, image: image.get() };
  });
  const estimates = computed(() => {
    const rows = citations.get();
    return Array.isArray(rows) ? estimatesOn(rows, image.get()) : [];
  });
  const kept = signal<{ at: ImageAt; status: VisionBatch } | null>(null);
  const status = computed(() => {
    const k = kept.get();
    const here = shown.get();
    return k !== null &&
      here !== null &&
      k.at.volumeId === here.volumeId &&
      k.at.image === here.image
      ? k.status
      : null;
  });

  function searching() {
    const k = kept.get();
    return k !== null && 'searching' in k.status;
  }

  async function run(model: ClaudeModel) {
    const at = shown.get();
    const rows = estimates.get();
    if (at === null || rows.length === 0 || searching()) return;
    const of = rows.length;
    kept.set({ at, status: { searching: model, since: Date.now(), of } });
    const ids = rows.map((r) => r.citation.id);
    const status = await findAllOnImage(ids, at, model)
      .then(({ tries, ...took }): VisionBatch => {
        const byId = new Map(tries.map((t) => [t.links.citationId, t]));
        const found = rows.flatMap((row) => {
          const tried = byId.get(row.citation.id);
          return tried === undefined ? [] : [{ row, tried }];
        });
        return { tries: found, of, refused: null, took };
      })
      .catch((err: unknown): VisionBatch => {
        if (!(err instanceof ApiError)) {
          kept.set(null);
          throw err instanceof Error ? err : new Error(String(err));
        }
        return { tries: [], of, refused: err.message, took: null };
      });
    kept.set({ at, status });
    await settled();
  }

  // Takes back every Match the batch shown found, as a Discard of each
  // does, and closes it.
  async function undo() {
    const k = kept.get();
    if (k === null || 'searching' in k.status) return;
    const matches = k.status.tries.flatMap(({ tried }) => {
      const at = matchAt(tried);
      return at === null ? [] : [{ citationId: tried.links.citationId, at }];
    });
    kept.set(null);
    try {
      for (const { citationId, at } of matches) {
        // eslint-disable-next-line no-await-in-loop -- one Discard after another
        await discard(citationId, at);
      }
    } finally {
      await settled();
    }
  }

  function forget() {
    if (!searching()) kept.set(null);
  }

  return {
    status: status as Readable<VisionBatch | null>,
    estimates: estimates as Readable<VolumeCitation[]>,
    run,
    undo,
    forget,
    searching
  };
}

// Where a try's Match is, or null for none.
export function matchAt(tried: VisionTry): ImageAt | null {
  if (tried.missed !== null || !('links' in tried.links)) return null;
  const match = tried.links.links.find((l) => l.certainty === 'match');
  return match === undefined || match.precision === 'volume'
    ? null
    : { volumeId: match.volumeId, image: match.image };
}

// The records a finished batch found, by their markKey, for their Boxes to
// show while it's told.
export function foundKeys(batch: VisionBatch | null) {
  if (batch === null || 'searching' in batch) return new Set<string>();
  return new Set(
    batch.tries
      .filter((t) => t.tried.missed === null)
      .map((t) => t.row.citation.markKey)
  );
}
