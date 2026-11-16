// The Citations context, as the rest of the app reaches it: nothing
// outside this folder imports any other file in it (tests use testing.ts;
// the tools in scripts/ reach inside).

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import type { BoxAt } from '@/common/operations';
import type { Spend, VisionPageTry, VisionSurvey } from '@/common/types';

import type { NewChange } from '../changes/changes';
import { Refusal } from '../operations';
import { routeShared } from './astia-routes';
import { AstiaError, openAstia } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { openDownloads } from './astia/downloads';
import { openParishes } from './astia/parishes';
import type { Parishes } from './astia/parishes';
import { imageSize, openScanCache } from './astia/scan-cache';
import { createCitations } from './citations';
import { openImages } from './images';
import {
  cachedReader,
  claudeReader,
  counting,
  openScanFolder,
  pacedImages,
  switchFilming
} from './myheritage';
import type { ClaudeReader, Scan } from './myheritage';
import { citationOperations } from './operations';
import { sharedOperations } from './shared-operations';

export type { Astia } from './astia/astia';
export { annotated, openAnnotations } from './annotations';
export type { Annotation, Annotations, CitationLink } from './annotations';
export { PUBLISHER as ASTIA_PUBLISHER } from './app-citations';
export { CITATIONS_READ, dropUncitedEntries, gatherEntries } from './entries';
export { viewerUrl } from './astia/astia';
export { leaveFamilySupport, openSupport } from './support';
export { BAPTISM_COLLECTION, collectionOf } from './myheritage';

interface Options {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // The parishes whose church books are found; by default the data
  // folder's.
  parishes?: Parishes;
  // The datasets whose Marks a re-scan of a Volume has to keep.
  datasets: () => Promise<Database[]>;
  // Told of each change made to a dataset through its Citations.
  changed?: (db: Database, change: NewChange) => void;
  // Whether each dataset, once opened, asks Astia in the background for
  // what its references resolve against (the app's; not tests').
  warmUp?: boolean;
  // The vision model the Scan viewer's Vision Match asks; none, and it's
  // refused.
  vision?: VisionReaders;
}

// The vision model `model`, reading the Images `image` gives, with what it
// has spent; it throws a Refusal when it can't be asked.
export type VisionReaders = (
  model: string,
  image: (at: ImageRef) => Promise<Scan>
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

function callsOf(spend: Record<string, Spend>) {
  return Object.values(spend).reduce((sum, s) => sum + s.calls, 0);
}

// The Citations of the data folder at `root`, for every dataset in it.
export function openCitations(root: string, options: Options) {
  const astia = options.astia ?? openAstia(join(root, '.astia-cache'));
  const cache = openScanCache({ astia, root, switches: false });
  const downloads = openDownloads({ astia, cache });
  // The Scan viewer has just shown the Image a Box is drawn on.
  async function sizeOf(at: ImageRef) {
    return await imageSize(cache, at);
  }
  const parishes = options.parishes ?? openParishes(root);
  const images = openImages({ astia, parishes, sizeOf });
  const folder = openScanFolder(root, { astia, parishes });
  // One queue for every search, so they don't hammer Astia together.
  const visionImage = pacedImages(cache);
  // Readings are kept where the scripts keep theirs, so neither asks twice.
  const readings = join(root, '.vision-readings');

  // Looks for the citations' references on the Image `at` in one
  // question (ADR-0029), with what it took.
  async function findAllOnImage(
    citations: ReturnType<typeof createCitations>,
    asked: { citationIds: number[]; at: BoxAt },
    model: string
  ): Promise<VisionPageTry | { rejected: string }> {
    if (options.vision === undefined) return { rejected: NO_VISION };
    const started = performance.now();
    const reader = await options.vision(model, visionImage);
    const counted = counting(cachedReader(reader, readings));
    const found = await citations
      .findAllOnImage(asked.citationIds, asked.at, counted.reader)
      .catch(failedWith);
    const spend = reader.spend();
    const readingsAsked = counted.asked();
    return {
      tries: found.map(({ citationId, resolution, missed }) => ({
        links: { citationId, ...resolution },
        missed
      })),
      model,
      readings: readingsAsked,
      cached: readingsAsked - callsOf(spend),
      dollars: dollarsOf(spend),
      seconds: Math.round((performance.now() - started) / 1000)
    };
  }

  // Surveys how the Volume numbers its pages (ADR-0032), first where the
  // dataset's estimates there cite, with what it took. Its Page pins are
  // the data folder's, for every dataset.
  async function surveyPages(
    citations: ReturnType<typeof createCitations>,
    asked: { volumeId: string; volume: string },
    model: string
  ): Promise<VisionSurvey | { rejected: string }> {
    if (options.vision === undefined) return { rejected: NO_VISION };
    const { volumeId, volume } = asked;
    const rows = (await citations.inVolume(volumeId)) ?? [];
    const cited = rows.flatMap(({ citation, link }) =>
      link.certainty === 'estimated' && citation.citedPage !== null
        ? [citation.citedPage]
        : []
    );
    const started = performance.now();
    const reader = await options.vision(model, visionImage);
    const counted = counting(cachedReader(reader, readings));
    const surveyed = await folder
      .surveyPages(volumeId, volume, counted.reader, cited)
      .catch(failedWith);
    if ('rejected' in surveyed) return surveyed;
    const spend = reader.spend();
    const readingsAsked = counted.asked();
    return {
      pinned: surveyed.pinned,
      settled: surveyed.settled,
      model,
      readings: readingsAsked,
      cached: readingsAsked - callsOf(spend),
      dollars: dollarsOf(spend),
      seconds: Math.round((performance.now() - started) / 1000)
    };
  }

  // The pins on Astia's Images: the data folder's, and every dataset's
  // Marks, which a switch to a new filming leaves out alike.
  async function kept() {
    return await folder.kept(await options.datasets());
  }

  return {
    // The parishes, the church books and their downloads, and the Scan
    // cache, shared by every dataset.
    operations: sharedOperations({ astia, parishes, cache, downloads }),

    // Astia's Images and a Volume's re-scan, shared by every dataset. Null
    // for any other path.
    route: async (req: Request, pathname: string) =>
      await routeShared({ astia, cache, kept }, req, pathname),

    // One dataset's Citations, resolved against the scans. Opened once for
    // each Database.
    forDataset(db: Database) {
      const references = folder.references(db, { sizeOf });
      function changed(change: NewChange) {
        options.changed?.(db, change);
      }
      const citations = createCitations(db, { images, references, changed });
      if (options.warmUp === true) void citations.warmUp();
      // Switches the Volume, `volume` by its label, to Astia's new filming,
      // which every dataset then sees, and says so in this one's Changes.
      async function switchTo(volumeId: string, volume: string) {
        const { urls, rescan } = await switchFilming(
          { astia, cache, kept },
          volumeId
        );
        if (rescan !== null) {
          const { cached: from, images: to, stale } = rescan;
          changed({
            on: null,
            what: {
              kind: 'switch-filming',
              ...{ volume, from, to, stale: stale.length }
            }
          });
        }
        return urls;
      }
      return {
        // The operations on the dataset's Citations.
        operations: citationOperations(citations, {
          switchFilming: switchTo,
          findAllOnImage: async (citationIds, at, model) =>
            await findAllOnImage(citations, { citationIds, at }, model),
          surveyPages: async (volumeId, volume, model) =>
            await surveyPages(citations, { volumeId, volume }, model)
        }),
        // The person's Citations, as the panel lists them.
        ofPerson: (personId: number) => citations.ofPerson(personId),
        // A person's Citation by its id, with whose it is.
        citationOf: (citationId: number) => citations.ofId(citationId),
        // Titles the Volume sources made before with their archive, once
        // (scripts/retitle-volume-sources).
        retitleVolumeSources: async () =>
          await citations.retitleVolumeSources(),
        // Whether a Re-scan replaced the Image's file.
        replaced: async (at: {
          volumeId: string;
          image: number;
          fileId: string;
        }) => await images.replaced(at)
      };
    }
  };
}

export type DatasetCitations = ReturnType<
  ReturnType<typeof openCitations>['forDataset']
>;
