// Schema 5 (ADR-0022): a Citation supports Facts, from its person or
// family, rather than being on one. Each Citation on a Fact moves to the
// Fact's owner, after the owner's others, and supports the Fact; one that
// is the same as a Citation its owner already has, and holds nothing of
// its own, becomes that one's support instead, and its Changes go with it.
// A Citation whose Fact is gone is left as it was.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

interface FactCitation {
  id: number;
  factId: number;
  ownerType: 'person' | 'family';
  ownerId: number;
}

function up(db: Database) {
  db.run(
    `CREATE TABLE fact_citations (
       fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
       citation_id INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
       PRIMARY KEY (fact_id, citation_id)
     )`
  );
  db.run(
    'CREATE INDEX fact_citations_citation_idx ON fact_citations(citation_id)'
  );
  const onFacts = db
    .query<FactCitation, []>(
      `SELECT c.id, f.id AS factId, f.scope_type AS ownerType,
         f.scope_id AS ownerId
       FROM citations c JOIN facts f ON f.id = c.scope_id
       WHERE c.scope_type = 'fact' AND f.scope_type IN ('person', 'family')
       ORDER BY c.scope_id, c.sort_order, c.id`
    )
    .all();
  // The same Citation of the owner, when this one holds nothing else.
  const twin = db.prepare<{ id: number }, [number, string, number]>(
    `SELECT o.id FROM citations c JOIN citations o
       ON o.scope_type = ?2 AND o.scope_id = ?3
       AND o.source_id IS c.source_id AND o.page IS c.page
       AND o.data_date IS c.data_date AND o.text IS c.text
       AND o.event IS c.event AND o.role IS c.role AND o.quality IS c.quality
     WHERE c.id = ?1 AND c.added_in_app = 0 AND c.link_volume_id IS NULL
       AND c.original_page IS NULL
       AND NOT EXISTS (SELECT 1 FROM notes
         WHERE owner_type = 'citation' AND owner_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM media_links
         WHERE scope_type = 'citation' AND scope_id = c.id)
     ORDER BY o.sort_order, o.id LIMIT 1`
  );
  const nextOrder = db.prepare<{ next: number }, [string, number]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM citations
     WHERE scope_type = ? AND scope_id = ?`
  );
  const move = db.prepare<null, [string, number, number, number]>(
    'UPDATE citations SET scope_type = ?, scope_id = ?, sort_order = ? WHERE id = ?'
  );
  const support = db.prepare<null, [number, number]>(
    'INSERT OR IGNORE INTO fact_citations (fact_id, citation_id) VALUES (?, ?)'
  );
  const repoint = db.prepare<null, [number, number]>(
    'UPDATE changes SET citation_id = ? WHERE citation_id = ?'
  );
  const remove = db.prepare<null, [number]>(
    'DELETE FROM citations WHERE id = ?'
  );
  for (const c of onFacts) {
    const same = twin.get(c.id, c.ownerType, c.ownerId);
    if (same === null) {
      const { next } = nextOrder.get(c.ownerType, c.ownerId)!;
      move.run(c.ownerType, c.ownerId, next, c.id);
      support.run(c.factId, c.id);
    } else {
      support.run(c.factId, same.id);
      repoint.run(same.id, c.id);
      remove.run(c.id);
    }
  }
}

export const CITATIONS_SUPPORT_FACTS: Migration = { to: 5, up };
