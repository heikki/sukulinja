// A dataset's Book list: the church books it works in, at a glance. Every
// Volume its Citations link into is on it, and those added by hand
// (`listed_books`), each with the archive holding it. What of a Volume is
// on disk, its download and its page numbers are the install's, shared by
// every dataset; only which Volumes are listed is the dataset's.

import type { Database } from 'bun:sqlite';

import type {
  ChurchBookArchive,
  ChurchBookVolume,
  ListedBook
} from '@/common/types';

import { Refusal } from '../operations';

interface Sources {
  // The parish archive's Volumes in Astia's order, with what of each is on
  // disk; with `keep`, only those it keeps.
  books: (
    archiveId: string,
    keep?: (volumeId: string) => boolean
  ) => Promise<ChurchBookVolume[]>;
  // The archive's title in Astia; null when Astia can't say.
  titleOf: (archiveId: string) => Promise<string | null>;
  // The archives the dataset's church books are in, most cited first.
  archives: () => Promise<ChurchBookArchive[]>;
  // How many of the dataset's Citations link into each of the archive's
  // Volumes, by Volume id; one with none left out.
  countInArchive: (archiveId: string) => Promise<Record<string, number>>;
}

export function openBookList(db: Database, sources: Sources) {
  const addedRows = db.prepare<{ volumeId: string; archiveId: string }, []>(
    'SELECT volume_id AS volumeId, archive_id AS archiveId FROM listed_books'
  );
  const addedOne = db.prepare<{ archiveId: string }, [string]>(
    'SELECT archive_id AS archiveId FROM listed_books WHERE volume_id = ?'
  );
  const insert = db.prepare<unknown, [string, string]>(
    'INSERT OR IGNORE INTO listed_books (volume_id, archive_id) VALUES (?, ?)'
  );
  const remove = db.prepare<unknown, [string]>(
    'DELETE FROM listed_books WHERE volume_id = ?'
  );

  // The archives the list's Volumes are in: the dataset's own, most cited
  // first, then those only added Volumes are in, as Astia titles them.
  async function archivesOfList(added: Array<{ archiveId: string }>) {
    const own = await sources.archives();
    const ids = new Set(own.map((a) => a.archiveId));
    const more = [...new Set(added.map((a) => a.archiveId))].filter(
      (id) => !ids.has(id)
    );
    const others = await Promise.all(
      more.map(async (archiveId) => ({
        archiveId,
        title: (await sources.titleOf(archiveId)) ?? archiveId
      }))
    );
    return [...own, ...others];
  }

  async function listIn(
    archive: ChurchBookArchive,
    added: Set<string>
  ): Promise<ListedBook[]> {
    const counts = await sources.countInArchive(archive.archiveId);
    const volumes = await sources.books(
      archive.archiveId,
      (id) => (counts[id] ?? 0) > 0 || added.has(id)
    );
    return volumes.map((v) => ({
      ...v,
      archiveId: archive.archiveId,
      archive: archive.title,
      cited: counts[v.id] ?? 0,
      added: added.has(v.id)
    }));
  }

  const list = {
    // The Book list: its archives in order, each one's Volumes in Astia's
    // order. Throws AstiaError when Astia can't say.
    async all(): Promise<ListedBook[]> {
      const added = addedRows.all();
      const ids = new Set(added.map((a) => a.volumeId));
      const archives = await archivesOfList(added);
      const lists = await Promise.all(archives.map((a) => listIn(a, ids)));
      return lists.flat();
    },

    // Adds the archive's Volume to the list; refused (400) when the archive
    // holds no such Volume.
    async add(volumeId: string, archiveId: string) {
      const volumes = await sources.books(archiveId);
      if (!volumes.some((v) => v.id === volumeId)) {
        throw new Refusal(
          400,
          "That Volume isn't in this parish's church books."
        );
      }
      insert.run(volumeId, archiveId);
    },

    // Takes an added Volume off the list; refused for one the dataset's
    // Citations link into (409), which stays, and for one not added (404).
    async remove(volumeId: string) {
      const row = addedOne.get(volumeId);
      if (row === null) {
        throw new Refusal(404, "That book wasn't added to the list.");
      }
      const counts = await sources.countInArchive(row.archiveId);
      if ((counts[volumeId] ?? 0) > 0) {
        throw new Refusal(
          409,
          'Citations here cite that book, so it stays on the list.'
        );
      }
      remove.run(volumeId);
    }
  };
  return list;
}

export type BookList = ReturnType<typeof openBookList>;
