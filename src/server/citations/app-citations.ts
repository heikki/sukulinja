// Citations made in the app, on an Astia Image: storing and deleting one,
// with the source record of the Volume it's in. A Volume's source is known
// by its own record, the xref the app gave it or its title and publisher;
// nothing marks the source itself as the app's.

import type { Database } from 'bun:sqlite';

import type { Box } from '@/common/types';

import { openAnnotations } from './annotations';
import { viewerUrl } from './astia/astia';

// Who publishes every Volume, and where.
export const PUBLISHER = 'Kansallisarkisto, Astia';

// A Volume's source's title: its archive's, then its label, as an archive's
// book is cited (ADR-0019); the label alone where the archive isn't known.
export function volumeSourceTitle(volume: string, archive: string | null) {
  return archive === null ? volume : `${archive}, ${volume}`;
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
}

// A Volume's archive title, or null when it isn't known.
type ArchiveOf = (volumeId: string) => Promise<string | null>;

export function openAppCitations(db: Database) {
  const annotations = openAnnotations(db);
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
  // The Volume sources the app made, each with a Volume its Citations of
  // Images are in.
  const volumeSources = db.prepare<
    { id: number; title: string | null; volumeId: string; volume: string },
    [string]
  >(
    `SELECT s.id, s.title, c.link_volume_id AS volumeId,
       c.link_volume AS volume
     FROM sources s JOIN citations c ON c.source_id = s.id
     WHERE s.publisher = ? AND c.added_in_app = 1
       AND c.link_volume_id IS NOT NULL
     GROUP BY s.id ORDER BY s.id`
  );
  const retitle = db.prepare('UPDATE sources SET title = ? WHERE id = ?');
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
    { madeInApp: number; sourceId: number | null; originalPage: string | null },
    [number]
  >(
    `SELECT added_in_app AS madeInApp, source_id AS sourceId,
       original_page AS originalPage FROM citations WHERE id = ?`
  );
  const linkedVolume = db.prepare<
    { volumeId: string; volume: string },
    [number]
  >(
    `SELECT link_volume_id AS volumeId, link_volume AS volume FROM citations
     WHERE id = ? AND link_volume_id IS NOT NULL`
  );
  const adopt = db.prepare(
    'UPDATE citations SET source_id = ?, text = ?, added_in_app = 1 WHERE id = ?'
  );
  const deleteNotes = db.prepare(
    "DELETE FROM notes WHERE owner_type = 'citation' AND owner_id = ?"
  );
  const deleteMedia = db.prepare(
    "DELETE FROM media_links WHERE scope_type = 'citation' AND scope_id = ?"
  );
  const deleteRow = db.prepare('DELETE FROM citations WHERE id = ?');
  const citedBy = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM citations WHERE source_id = ? LIMIT 1'
  );
  const deleteSourceNotes = db.prepare(
    "DELETE FROM notes WHERE owner_type = 'source' AND owner_id = ?"
  );
  const deleteSource = db.prepare('DELETE FROM sources WHERE id = ?');

  // The xref the app gives the Volume's source first: one no MyHeritage
  // export gives, so a re-import never takes another source for it.
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
    rows: Array<{ id: number; text: string | null }>,
    archiveOf: (volumeId: string) => string | null
  ) {
    db.transaction(() => {
      for (const { id, text } of rows) {
        const at = linkedVolume.get(id);
        if (at === null) continue;
        const archive = archiveOf(at.volumeId);
        adopt.run(sourceOf(at.volumeId, at.volume, archive), text, id);
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

  return {
    // Stores the Citation; its id.
    create(c: NewCitation) {
      return db.transaction(() =>
        annotations.insert(
          {
            scopeType: 'person',
            scopeId: c.personId,
            sourceId: sourceOf(c.volumeId, c.volume, c.archive ?? null),
            sortOrder: nextOrder.get(c.personId)!.n,
            page: viewerUrl(c.volumeId, c.fileId),
            event: null,
            role: null,
            quality: null,
            dataDate: null,
            text: c.text
          },
          {
            link: {
              volumeId: c.volumeId,
              volume: c.volume,
              image: c.image,
              fileId: c.fileId,
              box: c.box,
              by: 'hand'
            },
            originalPage: null,
            madeInApp: true
          }
        )
      )();
    },

    // Moves a Citation of an Image to another entry in its Volume: its
    // link, and the Image's address it cites.
    move(id: number, to: Omit<NewCitation, 'personId' | 'text' | 'archive'>) {
      const { volumeId, volume, image, fileId, box } = to;
      annotations.carry(id, {
        page: viewerUrl(volumeId, fileId),
        annotation: {
          link: { volumeId, volume, image, fileId, box, by: 'hand' },
          originalPage: null,
          madeInApp: true
        }
      });
    },

    // Makes each of the citations, a reference Marked at the entry, a
    // Citation of its Image (ADR-0016): it cites its Volume's source, its
    // text is the one given, and it's the app's. Its page, link and
    // original page stay as the Mark left them. Its source is named by the
    // archive `archiveOf` gives, when known (ADR-0019); the import knows
    // none, and finds the source by its xref.
    async convert(
      rows: Array<{ id: number; text: string | null }>,
      archiveOf?: ArchiveOf
    ) {
      const archives = new Map<string, string | null>();
      for (const { id } of rows) {
        const at = linkedVolume.get(id);
        if (at === null || archives.has(at.volumeId)) continue;
        // eslint-disable-next-line no-await-in-loop -- one Volume at a time
        archives.set(at.volumeId, (await archiveOf?.(at.volumeId)) ?? null);
      }
      convertNow(rows, (volumeId) => archives.get(volumeId) ?? null);
    },

    // The same, at once, knowing no archive: for the import's merge.
    convertNow(rows: Array<{ id: number; text: string | null }>) {
      convertNow(rows, () => null);
    },

    // Titles each Volume source the app made with its archive, where
    // `archiveOf` says which (ADR-0019): what was retitled, from and to.
    // Again, none.
    async retitleVolumeSources(archiveOf: ArchiveOf) {
      const done: Array<{ from: string | null; to: string }> = [];
      for (const s of volumeSources.all(PUBLISHER)) {
        // eslint-disable-next-line no-await-in-loop -- one Volume at a time
        const archive = await archiveOf(s.volumeId);
        if (archive === null) continue;
        const to = volumeSourceTitle(s.volume, archive);
        if (s.title === to) continue;
        retitle.run(to, s.id);
        done.push({ from: s.title, to });
      }
      return done;
    },

    // Deletes a Citation made in the app, with its notes, and its source
    // once nothing cites it. Null when there's no such Citation; false for
    // an imported one, which isn't deleted, nor one converted from a
    // reference (ADR-0016), which the next import would bring back.
    remove(id: number) {
      const row = rowOf.get(id);
      if (row === null) return null;
      if (row.madeInApp !== 1 || row.originalPage !== null) return false;
      db.transaction(() => {
        deleteNotes.run(id);
        deleteMedia.run(id);
        deleteRow.run(id);
        const { sourceId } = row;
        if (sourceId !== null && citedBy.get(sourceId) === null) {
          deleteSourceNotes.run(sourceId);
          deleteSource.run(sourceId);
        }
      })();
      return true;
    }
  };
}
