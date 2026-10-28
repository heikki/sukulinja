// Citations made in the app, on an Astia Image: storing and deleting one,
// with the source record of the Volume it's in. A Volume's source is the
// one the Citations made in the app whose link is in that Volume cite;
// nothing marks the source itself as the app's.

import type { Database } from 'bun:sqlite';

import type { Box } from '@/common/types';

import { openAnnotations } from './annotations';
import { viewerUrl } from './astia/astia';

// Who publishes every Volume, and where.
const PUBLISHER = 'Kansallisarkisto, Astia';

// A Citation of the entry at the Box on an Image, for the person.
interface NewCitation {
  personId: number;
  volumeId: string;
  // The Volume's label, which titles its source.
  volume: string;
  image: number;
  fileId: string;
  box: Box;
  text: string | null;
}

export function openAppCitations(db: Database) {
  const annotations = openAnnotations(db);
  // Only a Citation of an Image cites the Volume's source: one made in the
  // app of another source's reference, such as a MyHeritage entry, keeps the
  // page a Mark moved aside.
  const volumeSource = db.prepare<{ id: number }, [string]>(
    `SELECT source_id AS id FROM citations
     WHERE added_in_app = 1 AND link_volume_id = ? AND source_id IS NOT NULL
       AND original_page IS NULL
     ORDER BY id LIMIT 1`
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
    { madeInApp: number; sourceId: number | null },
    [number]
  >(
    'SELECT added_in_app AS madeInApp, source_id AS sourceId FROM citations WHERE id = ?'
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

  // An xref no MyHeritage export gives, so a re-import never takes another
  // source for it.
  function newXref(volumeId: string) {
    const base = `ASTIA_${volumeId.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}`;
    for (let n = 1; ; n += 1) {
      const xref = n === 1 ? `@${base}@` : `@${base}_${n}@`;
      if (xrefTaken.get(xref) === null) return xref;
    }
  }

  function sourceOf(volumeId: string, volume: string) {
    const known = volumeSource.get(volumeId);
    if (known !== null) return known.id;
    const res = insertSource.run(newXref(volumeId), volume, PUBLISHER);
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
            sourceId: sourceOf(c.volumeId, c.volume),
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
    move(id: number, to: Omit<NewCitation, 'personId' | 'text'>) {
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

    // Deletes a Citation made in the app, with its notes, and its source
    // once nothing cites it. Null when there's no such Citation; false for
    // an imported one, which isn't deleted.
    remove(id: number) {
      const row = rowOf.get(id);
      if (row === null) return null;
      if (row.madeInApp !== 1) return false;
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
