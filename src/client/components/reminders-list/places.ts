import type { AppState } from '@/client/state';
import type { ReminderPlaces } from '@/client/state/reminders';

import { imageHeader, personHeader } from './header';

// What a Reminder written now can be on: the Selected person, and the
// Image the Scan viewer shows once Astia lists its file. Null with
// neither.
export function placesHere(state: AppState): ReminderPlaces | null {
  const personId = state.selected.id.get();
  const person =
    personId === null
      ? null
      : { personId, header: personHeader(state, personId)[0] ?? '' };
  const volume = state.viewer.volume.get();
  const fileId = state.viewer.fileIdHere();
  const at =
    state.viewer.opened.get() === null || volume === null || fileId === null
      ? null
      : {
          volumeId: volume.id,
          volume: volume.label,
          image: state.viewer.image.get(),
          fileId
        };
  const image = at === null ? null : { at, header: imageHeader(at)[0] ?? '' };
  if (person === null && image === null) return null;
  return { person, image };
}
