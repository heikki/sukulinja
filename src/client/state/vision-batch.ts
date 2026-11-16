import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { ClaudeModel } from '@/common/assistant-choices';
import { estimatesByImage, estimatesOn } from '@/common/estimates';
import type {
  CitationLinks,
  VisionPageTry,
  VisionSurvey,
  VisionTook,
  VisionTry,
  VolumeCitation,
  VolumeLocating
} from '@/common/types';

import type { Readable } from './selected';

// Where a batch searches: an Image of a Volume.
export interface ImageAt {
  volumeId: string;
  image: number;
}

// What a search took.
export type Took = VisionTook;

// Vision Match of every estimate on an Image (ADR-0029), in one question
// for the Image and one for each Image around it while some aren't found,
// or of every estimate in a Volume (ADR-0032): its page survey first, then
// each Image's. How long it has been at it and at what, then each one's
// try and what it took, or the refusal; of a Volume, what its survey
// read. A survey runs alone too, to try it.
export type VisionBatch =
  | { searching: ClaudeModel; since: number; of: number; step: string | null }
  | {
      scope: 'image' | 'volume' | 'survey';
      tries: Array<{ row: VolumeCitation; tried: VisionTry }>;
      of: number;
      refused: string | null;
      took: Took | null;
      survey: Surveyed | null;
    };

// What a page survey read: on how many Images, whether they all agree,
// and whether every reading was kept from before, none read now.
export type Surveyed = Pick<VisionSurvey, 'pinned' | 'settled'> & {
  readBefore: boolean;
};

function surveyedOf({ pinned, settled, readings, cached }: VisionSurvey) {
  return { pinned, settled, readBefore: readings > 0 && cached === readings };
}

// What a page survey took.
function tookOf({ model, readings, cached, dollars, seconds }: VisionSurvey) {
  return { model, readings, cached, dollars, seconds };
}

// What a batch asks of the server.
export interface BatchAsks {
  findAllOnImage: (
    citationIds: number[],
    at: ImageAt,
    model: ClaudeModel
  ) => Promise<VisionPageTry>;
  surveyPages: (
    volumeId: string,
    volume: string,
    model: ClaudeModel,
    fresh: boolean
  ) => Promise<VisionSurvey>;
  locateVolume: (
    volumeId: string,
    volume: string,
    model: ClaudeModel
  ) => AsyncIterable<VolumeLocating>;
  discard: (citationId: number, at: ImageAt) => Promise<CitationLinks>;
}

// The tries an Image's search gave, by the rows asked.
function triesOf(rows: VolumeCitation[], tries: VisionTry[]) {
  const byId = new Map(tries.map((t) => [t.links.citationId, t]));
  return rows.flatMap((row) => {
    const tried = byId.get(row.citation.id);
    return tried === undefined ? [] : [{ row, tried }];
  });
}

// An Image's, or a whole Volume's (image null).
interface Scope {
  volumeId: string;
  image: number | null;
}

// What the Scan viewer shows that a batch reads.
interface Shown {
  volume: Readable<{ id: string; label: string } | null>;
  image: Readable<number>;
  citations: Readable<VolumeCitation[] | null | 'failed'>;
}

// Runs Vision Match over the estimates on the Image shown, or in its
// Volume, saying how it goes; `settled` is told once it's done, and after
// a Volume's survey, for the citations to reload. What it says is kept
// for its Image, or Volume, while that's shown, until `forget`.
export function visionBatching(
  { volume, image, citations }: Shown,
  { findAllOnImage, surveyPages, locateVolume, discard }: BatchAsks,
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
  const kept = signal<{ at: Scope; status: VisionBatch } | null>(null);
  const status = computed(() => {
    const k = kept.get();
    const here = shown.get();
    return k !== null &&
      here !== null &&
      k.at.volumeId === here.volumeId &&
      (k.at.image === null || k.at.image === here.image)
      ? k.status
      : null;
  });
  const inVolume = computed(() => {
    const rows = citations.get();
    return Array.isArray(rows) ? estimatesByImage(rows) : [];
  });

  // The refusal a failed ask gives, in the app's words; anything else
  // thrown is a bug, and is thrown on once the batch is let go.
  function refusalOf(err: unknown) {
    if (err instanceof ApiError) return err.message;
    kept.set(null);
    throw err instanceof Error ? err : new Error(String(err));
  }

  function searching() {
    const k = kept.get();
    return k !== null && 'searching' in k.status;
  }

  async function run(model: ClaudeModel) {
    const at = shown.get();
    const rows = estimates.get();
    if (at === null || rows.length === 0 || searching()) return;
    const of = rows.length;
    const since = Date.now();
    kept.set({ at, status: { searching: model, since, of, step: null } });
    const ids = rows.map((r) => r.citation.id);
    const status = await findAllOnImage(ids, at, model)
      .then(({ tries, ...took }): VisionBatch => ({
        scope: 'image',
        tries: triesOf(rows, tries),
        of,
        refused: null,
        took,
        survey: null
      }))
      .catch((err: unknown): VisionBatch => ({
        scope: 'image',
        tries: [],
        of,
        refused: refusalOf(err),
        took: null,
        survey: null
      }));
    kept.set({ at, status });
    await settled();
  }

  // Every estimate in the Volume shown, located on the server (ADR-0032):
  // its page survey where none of its pages are known yet, then each
  // Image's estimates in turn. The citations are reloaded after the
  // survey, and once it's done, for its tries to be told by them.
  async function runVolume(model: ClaudeModel) {
    const v = volume.get();
    if (v === null || searching()) return;
    const at: Scope = { volumeId: v.id, image: null };
    const since = Date.now();
    function step(text: string, of: number) {
      kept.set({ at, status: { searching: model, since, of, step: text } });
    }
    let of = inVolume.get().flatMap((on) => on.rows).length;
    step('reading page numbers', of);
    let took: Took | null = null;
    let surveyed: Surveyed | null = null;
    const tried: VisionTry[] = [];
    let refused: string | null = null;
    async function told(line: VolumeLocating) {
      if ('surveyed' in line) {
        surveyed = surveyedOf(line.surveyed);
        await settled();
      } else if ('searching' in line) {
        const { nth, images, estimates } = line.searching;
        of = estimates;
        step(`Image ${nth} of ${images}`, of);
      } else if ('tried' in line) {
        tried.push(...line.tried);
      } else if ('done' in line) {
        took = line.done;
      } else if ('refused' in line) {
        ({ refused, took } = line);
      }
    }
    try {
      for await (const line of locateVolume(v.id, v.label, model)) {
        await told(line);
      }
    } catch (err) {
      refused = refusalOf(err);
    }
    await settled();
    const rows = citations.get();
    const tries = triesOf(Array.isArray(rows) ? rows : [], tried);
    kept.set({
      at,
      status: { scope: 'volume', tries, of, refused, took, survey: surveyed }
    });
  }

  // The Volume shown's page survey alone, to try it (ADR-0032): read
  // anew each time.
  async function runSurvey(model: ClaudeModel) {
    const v = volume.get();
    if (v === null || searching()) return;
    const at: Scope = { volumeId: v.id, image: null };
    const since = Date.now();
    const step = 'reading page numbers';
    kept.set({ at, status: { searching: model, since, of: 0, step } });
    const done = { scope: 'survey' as const, tries: [], of: 0 };
    const status = await surveyPages(v.id, v.label, model, true)
      .then((survey): VisionBatch => ({
        ...done,
        refused: null,
        took: tookOf(survey),
        survey: surveyedOf(survey)
      }))
      .catch((err: unknown): VisionBatch => ({
        ...done,
        refused: refusalOf(err),
        took: null,
        survey: null
      }));
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
    inVolume: inVolume as Readable<
      Array<{ image: number; rows: VolumeCitation[] }>
    >,
    run,
    runVolume,
    runSurvey,
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

// What a batch didn't find, with why, by the Image each was estimated on.
export function missedOf(
  tries: Array<{ row: VolumeCitation; tried: VisionTry }>
) {
  return tries
    .flatMap(({ row, tried }) =>
      tried.missed === null ? [] : [{ row, why: tried.missed }]
    )
    .toSorted((a, b) => imageOf(a.row) - imageOf(b.row));
}

function imageOf(row: VolumeCitation) {
  return row.link.precision === 'volume' ? 0 : row.link.image;
}
