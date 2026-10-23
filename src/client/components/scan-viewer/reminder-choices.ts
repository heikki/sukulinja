import type { AppState } from '@/client/state';
import { remindersOn } from '@/client/state/reminders';
import type { VolumeCitation } from '@/common/types';

import { imageLabel, personLabel } from '../reminder-dialog/helpers';
import type { ReminderChoice } from '../reminder-dialog/helpers';
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

// What a Reminder written on the Image shown can be on: the Image, then
// for each person beside the scan, their Citation, then them. It starts on
// the Citation `from` names, or on the Image. Null until Astia lists the
// Image's file.
export function reminderChoices(state: AppState, from: number | null) {
  const volume = state.viewer.volume.get();
  const fileId = state.viewer.fileIdHere();
  if (volume === null || fileId === null) return null;
  const image = state.viewer.image.get();
  const persons = state.chart.people.get().persons;
  const choices: ReminderChoice[] = [
    {
      label: `This Image (${imageLabel(volume.label, image)})`,
      target: { volumeId: volume.id, volume: volume.label, image, fileId }
    }
  ];
  const named = new Set<number>();
  for (const row of rowsHere(state)) {
    const name = personLabel(persons, row.personId);
    choices.push({
      label: `${name} — their Citation`,
      target: { citationId: row.citation.id }
    });
    if (named.has(row.personId)) continue;
    named.add(row.personId);
    choices.push({ label: name, target: { personId: row.personId } });
  }
  const at = choices.findIndex(
    (c) => 'citationId' in c.target && c.target.citationId === from
  );
  return { choices, chosen: Math.max(0, at) };
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
