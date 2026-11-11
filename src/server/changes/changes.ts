// A dataset's Changes: what was done in the app that changed it, each with
// what it was on (on.ts), or the Photo a Tag was in, with its person. Only
// the app keeps them; no export writes them, a re-import's merge carries
// them (import/merge.ts), and undoing an import puts back the ones its
// database had.

import type { Database } from 'bun:sqlite';

import type {
  Change,
  ChangeOn,
  ChangeTarget,
  ChangeWhat,
  NewChange
} from '@/common/types';

import { ON_COLUMNS, openOn } from '../on';
import type { OnRow, OnSources } from '../on';

interface ChangeRow extends OnRow {
  id: number;
  at: string;
  what: string;
  who: string | null;
  media_id: number | null;
}

type Binding = string | number | null;

const COLUMNS = ['at', 'what', 'who', ...ON_COLUMNS, 'media_id'] as const;

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
      who: row.who
    };
  }

  return {
    // Every Change, newest first.
    async list() {
      return await Promise.all(all.all().map(changeOf));
    },

    // Writes a Change. One whose person or Citation isn't in the dataset is
    // written on nothing; one whose Photo isn't, on its person.
    add(change: NewChange) {
      const { on, mediaId } = columnsOf(change.on);
      const personId = on?.person_id ?? null;
      const who = personId === null ? null : nameOf.get(personId)?.full_text;
      const values: Binding[] = [
        new Date().toISOString(),
        JSON.stringify(change.what),
        who ?? null,
        ...ON_COLUMNS.map((c) => on?.[c] ?? null),
        mediaId
      ];
      insert.run(...values);
    }
  };
}

export type Changes = ReturnType<typeof openChanges>;
