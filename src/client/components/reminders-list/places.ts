import type { AppState } from '@/client/state';
import type { ReminderPlace, ReminderPlaces } from '@/client/state/reminders';
import type { Link } from '@/common/types';

import { citationHeader, imageHeader, personHeader } from './header';

// Whether a Link points to that Image of the Volume.
function linksImage(
  link: Link | null,
  at: { volumeId: string; image: number }
) {
  return (
    link !== null &&
    link.volumeId === at.volumeId &&
    'image' in link &&
    link.image === at.image
  );
}

// What a Reminder written on the Image shown is on: the Image, or while
// the Selected person's source links it, their Citation, with the Image
// the one to fall back on. Null until Astia lists the Image's file.
export function reminderPlaces(state: AppState) {
  const volume = state.viewer.volume.get();
  const fileId = state.viewer.fileIdHere();
  if (volume === null || fileId === null) return null;
  const image = state.viewer.image.get();
  const at = { volumeId: volume.id, volume: volume.label, image };
  const onImage: ReminderPlace = {
    header: imageHeader(state, at),
    target: { ...at, fileId }
  };
  const source = state.viewer.source.get();
  const personId = state.selected.id.get();
  if (source === null || personId === null || !linksImage(source.link, at)) {
    return { cited: null, base: onImage };
  }
  const citationId = source.citation.id;
  const places: ReminderPlaces = {
    cited: {
      header: citationHeader(state, { personId, citationId }),
      target: { citationId }
    },
    base: onImage
  };
  return places;
}

// What a Reminder written now is on: as `reminderPlaces` says while the
// Scan viewer shows an Image, or else the Selected person; null with
// neither.
export function placesHere(state: AppState): ReminderPlaces | null {
  if (state.viewer.opened.get() !== null) return reminderPlaces(state);
  const personId = state.selected.id.get();
  if (personId === null) return null;
  return {
    cited: null,
    base: { header: personHeader(state, personId), target: { personId } }
  };
}
