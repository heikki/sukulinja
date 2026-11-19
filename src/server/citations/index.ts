// The Citations context, as the rest of the app reaches it: nothing
// outside this folder imports any other file in it (tests use testing.ts).

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import type { NewChange } from '../changes/changes';
import { routeShared } from './astia-routes';
import { openAstia } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { parishBooks } from './astia/church-books';
import { openDownloads } from './astia/downloads';
import type { DownloadOptions } from './astia/downloads';
import { openParishes } from './astia/parishes';
import type { Parishes } from './astia/parishes';
import { imageSize, openScanCache } from './astia/scan-cache';
import { openBookList } from './book-list';
import { createCitations } from './citations';
import type { Citations } from './citations';
import { openImages } from './images';
import { openScanFolder, pacedImages, switchFilming } from './myheritage';
import { askingAstia, citationOperations } from './operations';
import { openPersonBooks } from './person-books';
import type { PersonLife } from './person-books';
import { sharedOperations } from './shared-operations';
import { openVision } from './vision';
import type { VisionReaders } from './vision';

export type { Astia } from './astia/astia';
export type { DownloadOptions } from './astia/downloads';
export { claudeVision } from './vision';
export type { SpendingReader, VisionReaders } from './vision';
export { annotated, openAnnotations } from './annotations';
export type { Annotation, Annotations, CitationLink } from './annotations';
export { PUBLISHER as ASTIA_PUBLISHER } from './app-citations';
export {
  CITATIONS_READ,
  dropUncitedEntries,
  gatherEntries,
  putEntryFields
} from './entries';
export { viewerUrl } from './astia/astia';
export { leaveFamilySupport, openSupport } from './support';
export { BAPTISM_COLLECTION, collectionOf } from './myheritage';
export { askingAstia };
export type { PersonLife } from './person-books';

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
  // How church book downloads pace Astia; by default gently.
  downloads?: DownloadOptions;
  // The app's folder picker, for the offload folder; none outside the app.
  chooseFolder?: () => Promise<string | null>;
}

// The Citations of the data folder at `root`, for every dataset in it.
export function openCitations(root: string, options: Options) {
  const astia = options.astia ?? openAstia(join(root, '.astia-cache'));
  const cache = openScanCache({ astia, root });
  const downloads = openDownloads({ astia, cache }, options.downloads);
  // The Scan viewer has just shown the Image a Box is drawn on.
  async function sizeOf(at: ImageRef) {
    return await imageSize(cache, at);
  }
  const parishes = options.parishes ?? openParishes(root);
  const images = openImages({ astia, parishes, sizeOf });
  const personBooks = openPersonBooks({ astia, parishes });
  const folder = openScanFolder(root, { astia, parishes });
  // One queue for every search, so they don't hammer Astia together.
  const visionImage = pacedImages(cache);
  // Readings are kept on disk, so the same question isn't asked twice.
  const readings = join(root, '.vision-readings');

  const vision = openVision({
    readers: options.vision,
    image: visionImage,
    readings,
    folder
  });

  // The pins on Astia's Images: the data folder's, and every dataset's
  // Marks, which a switch to a new filming leaves out alike.
  async function kept() {
    return await folder.kept(await options.datasets());
  }

  // Each dataset's Citations, made once for its Database: by its
  // operations, or first by a question about every dataset.
  const made = new WeakMap<Database, Citations>();
  function citationsOf(db: Database) {
    let citations = made.get(db);
    if (citations === undefined) {
      const references = folder.references(db, { sizeOf });
      citations = createCitations(db, {
        images,
        references,
        changed: (change) => options.changed?.(db, change)
      });
      made.set(db, citations);
    }
    return citations;
  }

  // The Images of the Volume any dataset's Citations link, by number.
  // Throws when Astia can't be reached.
  async function citedImages(volumeId: string) {
    const rows = await Promise.all(
      (await options.datasets()).map(
        async (db) => await citationsOf(db).inVolume(volumeId)
      )
    );
    const cited = rows
      .flat()
      .flatMap((row) => ('image' in row.link ? [row.link.image] : []));
    return [...new Set(cited)];
  }

  return {
    // The parishes, the church books and their downloads, and the Scan
    // cache, shared by every dataset.
    operations: sharedOperations({
      astia,
      parishes,
      cache,
      downloads,
      citedImages,
      chooseFolder: options.chooseFolder,
      pages: {
        numbering: async (volumeId) => await folder.pageNumbering(volumeId),
        check: async (volumeId, on) => {
          await folder.checkPages(volumeId, on);
        }
      }
    }),

    // Astia's Images and a Volume's re-scan, shared by every dataset. Null
    // for any other path.
    route: async (req: Request, pathname: string) =>
      await routeShared({ astia, cache, kept }, req, pathname),

    // One dataset's Citations, resolved against the scans. Opened once for
    // each Database.
    forDataset(db: Database) {
      function changed(change: NewChange) {
        options.changed?.(db, change);
      }
      const citations = citationsOf(db);
      const bookList = openBookList(db, {
        books: async (archiveId) =>
          await parishBooks({ astia, cache, downloads }, archiveId),
        titleOf: async (archiveId) => await images.titleOf(archiveId),
        archives: async () => await citations.churchBookArchives(),
        countInArchive: async (archiveId) =>
          await citations.countInArchive(archiveId)
      });
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
            await vision.findAllOnImage(citations, { citationIds, at }, model),
          surveyPages: async (volumeId, volume, model, fresh) =>
            await vision.surveyPages(
              citations,
              { volumeId, volume, fresh },
              model
            ),
          locateVolume: (volumeId, volume, model) =>
            vision.locateVolume(citations, { volumeId, volume }, model),
          volumePages: async (volumeId, volume) =>
            await folder.pagesInVolume(volumeId, volume),
          setImagePage: async (at, pages) =>
            await folder.setImagePage(at, pages),
          clearVolumePages: async (volumeId) =>
            await folder.clearVolumePages(volumeId),
          citable: async (at) => await cache.keeps(at)
        }),
        // The dataset's Book list, and adding and taking off Volumes.
        bookList,
        // The church books a person's Facts say they should be in, each
        // Expected entry with the Volumes it fits.
        booksFor: async (life: PersonLife) => await personBooks.booksFor(life),
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
