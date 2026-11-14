// Schema 7 (ADR-0026): Entries of one entry are one. Schema 6 left apart
// the Citations of one entry whose words differed, as converted references
// name their person, or whose Boxes were drawn apart for each person:
// those of a source, page and Event on one Image whose Boxes mostly
// overlap. The first made keeps its Box and words; a Citation of another
// keeps that one's words as its own when they differ.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface EntryRow {
  id: number;
  key: string;
  text: string | null;
  box: Box;
}

// How much two Boxes are one: their overlap over all they cover, 0 to 1.
function overlapOf(a: Box, b: Box) {
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

function up(db: Database) {
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

export const ENTRIES_OF_ONE_ENTRY_MERGE: Migration = { to: 7, up };
