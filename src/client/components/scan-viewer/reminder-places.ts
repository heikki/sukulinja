import type { AppState } from '@/client/state';
import { remindersOn } from '@/client/state/reminders';
import type { Link, VolumeCitation } from '@/common/types';

import type { ReminderPlace, ReminderPlaces } from '../reminder-dialog';
import { citationHeader, imageHeader } from '../reminder-dialog/header';
import { groupCitations, rowName } from './citations';

// The Volume's rows linking the Image shown, in the order the people
// beside the scan list them.
function rowsHere(state: AppState) {
  const rows = state.viewer.citations.get();
  if (!Array.isArray(rows)) return [];
  const persons = state.chart.people.get().persons;
  function nameOf(row: VolumeCitation) {
    return rowName(persons, row);
  }
  return groupCitations(rows, state.viewer.image.get(), nameOf).flatMap(
    (g) => g.rows
  );
}

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
    return { cited: null, image: onImage };
  }
  const citationId = source.citation.id;
  const places: ReminderPlaces = {
    cited: {
      header: citationHeader(state, { personId, citationId }),
      target: { citationId }
    },
    image: onImage
  };
  return places;
}

// The open Reminders on the Image shown, or on a Citation linking it; a
// stale one isn't.
export function remindersHere(state: AppState) {
  const all = state.reminders.all.get();
  const volume = state.viewer.volume.get();
  if (!Array.isArray(all) || volume === null) return [];
  const ids = new Set(rowsHere(state).map((r) => r.citation.id));
  const image = state.viewer.image.get();
  return remindersOn(all, { volumeId: volume.id, image }, ids);
}
