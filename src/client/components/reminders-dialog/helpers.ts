import type { AppState } from '@/client/state';
import type { PersonRow, Reminder } from '@/common/types';

import { imageLabel, personLabel } from '../reminder-dialog/helpers';

// The Reminders the list shows: the open ones, newest first as they come,
// then with `showDone` the done ones.
export function listed(all: Reminder[], showDone: boolean) {
  const open = all.filter((r) => r.done === null);
  return showDone ? [...open, ...all.filter((r) => r.done !== null)] : open;
}

// What a Reminder is on, as the list names it: the person and their
// years, the Citation's person and its source, or the Volume and Image.
export function onLabel(reminder: Reminder, persons: Map<number, PersonRow>) {
  const { on } = reminder;
  if (on.kind === 'person') return personLabel(persons, on.personId);
  if (on.kind === 'citation') {
    const source = on.reference ?? on.source ?? 'their Citation';
    return `${personLabel(persons, on.personId)} — ${source}`;
  }
  return imageLabel(on.volume, on.image);
}

// Whether it's on an Image from an earlier filming, which it can't go to.
export function isStale(reminder: Reminder) {
  return reminder.on.kind === 'image' && reminder.on.stale;
}

// What going to it is called: to its person, its Citation's source, or
// its Image; null for a stale one, which goes nowhere.
export function goLabel(reminder: Reminder) {
  if (isStale(reminder)) return null;
  const kind = reminder.on.kind;
  if (kind === 'person') return 'Show person';
  return kind === 'citation' ? 'Show source' : 'Open Image';
}

// Goes where a Reminder is: selects its person, with a Citation's source
// to unfold in the panel, or opens the Scan viewer at its Image.
export function follow(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  if (on.kind === 'image') {
    if (on.stale) return;
    const { volumeId, volume, image } = on;
    state.viewer.openImage({ volumeId, volume, image });
    return;
  }
  if (on.kind === 'citation') {
    state.selected.revealSource(on.personId, on.citationId);
  }
  state.chart.select(on.personId);
}

// How many are open; null until they've come.
export function openCount(all: Reminder[] | null | 'failed') {
  return Array.isArray(all) ? all.filter((r) => r.done === null).length : null;
}
