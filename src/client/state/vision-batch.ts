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

// What a search took, one's or a batch's.
export type Took = Pick<
  VisionTry,
  'model' | 'readings' | 'cached' | 'dollars' | 'seconds'
>;

// Each try a batch made, summed as one.
export function batchTook(tries: Took[], model: string, seconds: number): Took {
  return {
    model,
    readings: tries.reduce((n, t) => n + t.readings, 0),
    cached: tries.reduce((n, t) => n + t.cached, 0),
    dollars: tries.reduce<number | null>(
      (sum, t) => (sum === null || t.dollars === null ? null : sum + t.dollars),
      0
    ),
    seconds
  };
}

// A Vision Match of every estimate on an Image (ADR-0029), one after
// another or all at once in one question: how far it has got, then each
// one's try, what they took, and the first refusal, which stops it.
export type VisionBatch =
  | {
      searching: ClaudeModel;
      since: number;
      done: number;
      of: number;
      atOnce: boolean;
    }
  | {
      tries: Array<{ row: VolumeCitation; tried: Tried }>;
      of: number;
      refused: string | null;
      took: Took;
      atOnce: boolean;
    };

// One reference's try: its Links, and why it found none.
export type Tried = Pick<VisionTry, 'links' | 'missed'>;

// What a batch asks of the server.
export interface BatchAsks {
  findByVision: (citationId: number, model: ClaudeModel) => Promise<VisionTry>;
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

// Runs a batch with `find` over the estimates on the Image shown, saying
// how it goes; `settled` is told once it's done, for the citations to
// reload. What it says is kept for its Image while that's shown, until
// `forget`.
export function visionBatching(
  { volume, image, citations }: Shown,
  { findByVision: find, findAllOnImage, discard }: BatchAsks,
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

  // A refusal told, or anything else thrown on.
  function refusalOf(err: unknown) {
    if (err instanceof ApiError) return err.message;
    kept.set(null);
    throw err instanceof Error ? err : new Error(String(err));
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
        status: {
          searching: model,
          since,
          done: tries.length,
          of,
          atOnce: false
        }
      });
      try {
        // eslint-disable-next-line no-await-in-loop -- one at a time, as Astia is paced
        tries.push({ row, tried: await find(row.citation.id, model) });
      } catch (err) {
        refused = refusalOf(err);
        break;
      }
    }
    const seconds = Math.round((Date.now() - since) / 1000);
    const took = batchTook(
      tries.map((t) => t.tried),
      model,
      seconds
    );
    kept.set({ at, status: { tries, of, refused, took, atOnce: false } });
    await settled();
  }

  async function allAtOnce(
    rows: VolumeCitation[],
    at: ImageAt,
    model: ClaudeModel
  ): Promise<VisionBatch> {
    const ids = rows.map((r) => r.citation.id);
    const { tries, ...took } = await findAllOnImage(ids, at, model);
    const byId = new Map(tries.map((t) => [t.links.citationId, t]));
    return {
      tries: rows.flatMap((row) => {
        const tried = byId.get(row.citation.id);
        return tried === undefined ? [] : [{ row, tried }];
      }),
      ...{ of: rows.length, refused: null, took, atOnce: true }
    };
  }

  // Every estimate in one question, on this Image alone.
  async function runAtOnce(model: ClaudeModel) {
    const at = shown.get();
    const rows = estimates.get();
    if (at === null || rows.length === 0 || searching()) return;
    const since = Date.now();
    const of = rows.length;
    kept.set({
      at,
      status: { searching: model, since, done: 0, of, atOnce: true }
    });
    const status = await allAtOnce(rows, at, model).catch(
      (err: unknown): VisionBatch => {
        const seconds = Math.round((Date.now() - since) / 1000);
        const took = batchTook([], model, seconds);
        const refused = refusalOf(err);
        return { tries: [], of, refused, took, atOnce: true };
      }
    );
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
    runAtOnce,
    undo,
    forget,
    searching
  };
}

// Where a try's Match is, or null for none.
export function matchAt(tried: Tried): ImageAt | null {
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
