// The Event an Entry records (ADR-0033), chosen on its card: a baptism, a
// marriage, a burial or a household line. It gives the Roles the Entry
// names its people in. A Volume may hold several Registers and its label
// doesn't say so, so the Book only gives the first guess, after the Entry
// before it in the Volume.

import { bookKind } from './books';
import type { BookKind, Box, VolumeCitation } from './types';

// GEDCOM's citation EVEN of an Entry.
export type EntryEvent = 'CHR' | 'MARR' | 'BURI' | 'RESI';

export interface EntryRole {
  role: string;
  label: string;
}

// Each Event as the card names it, with its Roles, GEDCOM's citation ROLE.
// A burial or a household line names one person, in none: isäntä or piika
// is who they are in the household, which its Transcription says.
export const ENTRY_EVENTS: ReadonlyArray<{
  event: EntryEvent;
  label: string;
  roles: readonly EntryRole[];
}> = [
  {
    event: 'CHR',
    label: 'Baptism',
    roles: [
      { role: 'CHIL', label: 'Child' },
      { role: 'FATH', label: 'Father' },
      { role: 'MOTH', label: 'Mother' }
    ]
  },
  {
    event: 'MARR',
    label: 'Marriage',
    roles: [
      { role: 'HUSB', label: 'Groom' },
      { role: 'WIFE', label: 'Bride' }
    ]
  },
  { event: 'BURI', label: 'Burial', roles: [] },
  { event: 'RESI', label: 'Household line', roles: [] }
];

export function isEntryEvent(value: unknown): value is EntryEvent {
  return ENTRY_EVENTS.some((e) => e.event === value);
}

// The Event as the card names it: "Baptism".
export function eventLabel(event: EntryEvent) {
  return ENTRY_EVENTS.find((e) => e.event === event)!.label;
}

// The Roles an Entry of the Event names its people in; none with no Event.
export function eventRoles(event: EntryEvent | null): readonly EntryRole[] {
  return ENTRY_EVENTS.find((e) => e.event === event)?.roles ?? [];
}

// The Role's label, of whichever Event has it: "Father".
export function roleLabel(role: string) {
  const all = ENTRY_EVENTS.flatMap((e) => e.roles);
  return all.find((r) => r.role === role)?.label ?? null;
}

const BOOK_EVENTS: Record<BookKind, EntryEvent> = {
  kastetut: 'CHR',
  vihityt: 'MARR',
  haudatut: 'BURI',
  rippi: 'RESI',
  lasten: 'RESI'
};

// The Event an entry in the Volume of the label likely records, by its
// Book; null when the label names none.
export function bookEvent(volume: string): EntryEvent | null {
  const kind = bookKind(volume);
  return kind === null ? null : BOOK_EVENTS[kind];
}

// What a new Entry at the Box on the Image likely records: what the
// nearest Entry before it in the Volume does, above it on the Image, else
// on an earlier Image; else what its Book gives; else null.
export function firstGuess(
  volume: string,
  rows: VolumeCitation[],
  at: { image: number; box: Box }
): EntryEvent | null {
  const before = rows.flatMap((r) => {
    const { link, citation } = r;
    if (link.precision !== 'entry' || citation.entryId === null) return [];
    const { event } = citation;
    if (event === null) return [];
    const above =
      link.image < at.image ||
      (link.image === at.image && link.box.top < at.box.top);
    return above ? [{ event, image: link.image, top: link.box.top }] : [];
  });
  const nearest = before.sort((a, b) =>
    a.image === b.image ? b.top - a.top : b.image - a.image
  );
  return nearest[0]?.event ?? bookEvent(volume);
}
