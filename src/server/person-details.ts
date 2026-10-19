// What the person panel shows for one person: their facts, the facts of their
// marriages, and their Citations.

import type { Database } from 'bun:sqlite';

import type { FactRow, PersonDetails } from '@common/types';

import type { Citations } from './citations';

function yearOf(date: string | null) {
  const m = date === null ? null : /\d{4}/.exec(date);
  return m === null ? Infinity : Number(m[0]);
}

// Birth opens a life and death closes it, burial after; the rest run
// between them by date.
const LIFE_ORDER: Record<string, number> = {
  BIRT: 0,
  DEAT: 2,
  BURI: 3,
  CREM: 3
};

function byLife(a: FactRow, b: FactRow) {
  const order = (LIFE_ORDER[a.tag] ?? 1) - (LIFE_ORDER[b.tag] ?? 1);
  return order === 0 ? yearOf(a.date) - yearOf(b.date) : order;
}

export function createPersonDetails(db: Database, citations: Citations) {
  const person = db.prepare<{ id: number; sex: string | null }, [number]>(
    'SELECT id, sex FROM persons WHERE id = ?'
  );
  const name = db.prepare<
    { given: string | null; surname: string | null },
    [number]
  >(
    'SELECT given, surname FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );
  const personFacts = db.prepare<Omit<FactRow, 'spouse'>, [number]>(
    `SELECT tag, date_text AS date, place, address, value FROM facts
     WHERE scope_type = 'person' AND scope_id = ? ORDER BY sort_order`
  );
  const marriageFacts = db.prepare<
    Omit<FactRow, 'spouse'> & {
      spouseGiven: string | null;
      spouseSurname: string | null;
    },
    [number]
  >(
    `SELECT f.tag, f.date_text AS date, f.place, f.address, f.value,
       n.given AS spouseGiven, n.surname AS spouseSurname
     FROM families fam
     JOIN facts f ON f.scope_type = 'family' AND f.scope_id = fam.id
     LEFT JOIN names n ON n.sort_order = 0 AND n.person_id =
       CASE WHEN fam.husband_id = ?1 THEN fam.wife_id ELSE fam.husband_id END
     WHERE fam.husband_id = ?1 OR fam.wife_id = ?1
     ORDER BY fam.id, f.sort_order`
  );

  function fullName(given: string | null, surname: string | null) {
    const parts = [given, surname].filter((x) => x !== null && x !== '');
    return parts.length === 0 ? null : parts.join(' ');
  }

  // Facts run from birth to death, those between in date order. Undated
  // ones keep their recorded order after the dated.
  return (id: number): PersonDetails | null => {
    const p = person.get(id);
    if (p === null) return null;
    const n = name.get(id);
    const facts: FactRow[] = [
      ...personFacts.all(id).map((f) => ({ ...f, spouse: null })),
      ...marriageFacts.all(id).map(({ spouseGiven, spouseSurname, ...f }) => ({
        ...f,
        spouse: fullName(spouseGiven, spouseSurname)
      }))
    ].sort(byLife);
    return {
      id: p.id,
      name: n === null ? null : fullName(n.given, n.surname),
      sex: p.sex,
      facts,
      citations: citations.ofPerson(id)
    };
  };
}
