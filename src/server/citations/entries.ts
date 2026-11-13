// Entries (ADR-0026): one record written in a church book, on one Image
// with its Box, its Event and its Transcription, held once however many
// people's Citations cite it. Only the app's Citations of an Image cite
// one; a Church-book reference keeps its link on its citation until
// `citations/myheritage/` goes. Only this module and `annotations.ts` know
// which columns an Entry holds for its Citations.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import type { Box } from '@/common/types';

// A Citation's columns an Entry holds instead, by the Entry's name for
// each. A Citation of an Entry leaves them empty, but for its text when
// it says other than the Entry: a converted reference's names its person.
const HELD = [
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

// The app's Citations of an Image, not yet of an Entry: by hand, with a
// Box. Those alike in all an Entry holds are one.
const LOOSE = `added_in_app = 1 AND entry_id IS NULL AND link_by = 'hand'
  AND link_image IS NOT NULL AND link_file_id IS NOT NULL
  AND link_box_left IS NOT NULL`;

const ALIKE = HELD.map(([own, held]) => `e.${held} IS c.${own}`).join(' AND ');

// Makes the app's Citations of an Image each cite an Entry: one alike in
// all an Entry holds cites that one, the rest one Entry for each alike
// group, and the Entry's columns are emptied on them; then Entries of one
// entry are one (`mergeEntries`). Run by schema 6, the import and the
// Conversion.
export function gatherEntries(db: Database) {
  db.run(
    `INSERT INTO entries (${HELD.map(([, held]) => held).join(', ')})
     SELECT DISTINCT ${HELD.map(([own]) => own).join(', ')}
     FROM citations c WHERE ${LOOSE}
       AND NOT EXISTS (SELECT 1 FROM entries e WHERE ${ALIKE})`
  );
  db.run(
    `UPDATE citations AS c SET entry_id =
       (SELECT MIN(e.id) FROM entries e WHERE ${ALIKE})
     WHERE ${LOOSE}`
  );
  db.run(
    `UPDATE citations SET ${HELD.map(([own]) => `${own} = NULL`).join(', ')},
       link_by = NULL
     WHERE entry_id IS NOT NULL`
  );
  mergeEntries(db);
}

interface EntryRow {
  id: number;
  key: string;
  text: string | null;
  box: Box;
}

// How much two Boxes are one: their overlap over all they cover, 0 to 1.
export function overlapOf(a: Box, b: Box) {
  const w =
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  const both = w * h;
  return both / (a.width * a.height + b.width * b.height - both);
}

// Boxes this much one are drawn round the same entry.
const SAME_ENTRY = 0.6;

// Makes Entries of one entry one (ADR-0026): those of a source, page and
// Event on one Image whose Boxes mostly overlap, drawn apart for each
// person before, or alike but in what they say. The first made keeps its
// Box and words; a Citation of another keeps that one's words as its own
// when they differ.
export function mergeEntries(db: Database) {
  const rows = db
    .query<EntryRow & Box, []>(
      `SELECT id, json_array(source_id, page, event, volume_id, image,
         file_id) AS key, text, box_left AS left, box_top AS top,
         box_width AS width, box_height AS height
       FROM entries ORDER BY id`
    )
    .all();
  const keepers = new Map<string, EntryRow[]>();
  const ownText = db.prepare(
    'UPDATE citations SET text = ? WHERE entry_id = ? AND text IS NULL'
  );
  const move = db.prepare(
    'UPDATE citations SET entry_id = ? WHERE entry_id = ?'
  );
  const drop = db.prepare('DELETE FROM entries WHERE id = ?');
  for (const { id, key, text, left, top, width, height } of rows) {
    const box = { left, top, width, height };
    const kept = keepers.get(key) ?? [];
    const keeper = kept.find((k) => overlapOf(k.box, box) >= SAME_ENTRY);
    if (keeper === undefined) {
      keepers.set(key, [...kept, { id, key, text, box }]);
      continue;
    }
    if (text !== keeper.text) ownText.run(text, id);
    move.run(keeper.id, id);
    drop.run(id);
  }
}

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
  const placeOf = db.prepare<
    { volumeId: string; volume: string; image: number; fileId: string },
    [number]
  >(
    `SELECT volume_id AS volumeId, volume, image, file_id AS fileId
     FROM entries WHERE id = ?`
  );
  const ofCitation = db.prepare<{ id: number }, [number]>(
    'SELECT entry_id AS id FROM citations WHERE id = ? AND entry_id IS NOT NULL'
  );
  const transcribe = db.prepare('UPDATE entries SET text = ? WHERE id = ?');
  const ownWords = db.prepare(
    'UPDATE citations SET text = NULL WHERE entry_id = ?'
  );
  const citing = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM citations WHERE entry_id = ? ORDER BY id'
  );

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

    // Where the Entry is written: its Volume, by id and label, and its
    // Image; null when there's no such Entry.
    placeOf(id: number) {
      return placeOf.get(id);
    },

    // The Entry the Citation cites, or null for one that cites none.
    ofCitation(citationId: number) {
      return ofCitation.get(citationId)?.id ?? null;
    },

    // Its Citations' ids, in the order they were made.
    citationsOf(id: number) {
      return citing.all(id).map((c) => c.id);
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
