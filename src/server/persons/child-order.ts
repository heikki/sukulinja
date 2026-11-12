// A family's children in the order they were born: by their birth date,
// or their baptism date when there's no birth, else in the order they
// were added. Only the child added, or whose date changed, is moved, so
// an imported order stays as it was until then.

import type { Database } from 'bun:sqlite';

import { dateOrder } from '@/common/dates';

// The facts whose date says when someone was born, the first that has
// one counting.
export const BIRTH_TAGS = ['BIRT', 'CHR', 'BAPM'];

interface Child {
  person_id: number;
  date: string | null;
}

// When the child was born, as dateOrder gives it; null when unknown.
function bornOf(child: Child) {
  return child.date === null ? null : dateOrder(child.date);
}

// The children with `id` moved: before the first sibling born later, or
// last when their birth isn't known.
function placed(children: Child[], id: number) {
  const child = children.find((c) => c.person_id === id);
  if (child === undefined) return children;
  const others = children.filter((c) => c !== child);
  const born = bornOf(child);
  const at =
    born === null
      ? -1
      : others.findIndex((c) => {
          const b = bornOf(c);
          return b !== null && b > born;
        });
  if (at === -1) return [...others, child];
  return [...others.slice(0, at), child, ...others.slice(at)];
}

export function createChildOrder(db: Database) {
  const tags = BIRTH_TAGS.map((t) => `'${t}'`).join(', ');
  // A family's children as they're ordered, with the date of each one's
  // birth, or baptism when there's none.
  const childrenOf = db.prepare<Child, [number]>(
    `SELECT fc.person_id, (
       SELECT f.date_text FROM facts f
       WHERE f.scope_type = 'person' AND f.scope_id = fc.person_id
         AND f.tag IN (${tags}) AND f.date_text IS NOT NULL
       ORDER BY CASE f.tag WHEN 'BIRT' THEN 0 ELSE 1 END, f.sort_order
       LIMIT 1
     ) AS date
     FROM family_children fc WHERE fc.family_id = ?
     ORDER BY fc.sort_order`
  );
  const familiesOf = db.prepare<{ family_id: number }, [number]>(
    'SELECT family_id FROM family_children WHERE person_id = ?'
  );
  const setOrder = db.prepare<null, [number, number, number]>(
    'UPDATE family_children SET sort_order = ? WHERE family_id = ? AND person_id = ?'
  );

  function place(familyId: number, personId: number) {
    const children = placed(childrenOf.all(familyId), personId);
    children.forEach((c, i) => {
      setOrder.run(i, familyId, c.person_id);
    });
  }

  return {
    // Puts the child in their place among the family's children.
    place,
    // Puts the person in their place in each family they're a child in,
    // once their birth date is known, changed or gone.
    placeEverywhere(personId: number) {
      for (const f of familiesOf.all(personId)) place(f.family_id, personId);
    }
  };
}
