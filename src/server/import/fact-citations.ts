// A Fact's citations in GEDCOM, as support of its owner's (ADR-0022).
// GEDCOM repeats a citation under each Fact it supports, so the export
// writes a copy there; a Fact's `SOUR` the same as one its person or
// family has, as written, becomes that Citation's support. One with no
// such twin becomes a Citation of the Fact's owner, after the owner's
// others, and supports the Fact. A family's Fact looks in the family's
// citations, then its spouses'.

import type { Database } from 'bun:sqlite';

import { openSupport } from '../citations';
import type { GedNode } from '../gedcom/parser';

// What tells a copy under a Fact from another citation: what it says of
// where it's from. Its image and Box (OBJE) are repeated too, but other
// programs may leave them out; its notes and media aren't.
const REPEATED = new Set(['PAGE', 'DATA', 'EVEN', 'QUAY']);

function linesOf(node: GedNode): unknown {
  return [node.tag, node.value ?? null, node.children.map(linesOf)];
}

// The citation as written, for telling a copy's twin.
export function citationKey(sour: GedNode) {
  return JSON.stringify([
    sour.value ?? null,
    sour.children.filter((c) => REPEATED.has(c.tag)).map(linesOf)
  ]);
}

interface Owner {
  scope: 'person' | 'family';
  id: number;
}

// Stores one citation of the owner, its sort order given: its id.
type StoreCitation = (sour: GedNode, owner: Owner, sortOrder: number) => number;

// Marks a line and everything under it as read: a copy folded into
// support says nothing more than its twin.
function useAll(use: (node: GedNode) => void, node: GedNode) {
  use(node);
  for (const child of node.children) useAll(use, child);
}

export function factCitations(db: Database, use: (node: GedNode) => void) {
  const support = openSupport(db);
  const ownerOf = db.prepare<
    {
      scope: 'person' | 'family';
      id: number;
      husband: number | null;
      wife: number | null;
    },
    [number]
  >(
    `SELECT f.scope_type AS scope, f.scope_id AS id,
       fam.husband_id AS husband, fam.wife_id AS wife
     FROM facts f
     LEFT JOIN families fam ON f.scope_type = 'family' AND fam.id = f.scope_id
     WHERE f.id = ?`
  );
  const nextOrder = db.prepare<{ next: number }, [string, number]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM citations
     WHERE scope_type = ? AND scope_id = ?`
  );
  // The owners' citations as written, by owner, in their order.
  const owned = new Map<string, Array<{ key: string; id: number }>>();
  const deferred: Array<{ factId: number; sours: GedNode[] }> = [];

  function ownedBy(scope: string, id: number | null) {
    return id === null ? [] : (owned.get(`${scope} ${id}`) ?? []);
  }

  return {
    // A person's or family's citation stored, as written.
    owns(owner: Owner, sour: GedNode, citationId: number) {
      const at = `${owner.scope} ${owner.id}`;
      const list = owned.get(at) ?? [];
      list.push({ key: citationKey(sour), id: citationId });
      owned.set(at, list);
    },

    // A Fact's citations, kept until every record is read, as its owner's
    // may come after it.
    defer(factId: number, sours: GedNode[]) {
      if (sours.length > 0) deferred.push({ factId, sours });
    },

    // Each Fact's citations as support, or as Citations of its owner.
    // How many new Citations that made.
    fold(store: StoreCitation) {
      let made = 0;
      for (const { factId, sours } of deferred) {
        const owner = ownerOf.get(factId);
        if (owner === null) continue;
        const candidates = [
          ...ownedBy(owner.scope, owner.id),
          ...(owner.scope === 'family'
            ? [
                ...ownedBy('person', owner.husband),
                ...ownedBy('person', owner.wife)
              ]
            : [])
        ];
        for (const sour of sours) {
          const key = citationKey(sour);
          const twin = candidates.find(
            (c) => c.key === key && !support.supports(c.id, factId)
          );
          if (twin !== undefined) {
            support.add(twin.id, factId);
            useAll(use, sour);
            continue;
          }
          const at = { scope: owner.scope, id: owner.id };
          const { next } = nextOrder.get(at.scope, at.id)!;
          support.add(store(sour, at, next), factId);
          made += 1;
        }
      }
      return made;
    }
  };
}
