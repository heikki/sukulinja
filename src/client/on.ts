// What something kept beside the tree is on (a person, one of their
// Citations, an Image, or for a Change a Photo), as the app names it and
// goes to it: what a Reminder or a Change is on.

import type { AppState } from '@/client/state';
import type { ChangeOn, On, PersonRow } from '@/common/types';

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
export function isStale(on: ChangeOn) {
  return on.kind === 'image' && on.stale;
}

// Selects the person and opens the Photo, stepping through their Photos
// while they're in it, else through every Photo. One that's gone, or
// that can't be read, is left closed.
async function openPhotoOf(state: AppState, personId: number, id: number) {
  state.chart.select(personId);
  const photos = await state.api.photos().catch(() => null);
  const photo = photos?.find((p) => p.id === id);
  if (photo === undefined) return;
  const theirs = photo.people.some((p) => p.personId === personId);
  state.chart.openPhoto(photo, theirs ? 'person' : 'all');
}

// Goes where it is: selects its person, and for a Citation, opens its
// source in the Scan viewer once their Links are in, or for a Photo, opens
// it in the Photo viewer; or opens the Scan viewer at its Image. A stale
// Image, nowhere.
export function goTo(state: AppState, on: ChangeOn) {
  if (on.kind === 'photo') {
    void openPhotoOf(state, on.personId, on.photoId);
    return;
  }
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
