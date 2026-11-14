// Gathering the app's Citations of an Image into Entries (ADR-0026), and
// making Entries of one entry one: run by schema 6, the import and the
// Conversion.

import type { Database } from 'bun:sqlite';

import type { Box } from '@/common/types';

import { placeEntryRoles } from './roles';
import { HELD } from './storage';

// The app's Citations of an Image, not yet of an Entry: by hand, with a
// Box. Those alike in all an Entry holds are one.
const LOOSE = `added_in_app = 1 AND entry_id IS NULL AND link_by = 'hand'
  AND link_image IS NOT NULL AND link_file_id IS NOT NULL
  AND link_box_left IS NOT NULL`;

const ALIKE = HELD.map(([own, held]) => `e.${held} IS c.${own}`).join(' AND ');

// Makes the app's Citations of an Image each cite an Entry: one alike in
// all an Entry holds cites that one, the rest one Entry for each alike
// group, and the Entry's columns are emptied on them; then Entries of one
// entry are one (`mergeEntries`), and a baptism's people are placed in
// its Roles (`placeEntryRoles`). Run by schema 6, the import and the
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
  placeEntryRoles(db);
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
