// What every change to the tree's records needs, whichever record it is:
// the record's `CHAN` brought up to now, and what a record holds removed
// with it. The holders are named by `scope_type` or `owner_type`, with no
// foreign key, so they're only ever removed here.

import type { Database } from 'bun:sqlite';

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');

function two(n: number) {
  return String(n).padStart(2, '0');
}

// Now as GEDCOM's CHAN writes it: "11 NOV 2026" and "21:51:02".
export function changeStamp(now = new Date()) {
  return {
    date: `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    time: `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
  };
}

// Says the person or family was changed now, in their CHAN.
export function touchRecord(
  db: Database,
  record: { table: 'persons' | 'families'; id: number },
  now = new Date()
) {
  const { date, time } = changeStamp(now);
  db.run(
    `UPDATE ${record.table} SET change_date = ?, change_time = ? WHERE id = ?`,
    [date, time, record.id]
  );
}

// Removes what a Fact's place holds: its notes. Its coordinates are on the
// Fact's row.
export function deletePlaceHeld(db: Database, owner: { fact: number }) {
  db.run("DELETE FROM notes WHERE owner_type = 'place' AND owner_id = ?", [
    owner.fact
  ]);
}

// Removes the notes, media links (and their notes), place notes and address
// a Fact holds. Its Citations are its owner's, and their support of it
// goes with the Fact's row (ADR-0022).
export function deleteHeld(db: Database, owner: { fact: number }) {
  const id = owner.fact;
  deletePlaceHeld(db, owner);
  db.run(
    `DELETE FROM notes WHERE owner_type = 'media_link' AND owner_id IN
       (SELECT id FROM media_links WHERE scope_type = 'fact' AND scope_id = ?)`,
    [id]
  );
  db.run("DELETE FROM media_links WHERE scope_type = 'fact' AND scope_id = ?", [
    id
  ]);
  db.run("DELETE FROM notes WHERE owner_type = 'fact' AND owner_id = ?", [id]);
  db.run("DELETE FROM addresses WHERE owner_type = 'fact' AND owner_id = ?", [
    id
  ]);
}

type Holder = 'person' | 'family' | 'fact' | 'name' | 'citation';

// Removes the notes on the owner, with their Citations.
function deleteNotes(db: Database, owner: string, id: number) {
  db.run(
    `DELETE FROM citations WHERE scope_type = 'note' AND scope_id IN
       (SELECT id FROM notes WHERE owner_type = ? AND owner_id = ?)`,
    [owner, id]
  );
  db.run('DELETE FROM notes WHERE owner_type = ? AND owner_id = ?', [
    owner,
    id
  ]);
}

// Removes the media links on the holder, and their notes.
function deleteMediaLinks(db: Database, scope: Holder, id: number) {
  db.run(
    `DELETE FROM notes WHERE owner_type = 'media_link' AND owner_id IN
       (SELECT id FROM media_links WHERE scope_type = ? AND scope_id = ?)`,
    [scope, id]
  );
  db.run('DELETE FROM media_links WHERE scope_type = ? AND scope_id = ?', [
    scope,
    id
  ]);
}

// Removes the Citations on the holder, with their notes and media links.
export function deleteCitations(db: Database, scope: Holder, id: number) {
  const ids = db
    .query<{ id: number }, [string, number]>(
      'SELECT id FROM citations WHERE scope_type = ? AND scope_id = ?'
    )
    .all(scope, id);
  for (const c of ids) {
    deleteNotes(db, 'citation', c.id);
    deleteMediaLinks(db, 'citation', c.id);
  }
  db.run('DELETE FROM citations WHERE scope_type = ? AND scope_id = ?', [
    scope,
    id
  ]);
}

// Removes the Facts on the person or family, with all each holds.
function deleteFacts(db: Database, scope: 'person' | 'family', id: number) {
  const ids = db
    .query<{ id: number }, [string, number]>(
      'SELECT id FROM facts WHERE scope_type = ? AND scope_id = ?'
    )
    .all(scope, id);
  for (const f of ids) {
    deleteHeld(db, { fact: f.id });
    deleteCitations(db, 'fact', f.id);
  }
  db.run('DELETE FROM facts WHERE scope_type = ? AND scope_id = ?', [
    scope,
    id
  ]);
}

// Removes a person's own: their names (with what each holds), Facts,
// Citations, notes and media links, Tags among them. Their places in
// families are the caller's, who says what becomes of the families.
export function deletePersonHeld(db: Database, id: number) {
  const names = db
    .query<{ id: number }, [number]>('SELECT id FROM names WHERE person_id = ?')
    .all(id);
  for (const n of names) {
    deleteCitations(db, 'name', n.id);
    deleteNotes(db, 'name', n.id);
  }
  db.run('DELETE FROM names WHERE person_id = ?', [id]);
  deleteFacts(db, 'person', id);
  deleteCitations(db, 'person', id);
  deleteMediaLinks(db, 'person', id);
  deleteNotes(db, 'person', id);
  const associations = db
    .query<{ id: number }, [number]>(
      'SELECT id FROM associations WHERE person_id = ?1 OR associate_id = ?1'
    )
    .all(id);
  for (const a of associations) deleteNotes(db, 'association', a.id);
  db.run('DELETE FROM associations WHERE person_id = ?1 OR associate_id = ?1', [
    id
  ]);
}

// Removes a family and all it holds: its Facts, Citations, notes and
// media links, and its places for its members, who stay.
export function deleteFamily(db: Database, id: number) {
  deleteFacts(db, 'family', id);
  deleteCitations(db, 'family', id);
  deleteMediaLinks(db, 'family', id);
  deleteNotes(db, 'family', id);
  db.run('DELETE FROM family_children WHERE family_id = ?', [id]);
  db.run('DELETE FROM families WHERE id = ?', [id]);
}
