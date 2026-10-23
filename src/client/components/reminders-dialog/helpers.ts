import type { AppState } from '@/client/state';
import type { PersonRow, Reminder } from '@/common/types';

import { imageLabel, personLabel } from '../reminder-dialog/helpers';

// The Reminders the list shows: the open ones, newest first as they come,
// then with `showDone` the done ones.
export function listed(all: Reminder[], showDone: boolean) {
  const open = all.filter((r) => r.done === null);
  return showDone ? [...open, ...all.filter((r) => r.done !== null)] : open;
}

// What a Reminder is on, as the list names it: the person and their
// years, the Citation's person and its source, or the Volume and Image.
export function onLabel(reminder: Reminder, persons: Map<number, PersonRow>) {
  const { on } = reminder;
  if (on.kind === 'person') return personLabel(persons, on.personId);
  if (on.kind === 'citation') {
    const source = on.reference ?? on.source ?? 'their Citation';
    return `${personLabel(persons, on.personId)} — ${source}`;
  }
  return imageLabel(on.volume, on.image);
}

// Whether it's on an Image from an earlier filming, which it can't go to.
export function isStale(reminder: Reminder) {
  return reminder.on.kind === 'image' && reminder.on.stale;
}

function sourceOf(state: AppState, citationId: number) {
  return state.selected.sources
    .get()
    .flatMap((g) => g.sources)
    .find((s) => s.citation.id === citationId);
}

// Whether a Citation's source may open in the Scan viewer: until the
// Selected person's sources are in to tell, or once they give it a Link
// or Volumes to look through.
export function mayOpen(state: AppState, citationId: number) {
  const source = sourceOf(state, citationId);
  if (source === undefined) return true;
  const { status } = source;
  return status !== null && (status.link !== null || status.browse !== null);
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

// Goes where a Reminder is: selects its person, and for a Citation's,
// opens its source in the Scan viewer once their Links are in; or opens
// the Scan viewer at its Image. A stale one's Image, nowhere.
export async function follow(state: AppState, reminder: Reminder) {
  const { on } = reminder;
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

// Whether the Scan viewer shows where a Reminder is: open on its
// Citation's source, on its Link's Image; or on its Image.
export function shows(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  const { viewer } = state;
  if (on.kind === 'citation') {
    const source = viewer.source.get();
    return source?.citation.id === on.citationId && !viewer.away.get();
  }
  if (on.kind !== 'image' || viewer.opened.get() === null) return false;
  return (
    viewer.volume.get()?.id === on.volumeId && viewer.image.get() === on.image
  );
}

// How many are open; null until they've come.
export function openCount(all: Reminder[] | null | 'failed') {
  return Array.isArray(all) ? all.filter((r) => r.done === null).length : null;
}
