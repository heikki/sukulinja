// What something kept beside the tree is on (a person, one of their
// Citations, or an Image), as the app names it and goes to it: what a
// Reminder or a Change is on.

import type { AppState } from '@/client/state';
import type { On, PersonRow } from '@/common/types';

import { formatDates, formatName } from './components/tree-view/renderer';
import { volumeTitle } from './link-labels';

// A person by name, with their years, as names repeat in a family.
export function personLabel(persons: Map<number, PersonRow>, id: number) {
  const person = persons.get(id);
  if (person === undefined) return 'Someone';
  const dates = formatDates(person);
  const name = formatName(person);
  return dates === '' ? name : `${name} (${dates})`;
}

// An Image by its Volume, named as the Scan viewer names it, and number.
export function imageLabel(volume: string, image: number) {
  return `${volumeTitle(volume)}, Image ${image}`;
}

// What it's on, as a list names it: the person and their years, the
// Citation's person and its source, or the Volume and Image.
export function onLabel(on: On, persons: Map<number, PersonRow>) {
  if (on.kind === 'person') return personLabel(persons, on.personId);
  if (on.kind === 'citation') {
    const source = on.reference ?? on.source ?? 'their Citation';
    return `${personLabel(persons, on.personId)} — ${source}`;
  }
  return imageLabel(on.volume, on.image);
}

// Whether it's on an Image from an earlier filming, which it can't go to.
export function isStale(on: On) {
  return on.kind === 'image' && on.stale;
}

// Goes where it is: selects its person, and for a Citation, opens its
// source in the Scan viewer once their Links are in; or opens the Scan
// viewer at its Image. A stale Image, nowhere.
export function goTo(state: AppState, on: On) {
  if (on.kind === 'image') {
    if (on.stale) return;
    const { volumeId, volume, image } = on;
    state.viewer.openImage({ volumeId, volume, image });
    return;
  }
  if (on.kind === 'citation') {
    state.chart.toCitation(on.personId, on.citationId);
  } else state.chart.select(on.personId);
}
