import { imageLabel, isStale, onLabel, personLabel } from '@/client/on';
import type { Change, ChangeWhat, On, PersonRow } from '@/common/types';

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// Where in a Volume: its Image, or only the Volume.
function inVolume(volume: string, image: number | null) {
  return image === null ? volume : imageLabel(volume, image);
}

// What a Change did, in a few words.
export function doneLabel(what: ChangeWhat) {
  switch (what.kind) {
    case 'mark':
      if (what.confirmed) return 'Confirmed the Match';
      if (what.moved) return 'Moved the entry';
      return `Marked the ${what.at === 'entry' ? 'entry' : what.at === 'image' ? 'Image' : 'Volume'}`;
    case 'discard':
      return what.rejection ? 'Rejected the Match' : 'Discarded the Box';
    case 'cite':
      return 'Cited the entry';
    case 'uncite':
      return 'Deleted a Citation';
    case 'import':
      return what.merged
        ? `Imported ${what.file} again`
        : `Imported ${what.file}`;
    case 'undo-import':
      return 'Undid the last import';
    case 'switch-filming':
      return 'Switched to the new filming';
  }
}

// Where it was done, and what more it said: the Volume and Image, a
// deleted Citation's text, what an import couldn't keep, or a filming's
// Image counts. Null when there's nothing more.
export function detailOf(what: ChangeWhat) {
  switch (what.kind) {
    case 'mark': {
      const parts = [inVolume(what.volume, what.image)];
      if (what.citations > 1) {
        parts.push(`in ${count(what.citations, 'Citation', 'Citations')}`);
      }
      if (what.pagePin !== null) parts.push(`pinned page ${what.pagePin}`);
      return parts.join(', ');
    }
    case 'discard':
    case 'cite':
      return imageLabel(what.volume, what.image);
    case 'uncite':
      return what.cited;
    case 'import':
      return what.lost === 0 ? null : `${what.lost} not kept`;
    case 'undo-import':
      return null;
    case 'switch-filming': {
      const images = `${what.volume}, ${what.from} → ${what.to} Images`;
      return what.stale === 0
        ? images
        : `${images}, ${count(what.stale, 'pin', 'pins')} left out`;
    }
  }
}

// A name as GEDCOM writes it, "Matti /Esimerkki/", as it reads.
function plainName(name: string) {
  return name.replaceAll('/', ' ').replaceAll(/\s+/g, ' ').trim();
}

// Whom it was on, as the list names them: the person and their years, or,
// once they're gone, their name as it was then. Null for no one.
export function whoseLabel(change: Change, persons: Map<number, PersonRow>) {
  const { on, who } = change;
  if (on?.kind === 'image') return onLabel(on, persons);
  if (on !== null) return personLabel(persons, on.personId);
  return who === null ? null : plainName(who);
}

// The line under what was done: whom and where.
export function whereLabel(change: Change, persons: Map<number, PersonRow>) {
  const parts = [whoseLabel(change, persons), detailOf(change.what)];
  return parts.filter((p) => p !== null).join(' · ');
}

// Where picking it goes; null for nowhere: a Change on nothing, or on an
// Image from an earlier filming.
export function leadsTo(change: Change): On | null {
  const { on } = change;
  return on === null || isStale(on) ? null : on;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// A day as the list heads it: Today, Yesterday, or its date.
function dayLabel(d: Date, now: Date) {
  if (dayKey(d) === dayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// The Changes, newest first as they come, in runs of one day each, in the
// local time.
export function byDay(changes: Change[], now = new Date()) {
  const days: Array<{ day: string; changes: Change[] }> = [];
  let last: string | null = null;
  for (const change of changes) {
    const at = new Date(change.at);
    const key = dayKey(at);
    if (key !== last) days.push({ day: dayLabel(at, now), changes: [] });
    days.at(-1)!.changes.push(change);
    last = key;
  }
  return days;
}

// When in its day, as hours and minutes.
export function timeLabel(at: string) {
  return new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
}
