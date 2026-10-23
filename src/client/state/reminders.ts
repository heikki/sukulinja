import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { Reminder, ReminderChange, ReminderTarget } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// The dataset's Reminders, asked for once something shows them, and kept
// in step with what's written, changed and deleted here. Each change
// throws ApiError if it's refused.
export interface Reminders {
  // Every Reminder, newest first, open or done; null until they arrive.
  all: Readable<Reminder[] | null | 'failed'>;
  // Asks for them, unless they've come or are coming.
  load: () => void;
  remind: (text: string, on: ReminderTarget) => Promise<Reminder>;
  change: (id: number, change: ReminderChange) => Promise<void>;
  remove: (id: number) => Promise<void>;
  // The Reminder open in its dialog, as it now stands: gone once it's
  // deleted.
  shown: Readable<Reminder | null>;
  // Opens one in its dialog, or closes it with null.
  show: (id: number | null) => void;
  // Opens one in its dialog, or closes it if it's open: true when it
  // opened.
  toggle: (id: number) => boolean;
}

// The open Reminders on an Image of a Volume, not stale, or on one of the
// Citations `citations` names.
export function remindersOn(
  all: Reminder[],
  at: { volumeId: string; image: number },
  citations: Set<number>
) {
  return all.filter(({ on, done }) => {
    if (done !== null) return false;
    if (on.kind === 'citation') return citations.has(on.citationId);
    return (
      on.kind === 'image' &&
      !on.stale &&
      on.volumeId === at.volumeId &&
      on.image === at.image
    );
  });
}

export function openReminders(api: DatasetApi): Reminders {
  const all = signal<Reminder[] | null | 'failed'>(null);
  const shownId = signal<number | null>(null);
  const shown = computed(() => {
    const id = shownId.get();
    const rows = all.get();
    if (id === null || !Array.isArray(rows)) return null;
    return rows.find((r) => r.id === id) ?? null;
  });
  const req = new Latest();
  let asked = false;

  async function load() {
    asked = true;
    const rows = await req.run(async (s) => await api.reminders(s));
    if (rows === undefined) return;
    if (rows === null) asked = false;
    all.set(rows ?? 'failed');
  }

  // Each Reminder as `update` leaves it; asked for anew when they haven't
  // all come.
  function edit(update: (rows: Reminder[]) => Reminder[]) {
    const rows = all.get();
    if (Array.isArray(rows)) all.set(update(rows));
    else void load();
  }

  return {
    all,
    load() {
      if (!asked) void load();
    },
    async remind(text, on) {
      const made = await api.remind(text, on);
      edit((rows) => [made, ...rows]);
      return made;
    },
    async change(id, change) {
      const changed = await api.changeReminder(id, change);
      edit((rows) => rows.map((r) => (r.id === id ? changed : r)));
    },
    async remove(id) {
      await api.deleteReminder(id);
      edit((rows) => rows.filter((r) => r.id !== id));
    },
    shown,
    show(id) {
      shownId.set(id);
    },
    toggle(id) {
      const opening = shownId.get() !== id;
      shownId.set(opening ? id : null);
      return opening;
    }
  };
}
