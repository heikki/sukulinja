import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { ClaudeModel } from '@/common/assistant-choices';
import type { VisionTry, VolumeCitation } from '@/common/types';

import type { Readable } from './selected';

// Where a batch searches: an Image of a Volume.
export interface ImageAt {
  volumeId: string;
  image: number;
}

// A Vision Match of every estimate on an Image, one after another
// (ADR-0029): how far it has got, then each one's try and the first
// refusal, which stops it.
export type VisionBatch =
  | { searching: ClaudeModel; since: number; done: number; of: number }
  | {
      tries: Array<{ row: VolumeCitation; tried: VisionTry }>;
      of: number;
      refused: string | null;
      seconds: number;
    };

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

// Runs a batch with `find` over the estimates on the Image shown, saying
// how it goes; `settled` is told once it's done, for the citations to
// reload. What it says is kept for its Image while that's shown, until
// `forget`.
export function visionBatching(
  { volume, image, citations }: Shown,
  find: (citationId: number, model: ClaudeModel) => Promise<VisionTry>,
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
    const since = Date.now();
    const of = rows.length;
    const tries: Array<{ row: VolumeCitation; tried: VisionTry }> = [];
    let refused: string | null = null;
    for (const row of rows) {
      kept.set({
        at,
        status: { searching: model, since, done: tries.length, of }
      });
      try {
        // eslint-disable-next-line no-await-in-loop -- one at a time, as Astia is paced
        tries.push({ row, tried: await find(row.citation.id, model) });
      } catch (err) {
        if (!(err instanceof ApiError)) {
          kept.set(null);
          throw err;
        }
        refused = err.message;
        break;
      }
    }
    const seconds = Math.round((Date.now() - since) / 1000);
    kept.set({ at, status: { tries, of, refused, seconds } });
    await settled();
  }

  function forget() {
    if (!searching()) kept.set(null);
  }

  return {
    status: status as Readable<VisionBatch | null>,
    estimates: estimates as Readable<VolumeCitation[]>,
    run,
    forget,
    searching
  };
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
