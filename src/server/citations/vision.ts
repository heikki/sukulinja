// Vision Match and the page survey as the Scan viewer asks for them: every
// estimate on an Image looked for in one question (ADR-0029), a Volume's
// page survey, and every estimate in a Volume located, its survey first
// where none of its pages are known (ADR-0032). Each says what it took.

import { estimatesByImage } from '@/common/estimates';
import type { BoxAt } from '@/common/operations';
import type {
  Spend,
  VisionPageTry,
  VisionSurvey,
  VisionTook,
  VolumeLocating
} from '@/common/types';

import { Refusal } from '../operations';
import { AstiaError } from './astia/astia';
import type { ImageRef } from './astia/astia';
import type { Citations } from './citations';
import { cachedReader, claudeReader, counting } from './myheritage';
import type { ClaudeReader, openScanFolder, Region, Scan } from './myheritage';

// The vision model `model`, reading the Images `image` gives, with what it
// has spent; it throws a Refusal when it can't be asked.
export type VisionReaders = (
  model: string,
  image: (at: ImageRef, region?: Region | null) => Promise<Scan>
) => Promise<SpendingReader>;

export type SpendingReader = Pick<
  ClaudeReader,
  | 'models'
  | 'versions'
  | 'pageNumbers'
  | 'dates'
  | 'findEntry'
  | 'findEntries'
  | 'spend'
>;

const NO_VISION = 'Vision Match is not set up.';
const NO_KEY = 'Vision Match needs an Anthropic API key. Add one in Settings.';

// Claude reading the scans with the key `key` gives, or the environment's
// credentials when it gives null for the key; refused when it gives null.
export function claudeVision(
  key: () => Promise<{ apiKey: string | null } | null>
): VisionReaders {
  return async (model, image) => {
    const credentials = await key();
    if (credentials === null) throw new Refusal(400, NO_KEY);
    const models = { pages: model, dates: model, entry: model };
    return claudeReader({ models, image, apiKey: credentials.apiKey });
  };
}

// A model or a scan failing is refused, in its own words, for the Scan
// viewer to show; Astia failing is refused as everywhere else.
function failedWith(err: unknown): never {
  if (err instanceof AstiaError || err instanceof Refusal) throw err;
  const words = err instanceof Error ? err.message : String(err);
  throw new Refusal(502, `Vision Match failed: ${words}`);
}

// The search's spend, over every model it asked.
function dollarsOf(spend: Record<string, Spend>) {
  return Object.values(spend).reduce<number | null>(
    (sum, s) => (sum === null || s.dollars === null ? null : sum + s.dollars),
    0
  );
}

// Two searches' costs as one.
function plus(a: VisionTook | null, b: VisionTook): VisionTook {
  if (a === null) return b;
  return {
    model: b.model,
    readings: a.readings + b.readings,
    cached: a.cached + b.cached,
    dollars:
      a.dollars === null || b.dollars === null ? null : a.dollars + b.dollars,
    seconds: a.seconds + b.seconds
  };
}

function tookOf({ model, readings, cached, dollars, seconds }: VisionTook) {
  return { model, readings, cached, dollars, seconds };
}

// Why a step stopped, in the app's words; anything else thrown is a bug.
function refusalOf(err: unknown) {
  if (err instanceof Refusal) return err.message;
  if (err instanceof AstiaError) {
    return "Astia couldn't be reached or gave no answer.";
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  throw err;
}

interface Options {
  // The vision model; none, and it's refused.
  readers: VisionReaders | undefined;
  // The Images it reads, queued so searches don't hammer Astia together.
  image: (at: ImageRef, region?: Region | null) => Promise<Scan>;
  // Where readings are kept, so none is asked twice.
  readings: string;
  // The data folder's Page pins, which a survey saves.
  folder: Pick<ReturnType<typeof openScanFolder>, 'surveyPages'>;
}

export function openVision({ readers, image, readings, folder }: Options) {
  // The model's reader, counting the readings asked and those it made: one
  // may take it two calls.
  async function readerFor(model: string, fresh = false) {
    const reader = await readers!(model, image);
    const made = counting(reader);
    const counted = counting(cachedReader(made.reader, readings, { fresh }));
    const started = performance.now();
    return {
      reader: counted.reader,
      took: (): VisionTook => {
        const asked = counted.asked();
        return {
          model,
          readings: asked,
          cached: asked - made.asked(),
          dollars: dollarsOf(reader.spend()),
          seconds: Math.round((performance.now() - started) / 1000)
        };
      }
    };
  }

  // Looks for the citations' references on the Image `at` in one
  // question (ADR-0029), with what it took.
  async function findAllOnImage(
    citations: Citations,
    asked: { citationIds: number[]; at: BoxAt },
    model: string
  ): Promise<VisionPageTry | { rejected: string }> {
    if (readers === undefined) return { rejected: NO_VISION };
    const { reader, took } = await readerFor(model);
    const found = await citations
      .findAllOnImage(asked.citationIds, asked.at, reader)
      .catch(failedWith);
    return {
      tries: found.map(({ citationId, resolution, missed }) => ({
        links: { citationId, ...resolution },
        missed
      })),
      ...took()
    };
  }

  // Surveys how the Volume numbers its pages (ADR-0032), first where the
  // dataset's estimates there cite, with what it took. Its Page pins are
  // the data folder's, for every dataset. A `fresh` one reads every Image
  // again and replaces the Volume's vision Page pins, to try it.
  async function surveyPages(
    citations: Citations,
    asked: { volumeId: string; volume: string; fresh: boolean },
    model: string
  ): Promise<VisionSurvey | { rejected: string }> {
    if (readers === undefined) return { rejected: NO_VISION };
    const { volumeId, volume, fresh } = asked;
    const rows = (await citations.inVolume(volumeId)) ?? [];
    const cited = rows.flatMap(({ citation, link }) =>
      link.certainty === 'estimated' && citation.citedPage !== null
        ? [citation.citedPage]
        : []
    );
    const { reader, took } = await readerFor(model, fresh);
    const surveyed = await folder
      .surveyPages(volumeId, volume, reader, { cited, replace: fresh })
      .catch(failedWith);
    if ('rejected' in surveyed) return surveyed;
    return { pinned: surveyed.pinned, settled: surveyed.settled, ...took() };
  }

  // Locates every estimate in the Volume, `volume` by its label: its page
  // survey first where none of its pages are read or set (Heikki,
  // 2026-11-16), its estimates then counted anew from it, then each
  // Image's estimates looked for in turn. Says how it goes, and stops
  // where a step is refused.
  async function* locateVolume(
    citations: Citations,
    asked: { volumeId: string; volume: string },
    model: string
  ): AsyncGenerator<VolumeLocating> {
    if (readers === undefined) {
      yield { refused: NO_VISION, took: null };
      return;
    }
    const { volumeId, volume } = asked;
    let took: VisionTook | null = null;
    try {
      const pages = await citations.pagesInVolume(volumeId, volume);
      if (!pages.some((p) => p.by !== null)) {
        yield { surveying: true };
        const surveyed = await surveyPages(
          citations,
          { volumeId, volume, fresh: false },
          model
        );
        if ('rejected' in surveyed) {
          yield { refused: surveyed.rejected, took };
          return;
        }
        took = tookOf(surveyed);
        yield { surveyed };
      }
      const images = estimatesByImage(
        (await citations.inVolume(volumeId)) ?? []
      );
      const estimates = images.flatMap((on) => on.rows).length;
      for (const [i, on] of images.entries()) {
        yield { searching: { nth: i + 1, images: images.length, estimates } };
        const citationIds = on.rows.map((r) => r.citation.id);
        const at = { volumeId, image: on.image };
        // eslint-disable-next-line no-await-in-loop -- one Image after another
        const found = await findAllOnImage(
          citations,
          { citationIds, at },
          model
        );
        if ('rejected' in found) {
          yield { refused: found.rejected, took };
          return;
        }
        took = plus(took, found);
        yield { tried: found.tries };
      }
    } catch (err) {
      yield { refused: refusalOf(err), took };
      return;
    }
    yield { done: took };
  }

  return { findAllOnImage, surveyPages, locateVolume };
}

export type Vision = ReturnType<typeof openVision>;
