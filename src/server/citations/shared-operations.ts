// The operations outside any dataset that the Citations answer
// (common/operations/app.ts): the install's parishes, finding a parish's
// archive in Astia and choosing one, for a spelling references give or
// for none; a parish's church books and their downloads, every one with
// something on this computer, removed from it or offloaded to their cited
// Images; and Storage, which keeps them.

import type { AppOperations } from '@/common/operations';
import type {
  ChurchBookArchive,
  PageMark,
  PageNumbering
} from '@/common/types';

import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import type { Astia } from './astia/astia';
import { installBooks, parishBooks } from './astia/church-books';
import { findParishArchives, isParishArchive } from './astia/parish-search';
import type { Parishes } from './astia/parishes';
import { askingAstia } from './operations';
import { CAPS, FolderAwayError } from './storage';
import type { StorageVolumes } from './storage';

interface Sources {
  astia: Astia;
  parishes: Parishes;
  storage: StorageVolumes;
  // The app's folder picker: the folder chosen, or null; none outside the
  // app.
  chooseFolder?: () => Promise<string | null>;
  // Told once an offload folder is set, to fill it.
  folderSet?: () => void;
  // What's known of a Volume's page numbers, and marking them checked or
  // as none.
  pages: {
    numbering: (volumeId: string) => Promise<PageNumbering>;
    mark: (volumeId: string, as: PageMark | null) => Promise<void>;
  };
}

export type SharedOperations = Pick<
  AppOperations,
  | 'parishes'
  | 'findParishArchives'
  | 'addParish'
  | 'removeParish'
  | 'linkSpelling'
  | 'churchBooks'
  | 'downloads'
  | 'startDownload'
  | 'stopDownload'
  | 'allBooks'
  | 'removeFromDisk'
  | 'removeForGood'
  | 'offload'
  | 'markPages'
  | 'pagesLocked'
  | 'isOffloaded'
  | 'offloadFrees'
  | 'storage'
  | 'setStorageCap'
  | 'clearStorage'
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
  storage,
  chooseFolder,
  folderSet,
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
      { astia, storage },
      {
        parishes: parishes.archives(),
        pagesOf: pages.numbering
      }
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
    async removeParish({ archiveId }) {
      if (!(await parishes.remove(archiveId))) {
        throw new Refusal(409, 'References in a tree link into this parish.');
      }
    },
    // Every reference giving the spelling then resolves there.
    async linkSpelling({ spelling, archiveId }) {
      await parishArchive(archiveId);
      await parishes.link(spelling, archiveId);
    },
    churchBooks: async ({ archiveId }) =>
      await askingAstia(parishBooks({ astia, storage }, archiveId)),
    downloads: () => storage.downloads(),
    async startDownload({ volumeId }) {
      await storage.download(volumeId).catch(folderAway);
      return storage.downloads();
    },
    stopDownload({ volumeId }) {
      storage.stop(volumeId);
      return storage.downloads();
    },
    allBooks,
    async removeFromDisk({ volumeId }) {
      await storage.remove(volumeId).catch(folderAway);
      return await allBooks();
    },
    async removeForGood({ volumeId }) {
      await storage.removeForGood(volumeId).catch(folderAway);
      return await allBooks();
    },
    async offload({ volumeId }) {
      await askingAstia(storage.offload(volumeId)).catch(folderAway);
      return await allBooks();
    },
    async markPages({ volumeId, as }) {
      await pages.mark(volumeId, as);
      return await allBooks();
    },
    pagesLocked: async ({ volumeId }) =>
      ['checked', 'none'].includes(await pages.numbering(volumeId)),
    isOffloaded: async ({ volumeId }) =>
      (await storage.of(volumeId)).offloaded !== null,
    // Asked of one Volume at a time, as what's cited is slow to know; null
    // when it can't be, as Astia isn't reached.
    offloadFrees: async ({ volumeId }) => await storage.offloadFrees(volumeId),
    storage: async () => await storage.status(),
    async setStorageCap({ cap }) {
      if (!CAPS.includes(cap)) {
        throw new Refusal(400, `expected { cap } of ${CAPS.join(', ')}`);
      }
      await storage.setCap(cap);
      return await storage.status();
    },
    async clearStorage() {
      await storage.clear();
      return await storage.status();
    },
    offloadFolder: async () => await storage.folder(),
    async chooseOffloadFolder() {
      if (chooseFolder === undefined) {
        throw new Refusal(400, 'A folder is chosen in the app.');
      }
      const chosen = await chooseFolder();
      if (chosen !== null) {
        await storage.setFolder(chosen).catch(folderAway);
        folderSet?.();
      }
      return await storage.folder();
    },
    async clearOffloadFolder() {
      await storage.setFolder(null);
      return null;
    }
  };
}
