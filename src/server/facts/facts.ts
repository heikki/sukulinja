// Adding, changing and deleting a person's Facts and their marriages', now
// that the tree is edited in the app (ADR-0021). Each is a Change on the
// person, and brings the record's CHAN up to now.

import type { Database } from 'bun:sqlite';

import { ADDABLE_FACTS, factKindLabel, factWords } from '@/common/facts';
import type { FactFields, NewChange, NewFact } from '@/common/types';

import { deleteHeld, deletePlaceHeld, touchRecord } from '../datasets/records';
import { BIRTH_TAGS, createChildOrder } from '../persons/child-order';
import { readFields } from './fields';
import type { Said } from './fields';

interface FactRecord {
  id: number;
  scope_type: 'person' | 'family';
  scope_id: number;
  tag: string;
  type: string | null;
  date_text: string | null;
  place: string | null;
  address: string | null;
  value: string | null;
}

export type FactAnswer = { id: number } | { rejected: string } | null;

function rejected(words: string) {
  return { rejected: words };
}

function wordsOf(f: Said) {
  return factWords(f);
}

// The record a Fact is on, by its table.
function recordOf(f: Pick<FactRecord, 'scope_type' | 'scope_id'>) {
  return {
    table:
      f.scope_type === 'person' ? ('persons' as const) : ('families' as const),
    id: f.scope_id
  };
}

export function createFacts(
  db: Database,
  changed: (change: NewChange) => void
) {
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );
  // A family the person is a spouse in.
  const familyOf = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM families WHERE id = ?1
     AND (husband_id = ?2 OR wife_id = ?2)`
  );
  // The Fact, when it's the person's or a family's they're a spouse in.
  const factOf = db.prepare<FactRecord, [number, number]>(
    `SELECT f.id, f.scope_type, f.scope_id, f.tag, f.type, f.date_text,
       f.place, f.address, f.value
     FROM facts f
     LEFT JOIN families fam ON f.scope_type = 'family' AND fam.id = f.scope_id
     WHERE f.id = ?1 AND (
       (f.scope_type = 'person' AND f.scope_id = ?2)
       OR fam.husband_id = ?2 OR fam.wife_id = ?2
     )`
  );
  const lastOrder = db.prepare<{ last: number | null }, [string, number]>(
    'SELECT MAX(sort_order) AS last FROM facts WHERE scope_type = ? AND scope_id = ?'
  );
  const insert = db.prepare<
    { id: number },
    [
      string,
      number,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      number
    ]
  >(
    `INSERT INTO facts
       (scope_type, scope_id, tag, type, date_text, place, address, value,
        sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  );
  const update = db.prepare<
    null,
    [
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      number
    ]
  >(
    `UPDATE facts SET type = ?, date_text = ?, place = ?, address = ?,
       value = ? WHERE id = ?`
  );
  const forgetCoordinates = db.prepare(
    'UPDATE facts SET latitude = NULL, longitude = NULL WHERE id = ?'
  );
  const deleteRow = db.prepare('DELETE FROM facts WHERE id = ?');
  const dropAddress = db.prepare(
    "DELETE FROM addresses WHERE owner_type = 'fact' AND owner_id = ?"
  );
  const insertAddress = db.prepare<null, [number, string]>(
    "INSERT INTO addresses (owner_type, owner_id, text) VALUES ('fact', ?, ?)"
  );
  const allPlaces = db.prepare<{ place: string; facts: number }, []>(
    `SELECT place, COUNT(*) AS facts FROM facts WHERE place IS NOT NULL
     GROUP BY place ORDER BY COUNT(*) DESC, place`
  );
  // The Facts naming the place, with whose they are: a person's, or a
  // family's spouses'.
  const atPlace = db.prepare<
    {
      tag: string;
      type: string | null;
      date_text: string | null;
      person_id: number | null;
      husband_id: number | null;
      wife_id: number | null;
    },
    [string]
  >(
    `SELECT f.tag, f.type, f.date_text,
       CASE WHEN f.scope_type = 'person' THEN f.scope_id END AS person_id,
       fam.husband_id, fam.wife_id
     FROM facts f
     LEFT JOIN families fam ON f.scope_type = 'family' AND fam.id = f.scope_id
     WHERE f.place = ? ORDER BY f.date_text, f.id`
  );

  const childOrder = createChildOrder(db);

  // The Fact's ADDR as the export writes it: the address typed, whole, as
  // GEDCOM 7 has its payload, its parts from an import gone with the old.
  function writeAddress(factId: number, address: string | null) {
    dropAddress.run(factId);
    if (address !== null) insertAddress.run(factId, address);
  }

  // A birth or baptism date added, changed or deleted moves the person
  // among their siblings.
  function reorder(f: { scope_type: string; tag: string }, personId: number) {
    if (f.scope_type === 'person' && BIRTH_TAGS.includes(f.tag)) {
      childOrder.placeEverywhere(personId);
    }
  }

  function change(
    personId: number,
    what: Omit<Extract<NewChange['what'], { kind: 'fact' }>, 'kind'>
  ) {
    changed({ on: { personId }, what: { kind: 'fact', ...what } });
  }

  return {
    // The places the dataset's Facts name, the most named first, for the
    // form to suggest.
    places() {
      return allPlaces.all().map((r) => r.place);
    },

    // Every place Facts name, with how many name it, most named first.
    placeCounts() {
      return allPlaces.all();
    },

    // The Facts naming the place, by whose they are: the person's, or for
    // a family's, both spouses' (null where there's none).
    atPlace(place: string) {
      return atPlace.all(place).map((r) => ({
        tag: r.tag,
        type: r.type,
        date: r.date_text,
        personIds:
          r.person_id === null
            ? [r.husband_id, r.wife_id].filter((id) => id !== null)
            : [r.person_id]
      }));
    },

    // Adds the Fact to the person, or to one of their families: its id.
    // Null when there's no such person.
    add(personId: number, fact: NewFact): FactAnswer {
      if (personExists.get(personId) === null) return null;
      const kind = ADDABLE_FACTS.find((k) => k.tag === fact.tag);
      if (kind === undefined) return rejected(`A ${fact.tag} can't be added.`);
      if (kind.family !== (fact.familyId !== null)) {
        return rejected(
          kind.family
            ? `A ${factKindLabel(fact.tag).toLowerCase()} is a family's.`
            : `A ${factKindLabel(fact.tag).toLowerCase()} is a person's.`
        );
      }
      if (
        fact.familyId !== null &&
        familyOf.get(fact.familyId, personId) === null
      ) {
        return rejected("They aren't a spouse in that family.");
      }
      const read = readFields(fact.tag, fact, null);
      if ('rejected' in read) return read;
      const s = read.ok;
      const scope = fact.familyId === null ? 'person' : 'family';
      const scopeId = fact.familyId ?? personId;
      return db.transaction(() => {
        const order = (lastOrder.get(scope, scopeId)?.last ?? -1) + 1;
        const { id } = insert.get(
          scope,
          scopeId,
          fact.tag,
          s.type,
          s.date,
          s.place,
          s.address,
          s.value,
          order
        )!;
        writeAddress(id, s.address);
        touchRecord(db, recordOf({ scope_type: scope, scope_id: scopeId }));
        if (s.date !== null) {
          reorder({ scope_type: scope, tag: fact.tag }, personId);
        }
        change(personId, {
          did: 'add',
          tag: fact.tag,
          was: null,
          now: wordsOf(s)
        });
        return { id };
      })();
    },

    // Changes what the Fact says: its date, place, address, value and
    // type. Null
    // when it isn't the person's or their family's.
    edit(personId: number, factId: number, fields: FactFields): FactAnswer {
      const f = factOf.get(factId, personId);
      if (f === null) return null;
      const stored = {
        date: f.date_text,
        place: f.place,
        address: f.address,
        value: f.value,
        type: f.type
      };
      const read = readFields(f.tag, fields, stored);
      if ('rejected' in read) return read;
      const s = read.ok;
      const same = (Object.keys(s) as Array<keyof Said>).every(
        (k) => s[k] === stored[k]
      );
      if (same) return { id: factId };
      db.transaction(() => {
        update.run(s.type, s.date, s.place, s.address, s.value, factId);
        // Coordinates and notes are of the place they were recorded for.
        if (s.place !== stored.place) {
          forgetCoordinates.run(factId);
          deletePlaceHeld(db, { fact: factId });
        }
        if (s.address !== stored.address) writeAddress(factId, s.address);
        if (s.date !== stored.date) reorder(f, personId);
        touchRecord(db, recordOf(f));
        change(personId, {
          did: 'edit',
          tag: f.tag,
          was: wordsOf(stored),
          now: wordsOf(s)
        });
      })();
      return { id: factId };
    },

    // Deletes the Fact, moving its Citations to its person or family, so
    // the evidence stays. False when it isn't the person's or their
    // family's.
    remove(personId: number, factId: number) {
      const f = factOf.get(factId, personId);
      if (f === null) return false;
      db.transaction(() => {
        deleteHeld(db, { fact: factId });
        deleteRow.run(factId);
        if (f.date_text !== null) reorder(f, personId);
        touchRecord(db, recordOf(f));
        change(personId, {
          did: 'delete',
          tag: f.tag,
          was: wordsOf({
            date: f.date_text,
            place: f.place,
            value: f.value,
            type: f.type,
            address: f.address
          }),
          now: null
        });
      })();
      return true;
    }
  };
}

export type Facts = ReturnType<typeof createFacts>;
