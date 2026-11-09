// What something kept beside the tree is on (a person, one of their
// Citations, or an Image), as the app names it and goes to it: what a
// Reminder or a Change is on.

import type { AppState } from '@/client/state';
import type { On, PersonRow } from '@/common/types';

import { formatDates, formatName } from './components/tree-view/renderer';

// A person by name, with their years, as names repeat in a family.
export function personLabel(persons: Map<number, PersonRow>, id: number) {
  const person = persons.get(id);
  if (person === undefined) return 'Someone';
  const dates = formatDates(person);
  const name = formatName(person);
  return dates === '' ? name : `${name} (${dates})`;
}

// An Image by its Volume and number.
export function imageLabel(volume: string, image: number) {
  return `${volume}, Image ${image}`;
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

function sourceOf(state: AppState, citationId: number) {
  return state.selected.sources
    .get()
    .flatMap((g) => g.sources)
    .find((s) => s.citation.id === citationId);
}

// Opens a source of the Selected person in the Scan viewer, as clicking
// it in the panel does: at its Link, or with none, looking through its
// parish's Volumes. Not one the viewer has no way into.
export function openSource(state: AppState, citationId: number) {
  const source = sourceOf(state, citationId);
  const status = source?.status ?? null;
  if (source === undefined || status === null) return;
  const { citation } = source;
  if (status.link !== null) state.viewer.open({ citation, link: status.link });
  else if (status.browse !== null) {
    state.viewer.open({ citation, link: null, unlinked: status.browse });
  }
}

// Goes where it is: selects its person, and for a Citation, opens its
// source in the Scan viewer once their Links are in; or opens the Scan
// viewer at its Image. A stale Image, nowhere.
export async function goTo(state: AppState, on: On) {
  if (on.kind === 'image') {
    if (on.stale) return;
    const { volumeId, volume, image } = on;
    state.viewer.openImage({ volumeId, volume, image });
    return;
  }
  state.chart.select(on.personId);
  // Not once a change pending in the Scan viewer holds the selection up.
  if (on.kind !== 'citation' || state.selected.id.get() !== on.personId) {
    return;
  }
  await state.selected.select(on.personId);
  if (state.selected.id.get() === on.personId) {
    openSource(state, on.citationId);
  }
}
