// A dataset's Changes: what was done in the app that changed it, each with
// what it was on (on.ts), or the Photo a Tag was in, with its person. Only
// the app keeps them, and no export writes them. They can be cleared, all
// at once. One like the newest,
// on the same thing, takes its place (combine.ts).

import type { Database } from 'bun:sqlite';

import type {
  Change,
  ChangeOn,
  ChangeVia,
  ChangeWhat,
  OnTarget
} from '@/common/types';

import { ON_COLUMNS, openOn } from '../on';
import type { OnRow, OnSources } from '../on';
import { replaces } from './combine';
import { viaNow } from './via';

interface ChangeRow extends OnRow {
  id: number;
  at: string;
  what: string;
  who: string | null;
  media_id: number | null;
  via: ChangeVia | null;
}

// What a new Change is put on.
export type ChangeTarget = OnTarget | { personId: number; photoId: number };

// A Change as it's written: what it did, and what it was on, if anything.
export interface NewChange {
  on: ChangeTarget | null;
  what: ChangeWhat;
}

type Binding = string | number | null;

const COLUMNS = [
  'at',
  'what',
  'who',
  ...ON_COLUMNS,
  'media_id',
  'via'
] as const;

// The newest Change's id, 0 for none: what the tree was as of then
// (ADR-0037).
export function lastChange(db: Database) {
  return (
    db
      .query<{ id: number }, []>(
        'SELECT COALESCE(MAX(id), 0) AS id FROM changes'
      )
      .get()?.id ?? 0
  );
}

export function openChanges(db: Database, sources: OnSources) {
  const ons = openOn(db, sources);
  const all = db.prepare<ChangeRow, []>(
    'SELECT * FROM changes ORDER BY id DESC'
  );
  const insert = db.prepare<null, Binding[]>(
    `INSERT INTO changes (${COLUMNS.join(', ')})
     VALUES (${COLUMNS.map(() => '?').join(', ')})`
  );
  const newest = db.prepare<ChangeRow, []>(
    'SELECT * FROM changes ORDER BY id DESC LIMIT 1'
  );
  const rewrite = db.prepare<null, [string, string, Binding, Binding, number]>(
    'UPDATE changes SET at = ?, what = ?, who = ?, via = ? WHERE id = ?'
  );
  const removeAll = db.prepare('DELETE FROM changes');
  // A person's first name as it's sorted.
  const nameOf = db.prepare<{ full_text: string }, [number]>(
    'SELECT full_text FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );
  const photoExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM media WHERE id = ?'
  );

  // The columns a new Change on the target fills: what on.ts fills, null
  // when its person or Citation is gone, and a Tag's Photo, null when
  // that's gone.
  function columnsOf(target: ChangeTarget | null) {
    if (target === null) return { on: null, mediaId: null };
    if (!('photoId' in target)) {
      return { on: ons.columnsOf(target), mediaId: null };
    }
    const on = ons.columnsOf({ personId: target.personId });
    const photo = on === null ? null : photoExists.get(target.photoId);
    return { on, mediaId: photo?.id ?? null };
  }

  // On its Photo while both it and its person are there; else as on.ts
  // describes it.
  async function onOf(row: ChangeRow): Promise<ChangeOn | null> {
    const on = await ons.describe(row);
    if (on?.kind !== 'person' || row.media_id === null) return on;
    return { kind: 'photo', personId: on.personId, photoId: row.media_id };
  }

  async function changeOf(row: ChangeRow): Promise<Change> {
    return {
      id: row.id,
      at: row.at,
      what: JSON.parse(row.what) as ChangeWhat,
      on: await onOf(row),
      who: row.who,
      via: row.via
    };
  }

  return {
    // Every Change, newest first.
    async list() {
      return await Promise.all(all.all().map(changeOf));
    },

    // Writes a Change, made as viaNow says. One whose person or Citation isn't in the dataset is
    // written on nothing; one whose Photo isn't, on its person. One that
    // goes with the newest Change, on the same thing, takes its place.
    add(change: NewChange) {
      const { on, mediaId } = columnsOf(change.on);
      const personId = on?.person_id ?? null;
      const who =
        personId === null ? null : (nameOf.get(personId)?.full_text ?? null);
      const at = new Date().toISOString();
      const via = viaNow();
      const onValues = ON_COLUMNS.map((c) => on?.[c] ?? null);
      const last = newest.get();
      if (
        last !== null &&
        on !== null &&
        sameOn(last, onValues, mediaId) &&
        replaces(JSON.parse(last.what) as ChangeWhat, change.what)
      ) {
        rewrite.run(at, JSON.stringify(change.what), who, via, last.id);
        return;
      }
      const values: Binding[] = [
        at,
        JSON.stringify(change.what),
        who,
        ...onValues,
        mediaId,
        via
      ];
      insert.run(...values);
    },

    // Forgets every Change. What they did stays done.
    clear() {
      removeAll.run();
    }
  };
}

// Whether the row is on what the columns say.
function sameOn(row: ChangeRow, on: Binding[], mediaId: number | null) {
  return (
    ON_COLUMNS.every((c, i) => row[c] === on[i]) && row.media_id === mediaId
  );
}

export type Changes = ReturnType<typeof openChanges>;
