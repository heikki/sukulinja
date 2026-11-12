// Changing a person: their name and sex. Only the first name is changed;
// more names are a later feature. Each is a Change on the person, and
// brings their CHAN up to now.

import type { Database } from 'bun:sqlite';

import type { NewChange, PersonName } from '@/common/types';

import { touchRecord } from '../datasets/records';
import { gedcomName, plainName, refusedName } from './names';

export type PersonAnswer = { id: number } | { rejected: string } | null;

interface NameRecord {
  id: number;
  full_text: string;
  given: string | null;
  surname: string | null;
  suffix: string | null;
}

const SEX_WORDS: Record<string, string> = {
  M: 'male',
  F: 'female',
  X: 'other'
};

// A name and sex as a Change reads them: "Matti Virtanen, male".
function nameWords(fullText: string, sex: string | null) {
  const name = plainName(fullText);
  const word = sex === null ? undefined : SEX_WORDS[sex];
  return word === undefined ? name : `${name}, ${word}`;
}

// Whether the name and sex are what they were.
function unchanged(
  before: NameRecord | null,
  sex: string | null,
  name: PersonName
) {
  return (
    (before?.given ?? '') === name.given &&
    (before?.surname ?? '') === name.surname &&
    sex === name.sex
  );
}

export function createPersons(
  db: Database,
  changed: (change: NewChange) => void
) {
  const sexOf = db.prepare<{ sex: string | null }, [number]>(
    'SELECT sex FROM persons WHERE id = ?'
  );
  const firstName = db.prepare<NameRecord, [number]>(
    `SELECT id, full_text, given, surname, suffix FROM names
     WHERE person_id = ? ORDER BY sort_order, id LIMIT 1`
  );
  const setSex = db.prepare<null, [string, number]>(
    'UPDATE persons SET sex = ? WHERE id = ?'
  );
  const setName = db.prepare<
    null,
    [string, string | null, string | null, number]
  >('UPDATE names SET full_text = ?, given = ?, surname = ? WHERE id = ?');
  const insertName = db.prepare<
    null,
    [number, string, string | null, string | null]
  >(
    `INSERT INTO names (person_id, full_text, given, surname, sort_order)
     VALUES (?, ?, ?, ?, 0)`
  );
  // The given name and surname pieces an import kept say what the name
  // does, so they follow it; none is added where there was none.
  const setPiece = db.prepare<null, [string, number, string]>(
    'UPDATE name_pieces SET value = ? WHERE name_id = ? AND tag = ?'
  );
  const dropPiece = db.prepare<null, [number, string]>(
    'DELETE FROM name_pieces WHERE name_id = ? AND tag = ?'
  );

  function piece(nameId: number, tag: string, value: string | null) {
    if (value === null) dropPiece.run(nameId, tag);
    else setPiece.run(value, nameId, tag);
  }

  // Writes the person's first name, keeping a suffix it had, or gives them
  // one when they had none.
  function writeName(personId: number, given: string, surname: string) {
    const name = firstName.get(personId);
    const g = given === '' ? null : given;
    const s = surname === '' ? null : surname;
    if (name === null) {
      insertName.run(personId, gedcomName(given, surname), g, s);
      return;
    }
    const suffix = name.suffix === null ? '' : ` ${name.suffix}`;
    setName.run(`${gedcomName(given, surname)}${suffix}`, g, s, name.id);
    piece(name.id, 'GIVN', g);
    piece(name.id, 'SURN', s);
  }

  return {
    // Changes the person's name and sex. Null when there's no such person.
    edit(personId: number, name: PersonName): PersonAnswer {
      const person = sexOf.get(personId);
      if (person === null) return null;
      const refused = refusedName(name);
      if (refused !== null) return refused;
      const given = name.given.trim();
      const surname = name.surname.trim();
      const before = firstName.get(personId);
      const was = nameWords(before?.full_text ?? '', person.sex);
      const now = nameWords(gedcomName(given, surname), name.sex);
      if (unchanged(before, person.sex, { ...name, given, surname })) {
        return { id: personId };
      }
      db.transaction(() => {
        writeName(personId, given, surname);
        setSex.run(name.sex, personId);
        touchRecord(db, { table: 'persons', id: personId });
        changed({
          on: { personId },
          what: { kind: 'person', did: 'edit', was, now }
        });
      })();
      return { id: personId };
    }
  };
}

export type Persons = ReturnType<typeof createPersons>;
