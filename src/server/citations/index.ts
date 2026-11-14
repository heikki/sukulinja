// The Citations context, as the rest of the app reaches it: nothing
// outside this folder imports any other file in it (tests use testing.ts;
// the tools in scripts/ reach inside).

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import type { NewChange } from '@/common/types';

import { routeShared } from './astia-routes';
import { openAstia } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { openDownloads } from './astia/downloads';
import { openParishes } from './astia/parishes';
import type { Parishes } from './astia/parishes';
import { imageSize, openScanCache } from './astia/scan-cache';
import { createCitations } from './citations';
import { openImages } from './images';
import { openScanFolder, switchFilming } from './myheritage';
import { citationOperations } from './operations';
import { routeParishes } from './parish-routes';

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

  // The pins on Astia's Images: the data folder's, and every dataset's
  // Marks, which a switch to a new filming leaves out alike.
  async function kept() {
    return await folder.kept(await options.datasets());
  }

  return {
    // The parishes, Astia's Images, the Scan cache's settings, a Volume's
    // re-scan, the church books and their downloads, shared by every
    // dataset. Null for any other path.
    route: async (req: Request, pathname: string) =>
      (await routeParishes({ astia, parishes }, req, pathname)) ??
      (await routeShared({ astia, cache, downloads, kept }, req, pathname)),

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
        operations: citationOperations(citations, switchTo),
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
