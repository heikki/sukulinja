// The parish archives a dataset's Citations are in, as Astia titles them:
// those its church books are in, those an entry can be cited from, and the
// one holding a Volume, which names a Link and a Volume's source.

import type { ChurchBookArchive, Link } from '@/common/types';

import type { Images } from './images';

// What the archives are read from: each Citation's reference's parish, and
// the Volume its stored Link is in.
interface CitedBook {
  book: { parish: string | null } | null;
  stored: { volumeId: string } | null;
}

export function citedArchives(images: Images, everyCited: () => CitedBook[]) {
  // The parish archives the dataset's church books are in: its
  // references' parishes', and those holding the Volumes its Citations of
  // Images cite.
  async function archives() {
    const all = everyCited();
    return await images.archivesOf({
      parishes: all.map((c) => c.book?.parish ?? null),
      volumes: all.flatMap((c) =>
        c.stored === null ? [] : [c.stored.volumeId]
      )
    });
  }

  // The archives the dataset's church books are in, as `archives` orders
  // them, each by its title in Astia.
  async function churchBookArchives(): Promise<ChurchBookArchive[]> {
    return await Promise.all(
      (await archives()).map(async (archiveId) => ({
        archiveId,
        title: (await images.titleOf(archiveId)) ?? archiveId
      }))
    );
  }

  // The dataset's archives, then every other parish's: where an entry
  // can be cited from, so that a tree's first Citation in a parish can be.
  async function citable() {
    const own = await archives();
    const others = images.parishArchives().filter((a) => !own.includes(a));
    return [...own, ...others];
  }

  // The title of the archive holding the Volume, among those an entry can
  // be cited from; null when none of them does, or Astia can't say.
  async function volumeArchive(volumeId: string) {
    return await images.archiveTitleOf(volumeId, await citable());
  }

  // A stored Link, naming its archive as a resolved one does.
  async function withArchive(link: Link): Promise<Link> {
    const archive = await images.archiveTitleOf(
      link.volumeId,
      await archives()
    );
    return archive === null ? link : { ...link, archive };
  }

  return { archives, churchBookArchives, citable, volumeArchive, withArchive };
}
