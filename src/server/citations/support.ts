// The Facts a Citation supports (ADR-0022): a person's Citation, their own
// Facts and their marriages'; a family's, the family's. A Citation of an
// Entry supports only its owner's (ADR-0037): a baptism's child's, a
// marriage's couple's family's, by either spouse's Citation, a burial's or
// household line's one person's. One whose Entry has no kind yet has no
// owner known, and keeps the person's rule until it's chosen; so does
// one of a kind the app doesn't make, as MyHeritage's 'Record'. The rule is
// here once, for the Entry pane, the assistant and the import alike. The
// Citation stays where it is; support is a row of its own, which goes with
// the Fact or the Citation.

import type { Database } from 'bun:sqlite';

import { factWords } from '@/common/facts';

import type { NewChange } from '../changes/changes';

// A Fact as a Change names it.
export interface SupportedFact {
  id: number;
  tag: string;
  type: string | null;
  date: string | null;
  place: string | null;
  address: string | null;
  value: string | null;
}

// Whose a Fact is, or would be once added.
export interface FactScope {
  scope: 'person' | 'family';
  id: number;
}

export const NOT_OWNERS =
  "An entry's source supports only the facts of whom the entry is about: a baptism's child, a marriage's couple, a burial's or household line's one person.";

// Whether Citation `c` (its Entry `e`, if any, joined) may support a Fact
// of the scope `t`, `s` give, as SQL: the person's own, or of a family
// they're a spouse in, or the family's whose Citation it is; of an Entry,
// only its owner's.
function maySupport(t: string, s: string) {
  const own = `(c.scope_type = 'person' AND ${t} = 'person' AND ${s} = c.scope_id)`;
  function spouse(also = '') {
    return `(c.scope_type = 'person' AND ${t} = 'family'
    AND EXISTS (SELECT 1 FROM families fam WHERE fam.id = ${s}
      AND c.scope_id IN (fam.husband_id, fam.wife_id) ${also}))`;
  }
  const couple = `AND EXISTS (SELECT 1 FROM citations o
    WHERE o.entry_id = c.entry_id AND o.id <> c.id
      AND o.role IN ('HUSB', 'WIFE')
      AND o.scope_id IN (fam.husband_id, fam.wife_id))`;
  const alone = `(SELECT COUNT(*) FROM citations o
    WHERE o.entry_id = c.entry_id) = 1`;
  return `(
    ((c.entry_id IS NULL OR e.event IS NULL
        OR e.event NOT IN ('CHR', 'MARR', 'BURI', 'RESI')) AND (${own} OR ${spouse()}
      OR (c.scope_type = 'family' AND ${t} = 'family' AND ${s} = c.scope_id)))
    OR (e.event = 'CHR' AND c.role = 'CHIL' AND ${own})
    OR (e.event = 'MARR' AND c.role IN ('HUSB', 'WIFE') AND ${spouse(couple)})
    OR (e.event IN ('BURI', 'RESI') AND ${own} AND ${alone})
  )`;
}

// The Citation as `maySupport` reads it.
const CITATION = 'citations c LEFT JOIN entries e ON e.id = c.entry_id';

// Support the rule doesn't allow: an Entry's Citation supporting a Fact
// that isn't its owner's, as a Role or kind changed made before ADR-0037,
// or the import's folding a Fact's copy into an Entry's Citation.
export function unownedSupport(db: Database) {
  return db
    .query<{ citationId: number; factId: number }, []>(
      `SELECT fc.citation_id AS citationId, fc.fact_id AS factId
       FROM fact_citations fc JOIN facts f ON f.id = fc.fact_id,
         ${CITATION}
       WHERE c.id = fc.citation_id AND c.entry_id IS NOT NULL
         AND NOT ${maySupport('f.scope_type', 'f.scope_id')}
       ORDER BY fc.citation_id, fc.fact_id`
    )
    .all();
}

// Takes back, with no Change, support the rule doesn't allow: the
// import's, a Fact's copy of a citation folded into one that cites an
// Entry not its owner's once the Entries are gathered.
export function dropUnownedSupport(db: Database) {
  const remove = db.prepare(
    'DELETE FROM fact_citations WHERE citation_id = ? AND fact_id = ?'
  );
  for (const { citationId, factId } of unownedSupport(db)) {
    remove.run(citationId, factId);
  }
}

// The person leaving the family as a spouse: their Citations no longer
// support its Facts.
export function leaveFamilySupport(
  db: Database,
  personId: number,
  familyId: number
) {
  db.run(
    `DELETE FROM fact_citations
     WHERE citation_id IN (SELECT id FROM citations
         WHERE scope_type = 'person' AND scope_id = ?1)
       AND fact_id IN (SELECT id FROM facts
         WHERE scope_type = 'family' AND scope_id = ?2)`,
    [personId, familyId]
  );
}

export function openSupport(db: Database) {
  const FACT = `f.id, f.tag, f.type, f.date_text AS date, f.place,
       f.address, f.value`;
  // The Fact, when the Citation may support it (`maySupport`).
  const ownFact = db.prepare<SupportedFact, [number, number]>(
    `SELECT ${FACT} FROM ${CITATION} JOIN facts f ON f.id = ?2
     WHERE c.id = ?1 AND ${maySupport('f.scope_type', 'f.scope_id')}`
  );
  // The Fact, when the Citation supports it, whether it may or not: support
  // made before the rule is taken back as any.
  const supportedFact = db.prepare<SupportedFact, [number, number]>(
    `SELECT ${FACT} FROM fact_citations fc JOIN facts f ON f.id = fc.fact_id
     WHERE fc.citation_id = ?1 AND fc.fact_id = ?2`
  );
  // Whether the Citation may support a Fact of the scope.
  const mayOf = db.prepare<{ n: number }, [number, string, number]>(
    `SELECT 1 AS n FROM ${CITATION}
     WHERE c.id = ?1 AND ${maySupport('?2', '?3')}`
  );
  const has = db.prepare<{ n: number }, [number, number]>(
    'SELECT 1 AS n FROM fact_citations WHERE fact_id = ? AND citation_id = ?'
  );
  const insert = db.prepare<null, [number, number]>(
    'INSERT OR IGNORE INTO fact_citations (fact_id, citation_id) VALUES (?, ?)'
  );
  const remove = db.prepare<null, [number, number]>(
    'DELETE FROM fact_citations WHERE fact_id = ? AND citation_id = ?'
  );

  const entryOf = db.prepare<{ id: number }, [number]>(
    'SELECT entry_id AS id FROM citations WHERE id = ? AND entry_id IS NOT NULL'
  );

  return {
    // The Fact, when the Citation may support it; null otherwise.
    factFor(citationId: number, factId: number) {
      return ownFact.get(citationId, factId);
    },

    // The Fact, when the Citation supports it, whether it may or not.
    supportedFact(citationId: number, factId: number) {
      return supportedFact.get(citationId, factId);
    },

    // Whether the Citation may support a Fact of the scope, as one about
    // to be added.
    mayOf(citationId: number, of: FactScope) {
      return mayOf.get(citationId, of.scope, of.id) !== null;
    },

    // Whether the Citation cites an Entry.
    ofEntry(citationId: number) {
      return entryOf.get(citationId) !== null;
    },

    supports(citationId: number, factId: number) {
      return has.get(factId, citationId) !== null;
    },

    add(citationId: number, factId: number) {
      insert.run(factId, citationId);
    },

    remove(citationId: number, factId: number) {
      remove.run(factId, citationId);
    }
  };
}

// A person's Citation made to support their Facts, or no longer, each a
// Change on the Citation.
export function createSupport(
  db: Database,
  changed: (change: NewChange) => void
) {
  const support = openSupport(db);
  const isPersons = db.prepare<{ id: number }, [number]>(
    "SELECT id FROM citations WHERE id = ? AND scope_type = 'person'"
  );
  const isFact = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM facts WHERE id = ?'
  );

  // The Fact the Citation is to support, or no longer: what it supports
  // is always taken back. False when it isn't a person's, or the Fact
  // isn't theirs or their marriages', or there's none; refused for an
  // Entry's Citation and a Fact not its owner's.
  function factToSet(citationId: number, factId: number, on: boolean) {
    if (isPersons.get(citationId) === null) return false;
    const fact =
      (on ? null : support.supportedFact(citationId, factId)) ??
      support.factFor(citationId, factId);
    if (fact !== null) return fact;
    const owners = on && support.ofEntry(citationId);
    return owners && isFact.get(factId) !== null
      ? { rejected: NOT_OWNERS }
      : false;
  }

  // Makes the Citation support the Fact, or no longer: true when it does
  // as asked, false or refused as `factToSet` says.
  function set(
    citationId: number,
    factId: number,
    on: boolean
  ): boolean | { rejected: string } {
    const fact = factToSet(citationId, factId, on);
    if (fact === false || 'rejected' in fact) return fact;
    if (support.supports(citationId, factId) === on) return true;
    db.transaction(() => {
      if (on) support.add(citationId, factId);
      else support.remove(citationId, factId);
      changed({
        on: { citationId },
        what: {
          kind: 'support',
          did: on ? 'add' : 'remove',
          tag: fact.tag,
          fact: factWords(fact)
        }
      });
    })();
    return true;
  }

  // Why the Citation of an Entry can't support a Fact of the scope once
  // it's added; null when it can, or cites no Entry.
  function refusal(citationId: number, of: FactScope) {
    if (!support.ofEntry(citationId)) return null;
    return support.mayOf(citationId, of) ? null : NOT_OWNERS;
  }

  return { set, refusal };
}
