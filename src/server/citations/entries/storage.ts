// Where an Entry (ADR-0026) is stored: its own row, with its Box, its Event
// and its Transcription, held once however many people's Citations cite
// it. Only this folder and `annotations.ts` know which columns an Entry
// holds for its Citations.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import type { Box } from '@/common/types';

// A Citation's columns an Entry holds instead, by the Entry's name for
// each. A Citation of an Entry leaves them empty, but for its text when
// it says other than the Entry: a converted reference's names its person.
export const HELD = [
  ['source_id', 'source_id'],
  ['page', 'page'],
  ['event', 'event'],
  ['text', 'text'],
  ['link_volume_id', 'volume_id'],
  ['link_volume', 'volume'],
  ['link_image', 'image'],
  ['link_file_id', 'file_id'],
  ['link_box_left', 'box_left'],
  ['link_box_top', 'box_top'],
  ['link_box_width', 'box_width'],
  ['link_box_height', 'box_height']
] as const;

const OWN = [
  'id',
  'scope_type',
  'scope_id',
  'role',
  'quality',
  'data_date',
  'original_page',
  'added_in_app',
  'sort_order',
  'entry_id'
] as const;

// The citations table as it reads: each Citation of an Entry with the
// Entry's columns in its own, but for a text of its own, and its Box drawn
// by hand. For a query's
// FROM in place of `citations`; only writes name the table itself.
export const CITATIONS_READ = `(SELECT ${OWN.map((c) => `c.${c}`).join(', ')},
  ${HELD.map(([own, held]) =>
    own === 'text'
      ? `CASE WHEN e.id IS NULL THEN c.text ELSE COALESCE(c.text, e.text) END AS text`
      : `CASE WHEN e.id IS NULL THEN c.${own} ELSE e.${held} END AS ${own}`
  ).join(',\n  ')},
  CASE WHEN e.id IS NULL THEN c.link_by ELSE 'hand' END AS link_by
  FROM citations c LEFT JOIN entries e ON e.id = c.entry_id)`;

// Removes the Entries no Citation cites any more: removing the last of an
// Entry's Citations removes it.
export function dropUncitedEntries(db: Database) {
  db.run(
    `DELETE FROM entries WHERE id NOT IN
       (SELECT entry_id FROM citations WHERE entry_id IS NOT NULL)`
  );
}

// What an Entry holds: where it's cited from and what it says, and where
// it's written.
export interface NewEntry {
  sourceId: number;
  page: string;
  event: string | null;
  text: string | null;
  volumeId: string;
  volume: string;
  image: number;
  fileId: string;
  box: Box;
}

// An Entry as stored: where it's written, and the Event it records.
export interface StoredEntry {
  volumeId: string;
  volume: string;
  image: number;
  fileId: string;
  box: Box;
  event: string | null;
}

// A person's Citation of an Entry: who they are in it, and what it says
// for them, the Entry's words unless it has its own.
export interface EntryCitation {
  id: number;
  personId: number;
  role: string | null;
  text: string | null;
}

export function openEntries(db: Database) {
  const insert = db.prepare(
    `INSERT INTO entries (source_id, page, event, text, volume_id, volume,
       image, file_id, box_left, box_top, box_width, box_height)
     VALUES ($sourceId, $page, $event, $text, $volumeId, $volume, $image,
       $fileId, $left, $top, $width, $height)`
  );
  const alike = db.prepare<{ id: number }, SQLQueryBindings>(
    `SELECT id FROM entries WHERE source_id IS $sourceId AND page IS $page
       AND event IS $event AND text IS $text AND volume_id = $volumeId
       AND volume = $volume AND image = $image AND file_id = $fileId
       AND box_left = $left AND box_top = $top AND box_width = $width
       AND box_height = $height
     ORDER BY id LIMIT 1`
  );
  const relocate = db.prepare(
    `UPDATE entries SET page = $page, volume_id = $volumeId,
       volume = $volume, image = $image, file_id = $fileId,
       box_left = $left, box_top = $top, box_width = $width,
       box_height = $height
     WHERE id = $id`
  );
  const entryOf = db.prepare<Omit<StoredEntry, 'box'> & Box, [number]>(
    `SELECT volume_id AS volumeId, volume, image, file_id AS fileId, event,
       box_left AS left, box_top AS top, box_width AS width,
       box_height AS height
     FROM entries WHERE id = ?`
  );
  const ofCitation = db.prepare<{ id: number }, [number]>(
    'SELECT entry_id AS id FROM citations WHERE id = ? AND entry_id IS NOT NULL'
  );
  const transcribe = db.prepare('UPDATE entries SET text = ? WHERE id = ?');
  const ownWords = db.prepare(
    'UPDATE citations SET text = NULL WHERE entry_id = ?'
  );
  const citing = db.prepare<EntryCitation, [number]>(
    `SELECT c.id, c.scope_id AS personId, c.role,
       COALESCE(c.text, e.text) AS text
     FROM citations c JOIN entries e ON e.id = c.entry_id
     WHERE c.entry_id = ? ORDER BY c.id`
  );
  const setRole = db.prepare('UPDATE citations SET role = ? WHERE id = ?');

  function boxParams(box: Box) {
    return {
      $left: box.left,
      $top: box.top,
      $width: box.width,
      $height: box.height
    };
  }

  return {
    // Stores the Entry, or finds the one alike in all it holds, as
    // `gatherEntries` makes them one; its id.
    create(e: NewEntry) {
      const params = {
        $sourceId: e.sourceId,
        $page: e.page,
        $event: e.event,
        $text: e.text,
        $volumeId: e.volumeId,
        $volume: e.volume,
        $image: e.image,
        $fileId: e.fileId,
        ...boxParams(e.box)
      };
      const known = alike.get(params);
      if (known !== null) return known.id;
      return Number(insert.run(params).lastInsertRowid);
    },

    // Where the Entry is written, its Box and the Event it records; null
    // when there's no such Entry.
    entryOf(id: number) {
      const row = entryOf.get(id);
      if (row === null) return null;
      const { left, top, width, height, ...rest } = row;
      const entry: StoredEntry = { ...rest, box: { left, top, width, height } };
      return entry;
    },

    // The Entry the Citation cites, or null for one that cites none.
    ofCitation(citationId: number) {
      return ofCitation.get(citationId)?.id ?? null;
    },

    // Its Citations, in the order they were made, each with what it says.
    citationsOf(id: number) {
      return citing.all(id);
    },

    // The person's Role in the Entry their Citation cites.
    setRole(citationId: number, role: string | null) {
      setRole.run(role, citationId);
    },

    // Puts what the Entry says, for every Citation of it: none keeps
    // words of its own.
    setText(id: number, text: string | null) {
      transcribe.run(text, id);
      ownWords.run(id);
    },

    // Moves the Entry to another place in its Volume, for every Citation of
    // it: the Image, its address and the Box.
    move(id: number, to: Omit<NewEntry, 'sourceId' | 'event' | 'text'>) {
      relocate.run({
        $id: id,
        $page: to.page,
        $volumeId: to.volumeId,
        $volume: to.volume,
        $image: to.image,
        $fileId: to.fileId,
        ...boxParams(to.box)
      });
    }
  };
}
