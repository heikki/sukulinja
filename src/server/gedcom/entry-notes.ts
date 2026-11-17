// What an Entry says in GEDCOM 7 (ADR-0033), written by the export and read
// back by the import. Its Event's date is the citation's DATA DATE, which
// other programs read; each of its dates, its village and its farm is a
// NOTE on the citation too ("Born: 3 MAR 1761", "Farm: Mäkelä"), as the
// Annotation's are (astia-links.ts), which the import reads back into the
// Entry. A citation has one DATA DATE, and a baptism two dates.

import { ENTRY_EVENTS } from '@/common/entry-events';
import type { EntryFields } from '@/common/entry-events';

type Key = keyof EntryFields;

// Each NOTE's label and the field it holds: a date by its label on the
// card ("Born", "Baptised" …), whichever Event's it is.
const LABELS: ReadonlyArray<readonly [string, Key]> = [
  ...new Map(
    ENTRY_EVENTS.flatMap((e) => e.dates.map((d) => [d.label, d.key] as const))
  ).entries(),
  ['Village', 'village'],
  ['Farm', 'farm']
];

const NOTE = /^(?<label>[A-Z][a-z]+): (?<value>.+)$/su;

// The NOTEs of what the Entry of the Event says, its dates by its Event's
// labels.
export function entryNotes(
  dates: ReadonlyArray<{ key: Key; label: string }>,
  fields: EntryFields
) {
  const named = [
    ...dates,
    { key: 'village' as const, label: 'Village' },
    { key: 'farm' as const, label: 'Farm' }
  ];
  return named.flatMap(({ key, label }) => {
    const value = fields[key];
    return value === null ? [] : [`${label}: ${value}`];
  });
}

// The field a NOTE says and its value, or null for any other NOTE.
export function entryNoteOf(note: string): [Key, string] | null {
  const groups = NOTE.exec(note)?.groups;
  if (groups === undefined) return null;
  const found = LABELS.find(([label]) => label === groups.label);
  return found === undefined ? null : [found[1], groups.value!];
}
