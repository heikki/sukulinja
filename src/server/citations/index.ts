// The Citations context, as the rest of the app reaches it: nothing
// outside this folder imports any other file in it (tests use testing.ts;
// the tools in scripts/ reach inside).

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import { routeShared } from './astia-routes';
import { openAstia } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { imageSize, openScanCache } from './astia/scan-cache';
import { citationRoutes } from './citation-routes';
import { createCitations } from './citations';
import { openImages } from './images';
import { openScanFolder } from './myheritage';

export type { Astia } from './astia/astia';
export { annotated, annotationOf, openAnnotations } from './annotations';
export type { Annotation, Annotations, CitationLink } from './annotations';
export {
  BAPTISM_COLLECTION,
  carryRejections,
  collectionOf
} from './myheritage';

interface Options {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // The datasets whose Marks a re-scan of a Volume has to keep.
  datasets: () => Promise<Database[]>;
}

// The Citations of the data folder at `root`, for every dataset in it.
export function openCitations(root: string, options: Options) {
  const astia = options.astia ?? openAstia(join(root, '.astia-cache'));
  const cache = openScanCache({ astia, root, switches: false });
  // The Scan viewer has just shown the Image a Box is drawn on.
  async function sizeOf(at: ImageRef) {
    return await imageSize(cache, at);
  }
  const images = openImages({ astia, sizeOf });
  const folder = openScanFolder(root, { astia });

  // The pins on Astia's Images: the data folder's, and every dataset's
  // Marks, which a switch to a new filming leaves out alike.
  async function kept() {
    return await folder.kept(await options.datasets());
  }

  return {
    // Astia's Images, the Scan cache's settings and a Volume's re-scan,
    // shared by every dataset. Null for any other path.
    route: async (req: Request, pathname: string) =>
      await routeShared({ astia, cache, kept }, req, pathname),

    // One dataset's Citations, resolved against the scans. Opened once for
    // each Database, which a re-import replaces rather than changes.
    forDataset(db: Database) {
      const references = folder.scans(db, { sizeOf });
      const citations = createCitations(db, { images, references });
      return {
        // The Citation routes under /d/<slug>; null for any other path.
        route: citationRoutes(citations),
        // The person's Citations, as the panel lists them.
        ofPerson: (personId: number) => citations.ofPerson(personId),
        // A person's Citation by its id, with whose it is.
        citationOf: (citationId: number) => citations.ofId(citationId),
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
