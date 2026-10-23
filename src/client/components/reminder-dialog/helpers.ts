import type { PersonRow, ReminderOn, ReminderTarget } from '@/common/types';

import { formatDates, formatName } from '../tree-view/renderer';

// Something a Reminder can be put on, as the dialog's On picker lists it.
export interface ReminderChoice {
  label: string;
  target: ReminderTarget;
}

// A person by name, with their years, as names repeat in a family.
export function personLabel(persons: Map<number, PersonRow>, id: number) {
  const person = persons.get(id);
  if (person === undefined) return 'Someone';
  const dates = formatDates(person);
  const name = formatName(person);
  return dates === '' ? name : `${name} (${dates})`;
}

// What a Reminder is on, as a new one would be put there.
export function targetOf(on: ReminderOn): ReminderTarget {
  if (on.kind === 'person') return { personId: on.personId };
  if (on.kind === 'citation') return { citationId: on.citationId };
  const { volumeId, volume, image, fileId } = on;
  return { volumeId, volume, image, fileId };
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
