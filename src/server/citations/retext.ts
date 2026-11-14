import type { Database } from 'bun:sqlite';

import type { CitationRow } from '@/common/types';

import type { NewChange } from '../changes/changes';
import type { EntryEdit } from './entries';
import { plainText } from './text';

interface RetextDeps {
  // Edits an Entry, for everyone citing it.
  editEntry: (
    entryId: number,
    edit: EntryEdit
  ) => Promise<object | { rejected: string } | null>;
  // One of a person's Citations, with whose it is.
  ofId: (
    citationId: number
  ) => { personId: number; citation: CitationRow } | null;
  // What the Citation cites, in words.
  citedText: (c: CitationRow) => string | null;
  changed: (change: NewChange) => void;
}

// Puts what a person's Citation says, its text: the Entry's when it cites
// one, as an edit of it (ADR-0026), else its own, with a Change. What it
// says now; null when there's no such Citation of a person.
export function createRetext(db: Database, deps: RetextDeps) {
  const entryOf = db.prepare<{ entryId: number | null }, [number]>(
    `SELECT entry_id AS entryId FROM citations
      WHERE id = ? AND scope_type = 'person'`
  );
  const put = db.prepare('UPDATE citations SET text = ? WHERE id = ?');

  return async function retext(citationId: number, text: string | null) {
    const row = entryOf.get(citationId);
    if (row === null) return null;
    const now = plainText(text);
    if (row.entryId !== null) {
      const edited = await deps.editEntry(row.entryId, { text });
      if (edited === null || 'rejected' in edited) return edited;
      return { text: now };
    }
    const was = deps.ofId(citationId);
    if (was === null) return null;
    put.run(now, citationId);
    deps.changed({
      on: { personId: was.personId },
      what: { kind: 'retext', cited: deps.citedText(was.citation), text: now }
    });
    return { text: now };
  };
}
