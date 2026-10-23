// A dataset's Reminders: on a person, one of their Citations, or an Image
// of a Volume. Only the app keeps them; no export writes them, and a
// re-import's merge carries them (import-merge.ts).

import type { Database } from 'bun:sqlite';

import type {
  CitationRow,
  ReminderChange,
  ReminderOn,
  ReminderTarget
} from '@/common/types';

interface ReminderRow {
  id: number;
  text: string;
  person_id: number | null;
  citation_id: number | null;
  volume_id: string | null;
  volume: string | null;
  image: number | null;
  file_id: string | null;
  created_at: string;
  done_at: string | null;
}

export interface ReminderSources {
  // One of a person's Citations, with whose it is; null for none.
  citationOf: (
    id: number
  ) => { personId: number; citation: CitationRow } | null;
  // Whether a Re-scan replaced the Image's file.
  replaced: (at: {
    volumeId: string;
    image: number;
    fileId: string;
  }) => Promise<boolean>;
}

type Binding = string | number | null;

const NO_TEXT = 'A Reminder needs some text.';

// The text as kept: without blank lines around it.
function textOf(text: string) {
  return text.trim();
}

export function createReminders(db: Database, sources: ReminderSources) {
  const all = db.prepare<ReminderRow, []>(
    'SELECT * FROM reminders ORDER BY created_at DESC, id DESC'
  );
  const byId = db.prepare<ReminderRow, [number]>(
    'SELECT * FROM reminders WHERE id = ?'
  );
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );
  const insert = db.prepare<{ id: number }, [Record<string, Binding>]>(
    `INSERT INTO reminders
       (text, person_id, citation_id, volume_id, volume, image, file_id,
        created_at)
     VALUES ($text, $person, $citation, $volumeId, $volume, $image, $fileId,
       $created)
     RETURNING id`
  );
  const setText = db.prepare('UPDATE reminders SET text = ? WHERE id = ?');
  const setDone = db.prepare('UPDATE reminders SET done_at = ? WHERE id = ?');
  const deleteRow = db.prepare('DELETE FROM reminders WHERE id = ?');

  async function onOf(row: ReminderRow): Promise<ReminderOn> {
    const { volume_id: volumeId, volume, image, file_id: fileId } = row;
    if (volumeId !== null) {
      const at = { volumeId, image: image!, fileId: fileId! };
      const stale = await sources.replaced(at);
      return { kind: 'image', volume: volume!, ...at, stale };
    }
    const personId = row.person_id!;
    const cited =
      row.citation_id === null ? null : sources.citationOf(row.citation_id);
    if (cited === null) return { kind: 'person', personId };
    const { citation } = cited;
    return {
      kind: 'citation',
      personId,
      citationId: citation.id,
      source: citation.source,
      reference: citation.reference ?? citation.entry
    };
  }

  async function reminderOf(row: ReminderRow) {
    return {
      id: row.id,
      text: row.text,
      on: await onOf(row),
      created: row.created_at,
      done: row.done_at
    };
  }

  // The columns a new Reminder on the target fills. Null when its person
  // or Citation isn't in the dataset.
  function columnsOf(target: ReminderTarget) {
    const none = {
      $person: null,
      $citation: null,
      $volumeId: null,
      $volume: null,
      $image: null,
      $fileId: null,
      $created: new Date().toISOString()
    };
    if ('personId' in target) {
      if (personExists.get(target.personId) === null) return null;
      return { ...none, $person: target.personId };
    }
    if ('citationId' in target) {
      const cited = sources.citationOf(target.citationId);
      if (cited === null) return null;
      return {
        ...none,
        $person: cited.personId,
        $citation: target.citationId
      };
    }
    const { volumeId, volume, image, fileId } = target;
    return {
      ...none,
      $volumeId: volumeId,
      $volume: volume,
      $image: image,
      $fileId: fileId
    };
  }

  return {
    // Every Reminder, newest first, open or done.
    async list() {
      return await Promise.all(all.all().map(reminderOf));
    },

    // Writes a Reminder on the target. Null when its person or Citation
    // isn't in the dataset.
    async add(text: string, target: ReminderTarget) {
      const kept = textOf(text);
      if (kept === '') return { rejected: NO_TEXT };
      const columns = columnsOf(target);
      if (columns === null) return null;
      const { id } = insert.get({ ...columns, $text: kept })!;
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

export type Reminders = ReturnType<typeof createReminders>;
