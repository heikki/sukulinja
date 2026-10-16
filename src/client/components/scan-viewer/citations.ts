import type { Box, CitationRow, Scan, VolumeCitation } from '@common/types';

// How a row's link to the Image was found, said of the row.
const METHOD_LABELS: Record<VolumeCitation['method'], string> = {
  placed: 'Placed',
  anchored: 'Anchored',
  estimated: 'Estimated',
  volume: 'Volume only'
};

// The method, a vision match told apart, and a Split marked as one of
// several Volumes.
export function citationLabel(row: VolumeCitation) {
  const method =
    row.method === 'placed' && row.by === 'vision'
      ? 'Vision match'
      : METHOD_LABELS[row.method];
  return row.split ? `${method} · one of several Volumes` : method;
}

// The cited page: every row is in the Volume shown, so its parish and Book
// go without saying. A reference naming no page says what it is.
export function citedAs(row: VolumeCitation) {
  const { citedPage, reference } = row.citation;
  return citedPage === null ? (reference ?? '') : `p.\u00a0${citedPage}`;
}

export interface CitationGroup {
  label: string;
  rows: VolumeCitation[];
}

// Placed entries in the order they're written on the Image, where the
// model said where; the rest by name.
function byPlace(nameOf: (row: VolumeCitation) => string) {
  return (a: VolumeCitation, b: VolumeCitation) => {
    const top = (a.box?.top ?? Infinity) - (b.box?.top ?? Infinity);
    if (top !== 0 && !Number.isNaN(top)) return top;
    return nameOf(a).localeCompare(nameOf(b), 'fi');
  };
}

// The Volume's rows for the Image shown: Placed ones, then those probably
// here (Anchored and Estimated), then those known only to be in the Volume.
export function groupCitations(
  rows: VolumeCitation[],
  image: number,
  nameOf: (row: VolumeCitation) => string
) {
  const here = rows.filter((r) => r.image === image);
  const groups: CitationGroup[] = [
    { label: 'Placed', rows: here.filter((r) => r.method === 'placed') },
    { label: 'Probably here', rows: here.filter((r) => r.method !== 'placed') },
    { label: 'In this Volume', rows: rows.filter((r) => r.image === null) }
  ];
  const order = byPlace(nameOf);
  return groups
    .map((g) => ({ ...g, rows: g.rows.toSorted(order) }))
    .filter((g) => g.rows.length > 0);
}

// A person picked beside the scan: the viewer is to go on with their
// citation, on the Image shown.
export interface ScanPerson {
  personId: number;
  open: { citation: CitationRow; scan: Scan };
}

export type ScanPersonEvent = CustomEvent<ScanPerson>;

// The row's link on the Image shown, as the toolbar takes it: one known
// only to be in the Volume is shown here all the same. `links` are Astia's
// viewer links of the Volume's Images, once known.
export function pickedScan(
  row: VolumeCitation,
  volume: { id: string; label: string },
  shown: number,
  links: string[] | null
) {
  const image = row.image ?? shown;
  const scan: Scan = {
    volumeId: volume.id,
    volume: volume.label,
    image,
    url: links?.[image - 1] ?? '',
    method: row.method
  };
  if (row.by !== undefined) scan.by = row.by;
  if (row.box !== undefined) scan.box = row.box;
  return scan;
}

// Names an entry's Box: people citing one record share it.
export function boxKey(box: Box) {
  return `${box.left} ${box.top} ${box.width} ${box.height}`;
}

export interface Entry {
  key: string;
  box: Box;
  rows: VolumeCitation[];
}

// The entries marked on the Image shown: one per Box, with the rows of
// everyone it records.
export function entriesOn(rows: VolumeCitation[], image: number) {
  const entries = new Map<string, Entry>();
  for (const row of rows) {
    if (row.image !== image || row.box === undefined) continue;
    const key = boxKey(row.box);
    const entry = entries.get(key) ?? { key, box: row.box, rows: [] };
    entry.rows.push(row);
    entries.set(key, entry);
  }
  return [...entries.values()];
}
