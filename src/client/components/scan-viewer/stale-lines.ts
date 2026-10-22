import type { PersonRow, StalePin, VolumeCitation } from '@/common/types';

import { rowName } from './citations';

function byImage(a: StalePin, b: StalePin) {
  return a.image - b.image;
}

function pagesOf(pages: number[]) {
  return pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join('–')}`;
}

// Who cites what a pin pins, by name and where in the Volume; the record
// or nothing when no one in the Volume's citations does.
function citing(
  pin: StalePin,
  rows: VolumeCitation[],
  persons: Map<number, PersonRow>
) {
  const of = rows.filter((r) => r.citation.markKey === pin.markKey);
  if (of.length === 0) {
    return pin.record === undefined ? 'a reference' : `record ${pin.record}`;
  }
  return of
    .map((r) => {
      const entry = r.citation.entry;
      const name = rowName(persons, r);
      return entry === null ? name : `${name}, ${entry}`;
    })
    .join('; ');
}

// A line for each pin switching leaves out, hand marks first, then the
// vision model's matches, then Page pins (one per Image and pages);
// Rejections aren't worth a line.
export function staleLines(
  stale: StalePin[],
  rows: VolumeCitation[],
  persons: Map<number, PersonRow>
) {
  const entries = stale.filter(
    (p) => p.kind === 'record' || p.kind === 'reference'
  );
  const marks = entries.filter((p) => p.by === 'hand').toSorted(byImage);
  const matches = entries.filter((p) => p.by === 'vision').toSorted(byImage);
  const pages = new Map<string, StalePin>();
  for (const p of stale.filter((s) => s.kind === 'page').toSorted(byImage)) {
    pages.set(`${p.image} ${pagesOf(p.pages ?? [])}`, p);
  }
  return [
    ...marks.map((p) => `Mark: ${citing(p, rows, persons)}, Image ${p.image}`),
    ...matches.map(
      (p) => `Match: ${citing(p, rows, persons)}, Image ${p.image}`
    ),
    ...[...pages.values()].map(
      (p) => `Page pin: ${pagesOf(p.pages ?? [])}, Image ${p.image}`
    )
  ];
}
