// Storage: what of Astia's Volumes is on this computer, and the steps
// between. Images under the cap the install sets (the cache), a Volume's
// download, an Offloaded Volume's kept Images, and the Offload folder an
// Image may be read from or offloaded into, all behind two faces:
//
// - `images`, for the Scan viewer, Vision Match and a Re-scan: an Image,
//   fetched from Astia if need be, whether it's here, and whether an entry
//   may be cited on it;
// - `volumes`, for the Volumes tab and Settings: what Storage has of a
//   Volume, and downloading, offloading, bringing back and removing it;
//   the cap, a clear, and the Offload folder.
//
// The order of a step's parts (a download dropped before what it writes
// goes, the folder before the disk) is kept here, as is what an Offloaded
// Volume keeps: no step drops it. A step the Offload folder being away
// would refuse throws FolderAwayError, doing nothing.

import type {
  DownloadStatus,
  StorageSteps,
  VolumeOnDisk
} from '@/common/types';

import type { Astia, ImageRef, ImageSize } from '../astia/astia';
import { imageSize, openCache } from './cache';
import { openDownloads } from './downloads';
import type { DownloadOptions } from './downloads';
import { stepsOf } from './steps';
import type { FolderState } from './steps';

export { CAPS, OffloadedError } from './cache';
export { FolderAwayError } from './folder';
export type { DownloadOptions } from './downloads';

// What Storage has of a Volume: on disk, its download this run, and what
// it offloaded when it's Offloaded; and what it would do next with it.
export interface Stored {
  onDisk: VolumeOnDisk;
  download: DownloadStatus | null;
  offloaded: { images: number; bytes: number } | null;
  next: StorageSteps;
}

export function openStorage({
  astia,
  root,
  citedImages,
  downloads: downloadOptions,
  freeSpace
}: {
  astia: Astia;
  // The data folder: the Images in `.astia-images`, the settings in
  // `settings.local.json`.
  root: string;
  // The Images of the Volume any dataset's Citations link, by number,
  // which an offload keeps. Throws when that can't be known.
  citedImages: (volumeId: string) => Promise<number[]>;
  downloads?: DownloadOptions;
  // The disk's free space, for the caps offered; the disk's by default.
  freeSpace?: () => Promise<number>;
}) {
  const cache = openCache({ astia, root, freeSpace });
  const downloads = openDownloads({ astia, cache }, downloadOptions);
  const folder = cache.offloadFolder;
  // What was fetched with the Offload folder away, into it now.
  void cache.archive().catch(() => undefined);

  const images = {
    // The file of a Volume's Image (numbered from 1), fetched if need be;
    // null when the Volume has no such Image. Throws OffloadedError for
    // one an Offloaded Volume doesn't keep, NoImageError when Astia no
    // longer has it, and AstiaError when Astia fails.
    image: async (at: ImageRef, size: ImageSize, signal: AbortSignal) =>
      await cache.image(at, size, signal),
    // Whether the full-size Image is here already, on disk or in the
    // Offload folder.
    isCached: async (at: ImageRef) => await cache.isCached(at),
    // Whether an entry can be cited on the Image: any of a Volume not
    // Offloaded, those an Offloaded one keeps.
    citable: async (at: ImageRef) => await cache.keeps(at),
    // The full-size Image's size in pixels; null when it can't be had.
    sizeOf: async (at: ImageRef) => await imageSize(cache, at),
    // Asks Astia for the Volume's list again, dropping the Images of the
    // filming it replaced: a switch to a Re-scan.
    refresh: async (volumeId: string) => {
      await cache.refresh(volumeId);
    }
  };

  async function folderState(): Promise<FolderState> {
    const set = await folder.status();
    if (set === null) return 'none';
    return set.attached ? 'attached' : 'away';
  }

  // What Storage has of the Volume; with `digitized` false, as Astia says
  // of one with no scans, none to download.
  async function stored(volumeId: string, digitized = true): Promise<Stored> {
    const has = {
      onDisk: await cache.onDisk(volumeId),
      download: downloads.of(volumeId),
      offloaded: await cache.offloadedOf(volumeId)
    };
    return {
      ...has,
      next: stepsOf({ ...has, digitized }, await folderState())
    };
  }

  const volumes = {
    of: stored,

    // The Volumes with anything here: Images on disk, Offloaded, or a
    // download this run.
    async here() {
      return [
        ...new Set([
          ...(await cache.volumes()),
          ...downloads.list().map((d) => d.volumeId)
        ])
      ];
    },

    // Every download this run that hasn't finished.
    downloads: () => downloads.list(),

    // Downloads the Volume, or carries on; an Offloaded one is brought
    // back from the Offload folder first, and only the rest fetched.
    async download(volumeId: string) {
      if (await cache.isOffloaded(volumeId)) await cache.bringBack(volumeId);
      downloads.start(volumeId);
    },

    // Stops its download; what it fetched stays.
    stop(volumeId: string) {
      downloads.stop(volumeId);
    },

    // Every full-size Image but the cited ones off the disk, into the
    // Offload folder when one is set, and none fetched again until it's
    // downloaded. Throws, offloading nothing, when what's cited can't be
    // known or Astia fails.
    async offload(volumeId: string) {
      await downloads.drop(volumeId);
      await cache.offload(volumeId, await citedImages(volumeId));
    },

    // The bytes an offload would free; null when that can't be known
    // without Astia.
    async offloadFrees(volumeId: string) {
      const cited = await citedImages(volumeId).catch(() => null);
      return cited === null ? null : await cache.freedBy(volumeId, cited);
    },

    // Its Images off the disk and out of the Offload folder, its facts
    // kept; out of the folder first, so with the folder away nothing goes.
    async remove(volumeId: string) {
      await downloads.drop(volumeId);
      await folder.forget(volumeId);
      await cache.remove(volumeId);
    },

    // How much is on disk against the cap, and the caps offered.
    status: async () => await cache.status(),
    // Sets the cap, shrinking to it at once.
    setCap: async (bytes: number) => {
      await cache.setCap(bytes);
    },
    // Drops every Image but those Offloaded Volumes keep.
    clear: async () => {
      await cache.clear();
    },

    // The Offload folder set, and whether it's attached; null for none.
    folder: async () => await folder.status(),
    // Sets the Offload folder, or with null none, and gives a folder set
    // whatever of the disk it hasn't whole. Throws FolderAwayError for one
    // that isn't a folder.
    async setFolder(path: string | null) {
      await folder.set(path);
      if (path !== null) void cache.archive().catch(() => undefined);
    }
  };

  return {
    images,
    volumes,
    // The Volumes' facts kept in the Offload folder beside their Images,
    // for the facts archive.
    folderFacts: {
      facts: async (volumeId: string) => await folder.facts(volumeId),
      keepFacts: async (volumeId: string, text: string) => {
        await folder.keepFacts(volumeId, text);
      },
      volumes: async () => await folder.volumes()
    }
  };
}

export type Storage = ReturnType<typeof openStorage>;
export type StorageImages = Storage['images'];
export type StorageVolumes = Storage['volumes'];
export type FolderFacts = Storage['folderFacts'];
