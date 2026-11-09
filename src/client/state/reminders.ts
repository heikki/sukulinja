import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { OnTarget, Reminder, ReminderChange } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// Something a new Reminder can be on, as it's said where it's written.
export interface ReminderPlace {
  header: string[];
  target: OnTarget;
}

// What a new Reminder is on: `base` (the Image shown, or the Selected
// person), or with `cited`, the person's Citation while the person's line
// is ticked.
export interface ReminderPlaces {
  cited: ReminderPlace | null;
  base: ReminderPlace;
}

// The dataset's Reminders, asked for once something shows them, and kept
// in step with what's written, changed and deleted here. Each change
// throws ApiError if it's refused.
export interface Reminders {
  // Every Reminder, newest first, open or done; null until they arrive.
  all: Readable<Reminder[] | null | 'failed'>;
  // Asks for them, unless they've come or are coming.
  load: () => void;
  remind: (text: string, on: OnTarget) => Promise<Reminder>;
  change: (id: number, change: ReminderChange) => Promise<void>;
  remove: (id: number) => Promise<void>;
  // A new Reminder being written in the list, on what it can be on; null
  // while none is.
  drafting: Readable<ReminderPlaces | null>;
  // Starts writing one on `places`, or with null, stops.
  draft: (places: ReminderPlaces | null) => void;
}

export function openReminders(api: DatasetApi): Reminders {
  const all = signal<Reminder[] | null | 'failed'>(null);
  const drafting = signal<ReminderPlaces | null>(null);
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
    drafting,
    draft(places) {
      drafting.set(places);
    }
  };
}
