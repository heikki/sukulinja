// Citations made in the app, on an Astia Image: storing and deleting one,
// with the source record of the Volume it's in. A Volume's source is known
// by its own record, the xref the app gave it or its title and publisher;
// nothing marks the source itself as the app's.

import type { Database } from 'bun:sqlite';

import { bookEvent } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import type { Box } from '@/common/types';

import { openAnnotations } from './annotations';
import { viewerUrl } from './astia/astia';
import { CITATIONS_READ, dropUncitedEntries, gatherEntries } from './entries';
import { openEntries } from './entries/storage';
import type { Converting } from './references';

// Who publishes every Volume, and where.
export const PUBLISHER = 'Kansallisarkisto, Astia';

// A Volume's source's title: its archive's, then its label, as an archive's
// book is cited (ADR-0019); the label alone where the archive isn't known.
export function volumeSourceTitle(volume: string, archive: string | null) {
  return archive === null ? volume : `${archive}, ${volume}`;
}

// An Entry at the Box on an Image, and the Event it records.
export interface NewEntryAt {
  volumeId: string;
  // The Volume's label and its archive's title, which title its source.
  volume: string;
  archive?: string | null;
  image: number;
  fileId: string;
  box: Box;
  event: EntryEvent | null;
  text: string | null;
  // Stored as a new row even when one is alike, as an Entry replacing
  // another (ADR-0037).
  fresh?: boolean;
}

// A Citation of the entry at the Box on an Image, for the person.
interface NewCitation {
  personId: number;
  volumeId: string;
  // The Volume's label and its archive's title, which title its source.
  volume: string;
  archive?: string | null;
  image: number;
  fileId: string;
  box: Box;
  text: string | null;
  // The person's Role in the entry, GEDCOM's citation ROLE.
  role?: string | null;
  // The Event the entry records; left out, what its Book gives.
  event?: EntryEvent | null;
}

// A Volume's archive title, or null when it isn't known.
type ArchiveOf = (volumeId: string) => Promise<string | null>;

export function openAppCitations(db: Database) {
  const annotations = openAnnotations(db);
  const entries = openEntries(db);
  // The Volume's source is known by its own record: the xref the app gave
  // it, else its title and publisher, as one brought back under another
  // xref has them, once the title names its archive (ADR-0019): a label
  // alone is shared by many parishes. Never by the Citations that cite it,
  // which may cite another source's reference (ADR-0016).
  const volumeSource = db.prepare<
    { id: number },
    [string, string | null, string]
  >(
    `SELECT id FROM sources
     WHERE xref = ?1 OR (?2 IS NOT NULL AND title = ?2 AND publisher = ?3)
     ORDER BY xref = ?1 DESC, id LIMIT 1`
  );
  const xrefTaken = db.prepare<{ id: number }, [string]>(
    'SELECT id FROM sources WHERE xref = ?'
  );
  const insertSource = db.prepare(
    'INSERT INTO sources (xref, title, publisher) VALUES (?, ?, ?)'
  );
  const nextOrder = db.prepare<{ n: number }, [number]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM citations
     WHERE scope_type = 'person' AND scope_id = ?`
  );
  const rowOf = db.prepare<
    { entryId: number | null; sourceId: number | null },
    [number]
  >(
    `SELECT entry_id AS entryId, source_id AS sourceId
     FROM ${CITATIONS_READ} WHERE id = ?`
  );
  const linkedVolume = db.prepare<
    { volumeId: string; volume: string; fileId: string | null },
    [number]
  >(
    `SELECT link_volume_id AS volumeId, link_volume AS volume,
       link_file_id AS fileId
     FROM ${CITATIONS_READ} WHERE id = ? AND link_volume_id IS NOT NULL`
  );
  // Its page becomes the Image's address in Astia, which it now cites.
  const adopt = db.prepare(
    `UPDATE citations SET source_id = ?, page = COALESCE(?, page), text = ?,
       event = ?, role = ?
     WHERE id = ?`
  );
  // The Entry a converted citation now cites takes where the reference
  // said it is (ADR-0039), its page number or its Event's date, unless
  // another's gave it or it was written there.
  const putBookPage = db.prepare(
    `UPDATE entries SET book_page = ?
     WHERE id = (SELECT entry_id FROM citations WHERE id = ?)
       AND book_page IS NULL`
  );
  const putDate = db.prepare(
    `UPDATE entries SET date = ?
     WHERE id = (SELECT entry_id FROM citations WHERE id = ?)
       AND date IS NULL`
  );
  const deleteNotes = db.prepare(
    "DELETE FROM notes WHERE owner_type = 'citation' AND owner_id = ?"
  );
  const deleteMedia = db.prepare(
    "DELETE FROM media_links WHERE scope_type = 'citation' AND scope_id = ?"
  );
  const deleteRow = db.prepare('DELETE FROM citations WHERE id = ?');
  const citedBy = db.prepare<{ id: number }, [number]>(
    `SELECT id FROM ${CITATIONS_READ} WHERE source_id = ? LIMIT 1`
  );
  const deleteSourceNotes = db.prepare(
    "DELETE FROM notes WHERE owner_type = 'source' AND owner_id = ?"
  );
  const deleteSource = db.prepare('DELETE FROM sources WHERE id = ?');

  // The xref the app gives the Volume's source first: one no MyHeritage
  // export gives, so it never clashes with an imported source's.
  function baseXref(volumeId: string) {
    return `@ASTIA_${volumeId.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}@`;
  }

  function newXref(volumeId: string) {
    const base = baseXref(volumeId);
    for (let n = 1; ; n += 1) {
      const xref = n === 1 ? base : `${base.slice(0, -1)}_${n}@`;
      if (xrefTaken.get(xref) === null) return xref;
    }
  }

  function convertNow(
    rows: Converting[],
    archiveOf: (volumeId: string) => string | null
  ) {
    db.transaction(() => {
      for (const { id, text, role } of rows) {
        const at = linkedVolume.get(id);
        if (at === null) continue;
        const source = sourceOf(at.volumeId, at.volume, archiveOf(at.volumeId));
        // MyHeritage's EVEN and ROLE, not GEDCOM's, give way (ADR-0016);
        // the Book gives the Event, as it gives a new Entry's first guess.
        const page =
          at.fileId === null ? null : viewerUrl(at.volumeId, at.fileId);
        adopt.run(source, page, text, bookEvent(at.volume), role, id);
      }
      // Every citation of the record, alike, then cites one Entry.
      gatherEntries(
        db,
        rows.map((r) => r.id)
      );
      for (const { id, bookPage, date } of rows) {
        if (bookPage !== null) putBookPage.run(bookPage, id);
        if (date !== null) putDate.run(date, id);
      }
    })();
  }

  function sourceOf(volumeId: string, volume: string, archive: string | null) {
    const title = volumeSourceTitle(volume, archive);
    const named = archive === null ? null : title;
    const known = volumeSource.get(baseXref(volumeId), named, PUBLISHER);
    if (known !== null) return known.id;
    const res = insertSource.run(newXref(volumeId), title, PUBLISHER);
    return Number(res.lastInsertRowid);
  }

  // Stores an Entry at the Box on an Image (ADR-0026), with its Volume's
  // source; its id.
  function entry(e: NewEntryAt) {
    return entries.create({
      sourceId: sourceOf(e.volumeId, e.volume, e.archive ?? null),
      page: viewerUrl(e.volumeId, e.fileId),
      event: e.event,
      text: e.text,
      volumeId: e.volumeId,
      volume: e.volume,
      image: e.image,
      fileId: e.fileId,
      box: e.box,
      fresh: e.fresh === true
    });
  }

  // Stores the person's Citation of the Entry, in their Role, after
  // their others; its id.
  function cite(entryId: number, personId: number, role: string | null) {
    return annotations.insert(
      {
        scopeType: 'person',
        scopeId: personId,
        sourceId: null,
        sortOrder: nextOrder.get(personId)!.n,
        page: null,
        event: null,
        role,
        quality: null,
        dataDate: null,
        text: null,
        entryId
      },
      { link: null }
    );
  }

  return {
    // Stores an Entry at the Box on an Image; its id.
    entry,
    // Stores the person's Citation of the Entry; its id.
    cite,

    // Stores the Citation, of a new Entry at the Box; its id.
    create(c: NewCitation) {
      const event = c.event === undefined ? bookEvent(c.volume) : c.event;
      return db.transaction(() =>
        cite(entry({ ...c, event }), c.personId, c.role ?? null)
      )();
    },

    // Makes each of the citations, a reference Marked at the entry, a
    // Citation of its Image (ADR-0016): it cites its Volume's source, its
    // text is the one given, and it's the app's. Its page, link and
    // original page stay as the Mark left them. Its source is named by the
    // archive `archiveOf` gives, when known (ADR-0019); the import knows
    // none, and finds the source by its xref.
    async convert(rows: Converting[], archiveOf?: ArchiveOf) {
      const archives = new Map<string, string | null>();
      for (const { id } of rows) {
        const at = linkedVolume.get(id);
        if (at === null || archives.has(at.volumeId)) continue;
        // eslint-disable-next-line no-await-in-loop -- one Volume at a time
        archives.set(at.volumeId, (await archiveOf?.(at.volumeId)) ?? null);
      }
      convertNow(rows, (volumeId) => archives.get(volumeId) ?? null);
    },

    // Deletes a Citation, imported or made in the app (ADR-0021), with its
    // notes and media links; a reference's Record pin goes with it. The
    // source of one made in the app goes too once nothing cites it; an
    // imported source is the tree's own, so it stays. False when there's no
    // such Citation.
    remove(id: number) {
      const row = rowOf.get(id);
      if (row === null) return false;
      db.transaction(() => {
        deleteNotes.run(id);
        deleteMedia.run(id);
        deleteRow.run(id);
        dropUncitedEntries(db);
        const { sourceId } = row;
        if (
          row.entryId !== null &&
          sourceId !== null &&
          citedBy.get(sourceId) === null
        ) {
          deleteSourceNotes.run(sourceId);
          deleteSource.run(sourceId);
        }
      })();
      return true;
    }
  };
}
