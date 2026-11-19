// The operations outside any dataset that the Citations answer
// (common/operations/app.ts): the install's parishes, finding a parish's
// archive in Astia and choosing one, for a spelling references give or
// for none; a parish's church books and their downloads, every one with
// something on this computer, removed from it or offloaded to their cited
// Images; and the Scan cache they're kept in.

import type { AppOperations } from '@/common/operations';
import type { ChurchBookArchive, PageNumbering } from '@/common/types';

import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import type { Astia } from './astia/astia';
import { installBooks, parishBooks } from './astia/church-books';
import type { Downloads } from './astia/downloads';
import { FolderAwayError } from './astia/offload-folder';
import { findParishArchives, isParishArchive } from './astia/parish-search';
import type { Parishes } from './astia/parishes';
import { CAPS } from './astia/scan-cache';
import type { ScanCache } from './astia/scan-cache';
import { askingAstia } from './operations';

interface Sources {
  astia: Astia;
  parishes: Parishes;
  cache: ScanCache;
  downloads: Downloads;
  // The Images of a Volume any dataset's Citations link, kept on disk by
  // an offload.
  citedImages: (volumeId: string) => Promise<number[]>;
  // The app's folder picker: the folder chosen, or null; none outside the
  // app.
  chooseFolder?: () => Promise<string | null>;
  // What's known of a Volume's page numbers, and marking them checked.
  pages: {
    numbering: (volumeId: string) => Promise<PageNumbering>;
    check: (volumeId: string, on: boolean) => Promise<void>;
  };
}

export type SharedOperations = Pick<
  AppOperations,
  | 'parishes'
  | 'findParishArchives'
  | 'addParish'
  | 'linkSpelling'
  | 'churchBooks'
  | 'downloads'
  | 'startDownload'
  | 'stopDownload'
  | 'allBooks'
  | 'removeFromDisk'
  | 'offload'
  | 'bringBack'
  | 'checkPages'
  | 'pagesChecked'
  | 'isOffloaded'
  | 'scanCache'
  | 'setScanCap'
  | 'clearScanCache'
  | 'offloadFolder'
  | 'chooseOffloadFolder'
  | 'clearOffloadFolder'
>;

// The offload folder away, or no folder, is refused; anything else thrown
// is thrown on.
function folderAway(err: unknown): never {
  if (err instanceof FolderAwayError) {
    throw new Refusal(409, "The offload folder's drive isn't attached.");
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  throw err;
}

export function sharedOperations({
  astia,
  parishes,
  cache,
  downloads,
  citedImages,
  chooseFolder,
  pages
}: Sources): Handlers<SharedOperations> {
  // The archive, if it's a parish's in Astia.
  async function parishArchive(archiveId: string) {
    const title = await astia.archiveTitle(archiveId);
    if (title === null) {
      throw new Refusal(502, "Astia couldn't say what that archive is.");
    }
    if (!isParishArchive(title)) {
      throw new Refusal(400, `${title} isn't a parish's archive.`);
    }
  }

  async function allBooks() {
    return await installBooks(
      { astia, cache, downloads },
      { parishes: parishes.archives(), pagesOf: pages.numbering }
    );
  }

  return {
    parishes: async () =>
      await Promise.all(
        parishes
          .archives()
          .map(async (archiveId): Promise<ChurchBookArchive> => ({
            archiveId,
            title: (await astia.archiveTitle(archiveId)) ?? archiveId
          }))
      ),
    findParishArchives: async ({ name }) =>
      await askingAstia(findParishArchives(astia, name)),
    async addParish({ archiveId }) {
      await parishArchive(archiveId);
      await parishes.add(archiveId);
    },
    // Every reference giving the spelling then resolves there.
    async linkSpelling({ spelling, archiveId }) {
      await parishArchive(archiveId);
      await parishes.link(spelling, archiveId);
    },
    churchBooks: async ({ archiveId }) =>
      await askingAstia(parishBooks({ astia, cache, downloads }, archiveId)),
    downloads: () => downloads.list(),
    async startDownload({ volumeId }) {
      if (await cache.isOffloaded(volumeId)) {
        throw new Refusal(409, 'Bring the volume back first.');
      }
      downloads.start(volumeId);
      return downloads.list();
    },
    stopDownload({ volumeId }) {
      downloads.stop(volumeId);
      return downloads.list();
    },
    allBooks,
    async removeFromDisk({ volumeId }) {
      await downloads.drop(volumeId);
      await cache.remove(volumeId);
      return await allBooks();
    },
    // Every Image but the cited ones off the disk, and none fetched again
    // until it's brought back; none, when what's cited can't be known.
    async offload({ volumeId }) {
      await downloads.drop(volumeId);
      const cited = await askingAstia(citedImages(volumeId));
      await askingAstia(cache.offload(volumeId, cited)).catch(folderAway);
      return await allBooks();
    },
    async bringBack({ volumeId }) {
      await cache.bringBack(volumeId);
      return await allBooks();
    },
    async checkPages({ volumeId, checked }) {
      await pages.check(volumeId, checked);
      return await allBooks();
    },
    pagesChecked: async ({ volumeId }) =>
      (await pages.numbering(volumeId)) === 'checked',
    isOffloaded: async ({ volumeId }) => await cache.isOffloaded(volumeId),
    scanCache: async () => await cache.status(),
    async setScanCap({ cap }) {
      if (!CAPS.includes(cap)) {
        throw new Refusal(400, `expected { cap } of ${CAPS.join(', ')}`);
      }
      await cache.setCap(cap);
      return await cache.status();
    },
    async clearScanCache() {
      await cache.clear();
      return await cache.status();
    },
    offloadFolder: async () => await cache.offloadFolder.status(),
    async chooseOffloadFolder() {
      if (chooseFolder === undefined) {
        throw new Refusal(501, 'A folder is chosen in the app.');
      }
      const chosen = await chooseFolder();
      if (chosen !== null) {
        await cache.offloadFolder.set(chosen).catch(folderAway);
      }
      return await cache.offloadFolder.status();
    },
    async clearOffloadFolder() {
      await cache.offloadFolder.set(null);
      return null;
    }
  };
}
