// A dataset's Changes: what was done in the app that changed it, each with
// what it was on (on.ts). Only the app keeps them; no export writes them,
// a re-import's merge carries them (import/merge.ts), and undoing an
// import puts back the ones its database had.

import type { Database } from 'bun:sqlite';

import type { Change, ChangeWhat, NewChange } from '@/common/types';

import { ON_COLUMNS, openOn } from '../on';
import type { OnRow, OnSources } from '../on';

interface ChangeRow extends OnRow {
  id: number;
  at: string;
  what: string;
  who: string | null;
}

type Binding = string | number | null;

const COLUMNS = ['at', 'what', 'who', ...ON_COLUMNS] as const;

export function openChanges(db: Database, sources: OnSources) {
  const ons = openOn(db, sources);
  const all = db.prepare<ChangeRow, []>(
    'SELECT * FROM changes ORDER BY id DESC'
  );
  const insert = db.prepare<null, Binding[]>(
    `INSERT INTO changes (${COLUMNS.join(', ')})
     VALUES (${COLUMNS.map(() => '?').join(', ')})`
  );
  // A person's first name as it's sorted.
  const nameOf = db.prepare<{ full_text: string }, [number]>(
    'SELECT full_text FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );

  async function changeOf(row: ChangeRow): Promise<Change> {
    return {
      id: row.id,
      at: row.at,
      what: JSON.parse(row.what) as ChangeWhat,
      on: await ons.describe(row),
      who: row.who
    };
  }

  return {
    // Every Change, newest first.
    async list() {
      return await Promise.all(all.all().map(changeOf));
    },

    // Writes a Change. One whose person or Citation isn't in the dataset is
    // written on nothing.
    add(change: NewChange) {
      const on = change.on === null ? null : ons.columnsOf(change.on);
      const personId = on?.person_id ?? null;
      const who = personId === null ? null : nameOf.get(personId)?.full_text;
      const values: Binding[] = [
        new Date().toISOString(),
        JSON.stringify(change.what),
        who ?? null,
        ...ON_COLUMNS.map((c) => on?.[c] ?? null)
      ];
      insert.run(...values);
    }
  };
}

export type Changes = ReturnType<typeof openChanges>;
