// What citing an Image of a Volume needs, whatever the Citation: whether
// the Volume is in the tree's church books, whether Astia has re-scanned
// it, the Image's file, and whether a Box lies on the Image.

import type { Box } from '@/common/types';

import { archiveAmong } from './astia/archives';
import { AstiaError, viewerUrls } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import type { Viewport } from './astia/jpeg';
import type { Parishes } from './astia/parishes';
import { openDatasetArchives } from './dataset-archives';

// The full-size Image's size in pixels, or null when it can't be told.
export type ImageSizeOf = (at: ImageRef) => Promise<Viewport | null>;

export function unknownSize() {
  return Promise.resolve(null);
}

// A Box in whole pixels, with some width and height, within the Image when
// its size is known.
export function onImage(box: Box, size: Viewport | null) {
  const { left, top, width, height } = box;
  return (
    [left, top, width, height].every(Number.isInteger) &&
    left >= 0 &&
    top >= 0 &&
    width > 0 &&
    height > 0 &&
    (size === null ||
      (left + width <= size.width && top + height <= size.height))
  );
}

export const OFF_IMAGE =
  'The entry box must lie on the Image, in whole pixels.';

export const OLD_FILMING =
  'Astia has re-scanned this Volume. It can be changed once switched to the new filming.';

// Whether the Volume's cached list is of a filming Astia has replaced, as
// found this run: it's read-only until switched, as what's saved on it
// would be left out then. A re-scan changes every file id, so its first
// tells.
export async function onOldFilming(astia: Astia, volumeId: string) {
  const first = (await astia.volumeImages(volumeId))[0];
  return first !== undefined && (await astia.isGone(volumeId, first));
}

// The Images of the Astia given, in the parishes' archives. `sizeOf` tells
// a Box past its Image's edges; without it, none is.
export function openImages({
  astia,
  parishes,
  sizeOf = unknownSize
}: {
  astia: Astia;
  parishes: Parishes;
  sizeOf?: ImageSizeOf;
}) {
  return {
    // The parish archives a dataset's church books are in, in order.
    archivesOf: openDatasetArchives(astia, parishes),

    // Astia's viewer URL for each of the Volume's Images, in order.
    async urlsOf(volumeId: string) {
      return await viewerUrls(astia, volumeId);
    },

    // Asks Astia for the archives' titles and Volumes, an archive at a
    // time, so the app's own requests wait behind one of these at most; a
    // Volume's Images are asked for once needed. Each answer is kept on
    // disk. Ends quietly at the first that fails: asked again in use.
    async warmUp(archiveIds: string[]) {
      try {
        for (const archiveId of archiveIds) {
          // eslint-disable-next-line no-await-in-loop -- one at a time, behind the app's own
          await Promise.all([
            astia.archiveTitle(archiveId),
            astia.archiveVolumes(archiveId)
          ]);
        }
      } catch {
        // Not the app's to answer.
      }
    },

    // The archive's title in Astia; null when Astia can't say.
    async titleOf(archiveId: string) {
      return await astia.archiveTitle(archiveId);
    },

    // The title of the archive holding the Volume, as a Link names it,
    // looked for among the `archives`; null when none holds it or Astia
    // can't say.
    async archiveTitleOf(volumeId: string, archives: string[]) {
      try {
        const archive = await archiveAmong(astia, volumeId, archives);
        return archive === null ? null : await astia.archiveTitle(archive);
      } catch (err) {
        if (err instanceof AstiaError) return null;
        throw err;
      }
    },

    // The label of the Volume an entry is cited in, by its Box on an Image
    // of the filming `fileId` is of (the one listed now if not given), and
    // the Image's file id; or why it can't be. The Volume must be in one of
    // the `archives`.
    async imageToCite(
      at: { volumeId: string; image: number; fileId?: string; box: Box },
      archives: string[]
    ): Promise<{ volume: string; fileId: string } | { rejected: string }> {
      const { volumeId, image } = at;
      const archive = await archiveAmong(astia, volumeId, archives);
      const volume =
        archive === null
          ? undefined
          : (await astia.archiveVolumes(archive)).find(
              (v) => v.id === volumeId
            );
      if (volume === undefined) {
        return { rejected: "That Volume isn't in this tree's church books." };
      }
      if (await onOldFilming(astia, volumeId)) {
        return { rejected: OLD_FILMING };
      }
      const files = await astia.volumeImages(volumeId);
      if (!Number.isInteger(image) || image < 1 || image > files.length) {
        return { rejected: `The volume has images 1–${files.length}.` };
      }
      const fileId = files[image - 1]!;
      if (at.fileId !== undefined && fileId !== at.fileId) {
        return { rejected: "That isn't the Image's file in Astia." };
      }
      if (!onImage(at.box, await sizeOf({ volumeId, image }))) {
        return { rejected: OFF_IMAGE };
      }
      return { volume: volume.label, fileId };
    },

    // Whether the Image's file was replaced by a Re-scan: the Volume's list
    // kept now gives the Image another file. Asks Astia nothing, so a
    // Volume whose list isn't kept says no.
    async replaced(at: { volumeId: string; image: number; fileId: string }) {
      const files = await astia.cachedImages(at.volumeId);
      return files !== null && files[at.image - 1] !== at.fileId;
    }
  };
}

export type Images = ReturnType<typeof openImages>;
