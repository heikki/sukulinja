import type { PersonRow, ReminderOn } from '@/common/types';

import { formatDates, formatName } from '../tree-view/renderer';

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

// What a Reminder is on, in words. An Image is "This Image" when it's
// the one `here` names.
export function placeOf(
  on: ReminderOn,
  persons: Map<number, PersonRow>,
  here?: { volumeId: string; image: number }
) {
  if (on.kind === 'person') return personLabel(persons, on.personId);
  if (on.kind === 'citation') {
    return `${personLabel(persons, on.personId)} — their Citation`;
  }
  const same = here?.volumeId === on.volumeId && here.image === on.image;
  return same ? 'This Image' : imageLabel(on.volume, on.image);
}
