// Some of a dataset's people as a GEDZIP of their own, for a new dataset:
// the dataset copied aside, everyone else deleted from the copy as a
// deletion takes a person (records.ts), and what no one left holds swept
// out, then the copy exported as any dataset is (ADR-0013). So the new
// dataset holds what an export carries: the people, the families among
// them, their Facts, Citations, sources, Entries and Marks, and their
// photos, with no one else's Tags; not the Reminders or the Changes.

import type { Database } from 'bun:sqlite';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { membersOf, together } from '@/common/tree-cut';
import type { FamilyRow } from '@/common/types';

import { packDataset } from '../export/dataset';
import { createTree } from '../tree';
import { openDb } from './db';
import { deleteCitations, deleteFamily, deletePersonHeld } from './records';

// The ids a query lists.
function idsOf(db: Database, sql: string) {
  return new Set(
    db
      .query<{ id: number }, []>(sql)
      .all()
      .map((r) => r.id)
  );
}

// What no one holds: shared notes no note points at; sources no Citation
// or Entry cites; repositories no source is in; media nothing links. Each
// by the query listing it.
const UNUSED = {
  shared_notes: `SELECT id FROM shared_notes WHERE id NOT IN
    (SELECT shared_note_id FROM notes WHERE shared_note_id IS NOT NULL)`,
  sources: `SELECT id FROM sources WHERE
    id NOT IN (SELECT source_id FROM citations WHERE source_id IS NOT NULL)
    AND id NOT IN (SELECT source_id FROM entries WHERE source_id IS NOT NULL)`,
  repositories: `SELECT id FROM repositories WHERE id NOT IN
    (SELECT repository_id FROM source_repositories)`,
  media:
    'SELECT id FROM media WHERE id NOT IN (SELECT media_id FROM media_links)'
};

type Held = keyof typeof UNUSED;

// Deletes what only the people deleted held, with what it held in turn:
// a source's notes, a note's or a shared note's Citations. Again until
// nothing more goes, as a source gone can leave a shared note unused, and
// a shared note gone a source. What no one held before stays, as an
// export of the whole dataset would write it. Whether any went.
function sweepOnce(db: Database, before: Map<Held, Set<number>>) {
  function gone(record: Held) {
    const was = before.get(record)!;
    return [...idsOf(db, UNUSED[record])].filter((id) => !was.has(id));
  }
  const sources = gone('sources');
  for (const id of sources) {
    const notes = db
      .query<{ id: number }, [number]>(
        "SELECT id FROM notes WHERE owner_type = 'source' AND owner_id = ?"
      )
      .all(id);
    for (const n of notes) deleteCitations(db, 'note', n.id);
    db.run("DELETE FROM notes WHERE owner_type = 'source' AND owner_id = ?", [
      id
    ]);
    db.run('DELETE FROM sources WHERE id = ?', [id]);
  }
  const sharedNotes = gone('shared_notes');
  for (const id of sharedNotes) {
    deleteCitations(db, 'shared_note', id);
    db.run('DELETE FROM shared_notes WHERE id = ?', [id]);
  }
  return sources.length + sharedNotes.length > 0;
}

function sweep(db: Database, before: Map<Held, Set<number>>) {
  while (sweepOnce(db, before));
  for (const id of [...idsOf(db, UNUSED.repositories)]) {
    if (!before.get('repositories')!.has(id)) {
      db.run('DELETE FROM repositories WHERE id = ?', [id]);
    }
  }
  for (const id of [...idsOf(db, UNUSED.media)]) {
    if (!before.get('media')!.has(id)) {
      db.run('DELETE FROM media WHERE id = ?', [id]);
    }
  }
}

// Deletes everyone but `keep` from the copy, as a deletion takes a person:
// a family they were in goes when fewer than two of its members are left
// (membership.ts), and so does what only they held.
function prune(db: Database, keep: ReadonlySet<number>) {
  const ids = [...idsOf(db, 'SELECT id FROM persons')].filter(
    (id) => !keep.has(id)
  );
  const before = new Map(
    Object.entries(UNUSED).map(([record, sql]) => [
      record as Held,
      idsOf(db, sql)
    ])
  );
  db.transaction(() => {
    const touched = new Set<number>();
    for (const f of createTree(db).families()) {
      if (membersOf(f).some((id) => !keep.has(id))) touched.add(f.id);
    }
    for (const id of ids) {
      deletePersonHeld(db, id);
      // Their places in families go with them: a parent's is set to null,
      // a child's deleted.
      db.run('DELETE FROM persons WHERE id = ?', [id]);
    }
    for (const f of createTree(db).families()) {
      if (touched.has(f.id) && membersOf(f).length < 2) deleteFamily(db, f.id);
    }
    sweep(db, before);
  })();
}

// The people of the dataset as a GEDZIP, its media read from `mediaDir`;
// the copy is made at `scratch`, a path no file has, and removed after.
export async function packPeople(
  db: Database,
  mediaDir: string,
  personIds: readonly number[],
  scratch: string
) {
  const path = join(scratch, 'copy.sqlite');
  db.run(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  const copy = openDb(path);
  try {
    prune(copy, new Set(personIds));
    return await packDataset(copy, mediaDir);
  } finally {
    copy.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

// Why the people can't be copied as a dataset: one isn't in the tree, or
// they aren't one tree; null when they can.
export function copyRefused(
  tree: { persons: () => Array<{ id: number }>; families: () => FamilyRow[] },
  personIds: readonly number[]
) {
  const there = new Set(tree.persons().map((p) => p.id));
  if (personIds.length === 0) return 'No one to copy.';
  if (personIds.some((id) => !there.has(id))) return 'No such person.';
  if (!together(tree.families(), [...personIds])) {
    return "They aren't one tree: someone would be cut off from the rest.";
  }
  return null;
}
