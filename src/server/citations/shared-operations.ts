// The operations outside any dataset that the Citations answer
// (common/operations/app.ts): the install's parishes, finding a parish's
// archive in Astia and choosing one, for a spelling references give or
// for none; a parish's church books and their downloads; and the Scan
// cache they're kept in.

import type { AppOperations } from '@/common/operations';
import type { ChurchBookArchive } from '@/common/types';

import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import type { Astia } from './astia/astia';
import { parishBooks } from './astia/church-books';
import type { Downloads } from './astia/downloads';
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
  | 'scanCache'
  | 'setScanCap'
  | 'clearScanCache'
>;

export function sharedOperations({
  astia,
  parishes,
  cache,
  downloads
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
    startDownload({ volumeId }) {
      downloads.start(volumeId);
      return downloads.list();
    },
    stopDownload({ volumeId }) {
      downloads.stop(volumeId);
      return downloads.list();
    },
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
    }
  };
}
