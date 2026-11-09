import { volumeTitle } from '@/client/link-labels';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { formatName } from '../tree-view/renderer';

function nameOf(state: AppState, personId: number) {
  const person = state.chart.people.get().persons.get(personId);
  return person === undefined ? 'Someone' : formatName(person);
}

// A person, as a header: their name.
export function personHeader(state: AppState, personId: number) {
  return [nameOf(state, personId)];
}

// An Image, as a header: its Volume, named as the Scan viewer names it,
// and number.
export function imageHeader(at: { volume: string; image: number }) {
  return [`${volumeTitle(at.volume)} · Image ${at.image}`];
}

// What a Reminder is on, as its lines head it: the person's name, then
// the Volume and Image.
export function headerOf(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  if (on.kind === 'person') return personHeader(state, on.personId);
  const image = imageHeader(on);
  if (on.personId === null) return image;
  return [nameOf(state, on.personId), ...image];
}
