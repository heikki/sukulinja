// Making a person or family record in the app: a new xref past every one an
// import gave, a new UID (ADR-0013), and the record's CHAN set to now.

import type { Database } from 'bun:sqlite';

import type { Sex } from '@/common/types';

import { touchRecord } from '../datasets/records';
import { gedcomName } from './names';

type Table = 'persons' | 'families';

const LETTER: Record<Table, string> = { persons: 'I', families: 'F' };

// `@I<n>@` or `@F<n>@`, n one past the largest a record of the table has,
// so it can't be one an import gave.
function nextXref(db: Database, table: Table) {
  const letter = LETTER[table];
  const row = db
    .query<{ last: number | null }, [string]>(
      `SELECT MAX(CAST(substr(xref, 3, length(xref) - 3) AS INTEGER)) AS last
       FROM ${table} WHERE xref GLOB ?`
    )
    .get(`@${letter}[0-9]*@`);
  return `@${letter}${(row?.last ?? 0) + 1}@`;
}

export function createRecords(db: Database) {
  const insertPerson = db.prepare<{ id: number }, [string, string, Sex]>(
    'INSERT INTO persons (xref, uid, sex) VALUES (?, ?, ?) RETURNING id'
  );
  const insertName = db.prepare<
    null,
    [number, string, string | null, string | null]
  >(
    `INSERT INTO names (person_id, full_text, given, surname, sort_order)
     VALUES (?, ?, ?, ?, 0)`
  );
  const insertFamily = db.prepare<
    { id: number },
    [string, string, number | null, number | null]
  >(
    `INSERT INTO families (xref, uid, husband_id, wife_id)
     VALUES (?, ?, ?, ?) RETURNING id`
  );

  return {
    // A new person with one name, given names and surname, empty for none.
    person(name: { given: string; surname: string }, sex: Sex) {
      const { id } = insertPerson.get(
        nextXref(db, 'persons'),
        crypto.randomUUID(),
        sex
      )!;
      insertName.run(
        id,
        gedcomName(name.given, name.surname),
        name.given === '' ? null : name.given,
        name.surname === '' ? null : name.surname
      );
      touchRecord(db, { table: 'persons', id });
      return id;
    },

    // A new family of the two parents, either or both of them null.
    family(husbandId: number | null, wifeId: number | null) {
      const { id } = insertFamily.get(
        nextXref(db, 'families'),
        crypto.randomUUID(),
        husbandId,
        wifeId
      )!;
      touchRecord(db, { table: 'families', id });
      return id;
    }
  };
}
