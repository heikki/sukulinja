// The parish archives a dataset's church books are in (ADR-0016): those of
// the parishes its Church-book references give, most cited first, then
// those holding the Volumes its Citations of Images cite, which are found
// among every parish's archive. A Link names its archive from them, and a
// Volume is cited only from one of them.

import { archiveAmong } from './astia/archives';
import { AstiaError } from './astia/astia';
import type { Astia } from './astia/astia';
import type { Parishes } from './astia/parishes';

// What a dataset's Citations say of the church books they're in.
export interface CitedBooks {
  // The parish of each Church-book reference, as read.
  parishes: Array<string | null>;
  // The Volume of each Citation of an Image.
  volumes: string[];
}

export function openDatasetArchives(astia: Astia, parishes: Parishes) {
  // The archive holding a Volume, once found among the parishes as they
  // were then; a failure isn't kept.
  const holders = new Map<string, Promise<string | null>>();
  let holdersAt = parishes.stamp();

  function holderOf(volumeId: string, among: string[]) {
    if (parishes.stamp() !== holdersAt) {
      holders.clear();
      holdersAt = parishes.stamp();
    }
    let hit = holders.get(volumeId);
    if (hit === undefined) {
      hit = archiveAmong(astia, volumeId, among);
      holders.set(volumeId, hit);
      hit.catch(() => holders.delete(volumeId));
    }
    return hit;
  }

  // A Volume's archive, if the ranked ones don't hold it: null when they
  // do, or when no archive can be found for it now.
  async function otherHolder(volumeId: string, ranked: string[]) {
    try {
      if ((await archiveAmong(astia, volumeId, ranked)) !== null) return null;
      const others = parishes.archives().filter((a) => !ranked.includes(a));
      return await holderOf(volumeId, others);
    } catch (err) {
      if (err instanceof AstiaError) return null;
      throw err;
    }
  }

  return async function archivesOf(cited: CitedBooks) {
    const ranked = parishes.ranked(cited.parishes);
    const { volumes } = cited;
    const found = await Promise.all(
      [...new Set(volumes)].map(async (v) => await otherHolder(v, ranked))
    );
    const more = found.filter((a) => a !== null);
    return [...ranked, ...new Set(more)];
  };
}

export type DatasetArchives = ReturnType<typeof openDatasetArchives>;
