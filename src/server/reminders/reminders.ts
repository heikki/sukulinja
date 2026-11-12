// A dataset's Reminders: on a person, or an Image of a Volume, maybe
// about a person too. Only the app keeps them, and no export writes them.

import type { Database } from 'bun:sqlite';

import type {
  On,
  ReminderChange,
  ReminderOn,
  ReminderTarget
} from '@/common/types';

import { ON_COLUMNS, openOn } from '../on';
import type { OnRow, OnSources } from '../on';

// The columns that say what a Reminder is on: those of anything on
// something, but for a Citation's.
const COLUMNS = ON_COLUMNS.filter((c) => c !== 'citation_id');

interface ReminderRow extends Omit<OnRow, 'citation_id'> {
  id: number;
  text: string;
  created_at: string;
  done_at: string | null;
}

type Binding = string | number | null;

const NO_TEXT = 'A Reminder needs some text.';

// What a Reminder is on, as its row describes it: never a Citation, as a
// Reminder can't be on one.
function reminderOn(on: On): ReminderOn {
  return on.kind === 'citation'
    ? { kind: 'person', personId: on.personId }
    : on;
}

// The text as kept: without blank lines around it.
function textOf(text: string) {
  return text.trim();
}

export function createReminders(db: Database, sources: OnSources) {
  const ons = openOn(db, sources);
  const all = db.prepare<ReminderRow, []>(
    'SELECT * FROM reminders ORDER BY created_at DESC, id DESC'
  );
  const byId = db.prepare<ReminderRow, [number]>(
    'SELECT * FROM reminders WHERE id = ?'
  );
  const insert = db.prepare<{ id: number }, Binding[]>(
    `INSERT INTO reminders (text, ${COLUMNS.join(', ')}, created_at)
     VALUES (${['text', ...COLUMNS, 'created_at'].map(() => '?').join(', ')})
     RETURNING id`
  );
  const setText = db.prepare('UPDATE reminders SET text = ? WHERE id = ?');
  const setDone = db.prepare('UPDATE reminders SET done_at = ? WHERE id = ?');
  const deleteRow = db.prepare('DELETE FROM reminders WHERE id = ?');

  async function reminderOf(row: ReminderRow) {
    return {
      id: row.id,
      text: row.text,
      // A Reminder is always on something.
      on: reminderOn((await ons.describe({ ...row, citation_id: null }))!),
      created: row.created_at,
      done: row.done_at
    };
  }

  return {
    // Every Reminder, newest first, open or done.
    async list() {
      return await Promise.all(all.all().map(reminderOf));
    },

    // Writes a Reminder on the target. Null when its person isn't in the
    // dataset.
    async add(text: string, target: ReminderTarget) {
      const kept = textOf(text);
      if (kept === '') return { rejected: NO_TEXT };
      const on = ons.columnsOf(target);
      if (on === null) return null;
      const created = new Date().toISOString();
      const values = COLUMNS.map((c) => on[c]);
      const { id } = insert.get(kept, ...values, created)!;
      return await reminderOf(byId.get(id)!);
    },

    // Changes its text, or marks it done or open again. Null when there's
    // no such Reminder.
    async change(id: number, change: ReminderChange) {
      const row = byId.get(id);
      if (row === null) return null;
      const text = change.text === undefined ? null : textOf(change.text);
      if (text === '') return { rejected: NO_TEXT };
      db.transaction(() => {
        if (text !== null) setText.run(text, id);
        if (change.done === true && row.done_at === null) {
          setDone.run(new Date().toISOString(), id);
        }
        if (change.done === false) setDone.run(null, id);
      })();
      return await reminderOf(byId.get(id)!);
    },

    // Deletes it; false when there's no such Reminder.
    remove(id: number) {
      return deleteRow.run(id).changes > 0;
    }
  };
}
