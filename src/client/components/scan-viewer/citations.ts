import { certaintyName, linkName } from '@client/link-labels';
import type {
  Box,
  Certainty,
  PersonRow,
  Precision,
  VolumeCitation
} from '@common/types';

import { formatName } from '../tree-view/renderer';

// A row's person by name, or the record's name for one not in the tree.
export function rowName(persons: Map<number, PersonRow>, row: VolumeCitation) {
  const person = persons.get(row.personId);
  return person === undefined
    ? (row.citation.record?.name ?? '—')
    : formatName(person);
}

// Entries in the order they're written on the Image, where the model said
// where; the rest by name.
function byPlace(nameOf: (row: VolumeCitation) => string) {
  return (a: VolumeCitation, b: VolumeCitation) => {
    const top = (boxOf(a)?.top ?? Infinity) - (boxOf(b)?.top ?? Infinity);
    if (top !== 0 && !Number.isNaN(top)) return top;
    return nameOf(a).localeCompare(nameOf(b), 'fi');
  };
}

// The groups, in order, named as the person panel names their Links: a
// Mark is split by whether it says where on the Image the entry is.
const GROUPED: Array<{ certainty: Certainty; precision?: Precision }> = [
  { certainty: 'marked', precision: 'entry' },
  { certainty: 'marked', precision: 'image' },
  { certainty: 'match' },
  { certainty: 'estimated' }
];

// The Volume's rows linking the Image shown, grouped by who says so:
// Marked, then Marked Image, then Matches left to confirm, then
// Estimated ones. Those known only to be in the Volume aren't known to be
// here, so they're left out.
export function groupCitations(
  rows: VolumeCitation[],
  image: number,
  nameOf: (row: VolumeCitation) => string
) {
  const shown = rows.filter((r) => imageOf(r) === image);
  const order = byPlace(nameOf);
  return GROUPED.map(({ certainty, precision }) => ({
    label:
      precision === undefined
        ? certaintyName(certainty)
        : linkName(certainty, precision),
    rows: shown
      .filter(
        (r) =>
          r.link.certainty === certainty &&
          (precision === undefined || r.link.precision === precision)
      )
      .toSorted(order)
  })).filter((g) => g.rows.length > 0);
}

// The Image a row links, or null for one known only to be in the Volume.
export function imageOf(row: VolumeCitation) {
  return 'image' in row.link ? row.link.image : null;
}

// Where on its Image a row's entry is, when its Link points at the entry.
export function boxOf(row: VolumeCitation) {
  return row.link.precision === 'entry' ? row.link.box : null;
}

// An entry marked on an Image, by the markKey its Citations share.
export interface Entry {
  key: string;
  box: Box;
  rows: VolumeCitation[];
}

// The entries marked on the Image shown: one per record, with the rows of
// everyone citing it.
export function entriesOn(rows: VolumeCitation[], image: number) {
  const entries = new Map<string, Entry>();
  for (const row of rows) {
    const box = boxOf(row);
    if (imageOf(row) !== image || box === null) continue;
    const key = row.citation.markKey;
    const entry = entries.get(key) ?? { key, box, rows: [] };
    entry.rows.push(row);
    entries.set(key, entry);
  }
  return [...entries.values()];
}
