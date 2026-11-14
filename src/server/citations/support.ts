// The Facts a Citation supports (ADR-0022): a person's Citation, their own
// Facts and their marriages'; a family's, the family's. The Citation stays
// where it is; support is a row of its own, which goes with the Fact or
// the Citation.

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

// The Fact an entry plainly records for whoever is in it in `role`, of
// the person's Facts: a baptism's child, their one Christening, else their
// one Birth; a marriage's spouse, their one marriage. Null for anyone
// else, and where there are two.
export function entryFact<F extends { tag: string; familyId: number | null }>(
  event: string | null,
  role: string | null,
  facts: F[]
): F | null {
  function one(tag: string) {
    const found = facts.filter((f) => f.tag === tag);
    return found.length === 1 ? found[0]! : null;
  }
  if (event === 'CHR' && role === 'CHIL') {
    return facts.some((f) => f.tag === 'CHR') ? one('CHR') : one('BIRT');
  }
  if (event === 'MARR' && (role === 'HUSB' || role === 'WIFE')) {
    const marriages = facts.filter(
      (f) => f.tag === 'MARR' && f.familyId !== null
    );
    return marriages.length === 1 ? marriages[0]! : null;
  }
  return null;
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
  // The Fact, when the Citation may support it: it's the Citation's
  // person's, or a family's they're a spouse in, or the family's whose
  // Citation it is.
  const ownFact = db.prepare<SupportedFact, [number, number]>(
    `SELECT f.id, f.tag, f.type, f.date_text AS date, f.place, f.address,
       f.value
     FROM citations c JOIN facts f ON f.id = ?2
     LEFT JOIN families fam ON f.scope_type = 'family' AND fam.id = f.scope_id
     WHERE c.id = ?1 AND (
       (c.scope_type = f.scope_type AND c.scope_id = f.scope_id)
       OR (c.scope_type = 'person'
         AND (fam.husband_id = c.scope_id OR fam.wife_id = c.scope_id))
     )`
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

  return {
    // The Fact, when the Citation may support it; null otherwise.
    factFor(citationId: number, factId: number) {
      return ownFact.get(citationId, factId);
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
  // The person's Facts and their marriages', for the one a new Citation's
  // entry records.
  const factsOf = db.prepare<
    { id: number; tag: string; familyId: number | null },
    [number]
  >(
    `SELECT f.id, f.tag,
       CASE WHEN f.scope_type = 'family' THEN f.scope_id END AS familyId
     FROM facts f
     LEFT JOIN families fam ON f.scope_type = 'family' AND fam.id = f.scope_id
     WHERE (f.scope_type = 'person' AND f.scope_id = ?1)
       OR fam.husband_id = ?1 OR fam.wife_id = ?1
     ORDER BY f.id`
  );

  // Makes the Citation support the Fact, or no longer: false when it isn't
  // a person's, or the Fact isn't theirs or their marriages'.
  function set(citationId: number, factId: number, on: boolean) {
    if (isPersons.get(citationId) === null) return false;
    const fact = support.factFor(citationId, factId);
    if (fact === null) return false;
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

  return {
    set,

    // A new Citation of the person's supports the Fact its entry plainly
    // records for them in their Role.
    recorded(
      citationId: number,
      personId: number,
      event: string | null,
      role: string | null
    ) {
      const fact = entryFact(event, role, factsOf.all(personId));
      if (fact !== null) set(citationId, fact.id, true);
    }
  };
}
