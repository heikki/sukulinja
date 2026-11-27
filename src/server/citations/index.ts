// The Citations context, as the rest of the app reaches it: nothing
// outside this folder imports any other file in it (tests use testing.ts).

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import type { NewChange } from '../changes/changes';
import { routeShared } from './astia-routes';
import { AstiaError, openAstia } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { installBooks, parishBooks, storedNow } from './astia/church-books';
import { openParishes } from './astia/parishes';
import type { Parishes } from './astia/parishes';
import { openBookList } from './book-list';
import type { BookList } from './book-list';
import { createCitations } from './citations';
import type { Citations } from './citations';
import { openImages } from './images';
import { openScanFolder, pacedImages, switchFilming } from './myheritage';
import { askingAstia, citationOperations } from './operations';
import { openPersonBooks } from './person-books';
import type { PersonLife } from './person-books';
import { sharedOperations } from './shared-operations';
import { openStorage } from './storage';
import type { DownloadOptions } from './storage';
import type { FactScope } from './support';
import { openVision } from './vision';
import type { VisionReaders } from './vision';
import { openVolumeFacts } from './volume-facts';
import { volumesView } from './volumes-view';

export type { Astia } from './astia/astia';
export type { DownloadOptions } from './storage';
export { claudeVision } from './vision';
export type { SpendingReader, VisionReaders } from './vision';
export { annotated, openAnnotations } from './annotations';
export type { Annotation, Annotations, CitationLink } from './annotations';
export { PUBLISHER as ASTIA_PUBLISHER } from './app-citations';
export {
  CITATIONS_READ,
  dropUncitedEntries,
  gatherEntries,
  putBookPages,
  putEntryFields
} from './entries';
export { viewerUrl } from './astia/astia';
export { dropUnownedSupport, leaveFamilySupport, openSupport } from './support';
export type { FactScope } from './support';
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
  const storage = openStorage({
    astia,
    root,
    citedImages,
    downloads: options.downloads
  });
  // The Scan viewer has just shown the Image a Box is drawn on.
  async function sizeOf(at: ImageRef) {
    return await storage.images.sizeOf(at);
  }
  const parishes = options.parishes ?? openParishes(root);
  const images = openImages({ astia, parishes, sizeOf });
  const personBooks = openPersonBooks({ astia, parishes });
  // The Volumes' facts, kept in the offload folder too.
  const facts = openVolumeFacts(root, {
    astia,
    offload: storage.folderFacts,
    parishes: () => parishes.archives()
  });
  void facts.syncFolder().catch(() => undefined);
  const folder = openScanFolder(facts, { astia, parishes });
  // One queue for every search, so they don't hammer Astia together.
  const visionImage = pacedImages(storage.images);
  // Readings are kept on disk, so the same question isn't asked twice.
  const readings = join(root, '.vision-readings');

  const vision = openVision({
    readers: options.vision,
    image: visionImage,
    readings,
    facts
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

  // Each dataset's Book list, made once for its Database.
  const lists = new WeakMap<Database, BookList>();
  function bookListOf(db: Database) {
    let list = lists.get(db);
    if (list === undefined) {
      const citations = citationsOf(db);
      list = openBookList(db, {
        books: async (archiveId, keep) =>
          await parishBooks(
            { astia, storage: storage.volumes },
            archiveId,
            keep
          ),
        titleOf: async (archiveId) => await images.titleOf(archiveId),
        archives: async () => await citations.churchBookArchives(),
        countInArchive: async (archiveId) =>
          await citations.countInArchive(archiveId),
        stamp: async () => await citations.stamp(),
        storedNow: async (volume) =>
          await storedNow({ storage: storage.volumes }, volume)
      });
      lists.set(db, list);
    }
    return list;
  }

  // Every dataset's Book list but the one of `db`; one Astia can't say is
  // left out.
  async function listsBesides(db: Database) {
    const others = (await options.datasets()).filter((d) => d !== db);
    const all = await Promise.all(
      others.map(async (d) => {
        try {
          return await bookListOf(d).all();
        } catch (err) {
          if (err instanceof AstiaError) return null;
          throw err;
        }
      })
    );
    return all.filter((l) => l !== null);
  }

  return {
    // The parishes, the church books and their downloads, and Storage,
    // shared by every dataset.
    operations: sharedOperations({
      astia,
      parishes,
      storage: storage.volumes,
      chooseFolder: options.chooseFolder,
      folderSet: () => {
        void facts.syncFolder().catch(() => undefined);
      }
    }),

    // Astia's Images and a Volume's re-scan, shared by every dataset. Null
    // for any other path.
    route: async (req: Request, pathname: string) =>
      await routeShared({ astia, images: storage.images, kept }, req, pathname),

    // One dataset's Citations, resolved against the scans. Opened once for
    // each Database.
    forDataset(db: Database) {
      function changed(change: NewChange) {
        options.changed?.(db, change);
      }
      const citations = citationsOf(db);
      const bookList = bookListOf(db);
      if (options.warmUp === true) void citations.warmUp();
      // Switches the Volume, `volume` by its label, to Astia's new filming,
      // which every dataset then sees, and says so in this one's Changes.
      async function switchTo(volumeId: string, volume: string) {
        const { urls, rescan } = await switchFilming(
          { astia, images: storage.images, kept },
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
          pages: facts,
          citable: async (at) => await storage.images.citable(at)
        }),
        // The dataset's Book list, and adding and taking off Volumes.
        bookList,
        // The Volumes view: the Book list, then every other dataset's and
        // every other Volume on this computer, with Storage's fill.
        volumesView: async () =>
          await volumesView({
            listed: async () => await bookList.all(),
            elsewhere: async () => await listsBesides(db),
            here: async () =>
              await installBooks(
                { astia, storage: storage.volumes },
                parishes.archives()
              ),
            pagesOf: async (volumeId) => await facts.numbering(volumeId),
            storage: async () => await storage.volumes.status()
          }),
        // The church books a person's Facts say they should be in, each
        // Expected entry with the Volumes it fits.
        booksFor: async (life: PersonLife) => await personBooks.booksFor(life),
        // The person's Citations, as the panel lists them.
        ofPerson: (personId: number) => citations.ofPerson(personId),
        // A person's Citation by its id, with whose it is.
        citationOf: (citationId: number) => citations.ofId(citationId),
        // Why the Citation can't support a Fact of the scope (ADR-0037).
        supportRefusal: (citationId: number, of: FactScope) =>
          citations.supportRefusal(citationId, of),
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
