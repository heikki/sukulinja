import { imageLabel, personLabel } from '@/client/on';
import type { On, PersonRow } from '@/common/types';

// What a Reminder is on, in words. An Image is "This Image" when it's
// the one `here` names.
export function placeOf(
  on: On,
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
