import type {
  Box,
  Certainty,
  CitationRow,
  Link,
  VolumeCitation
} from '@common/types';

// How sure a Link is, in the words the person panel and the Scan viewer
// share.
const LABELS: Record<Certainty, string> = {
  exact: 'Exact',
  vision: 'Vision match',
  estimated: 'Estimated',
  volume: 'Volume only'
};

// What each one means; an estimate says what it was counted from.
export function certaintyHint(link: Pick<Link, 'certainty' | 'from'>) {
  switch (link.certainty) {
    case 'exact':
      return 'A person marked this record on this Image.';
    case 'vision':
      return 'The vision model found the name on this Image. Not checked yet: confirm it, or mark the right Image.';
    case 'estimated':
      return link.from === 'pins'
        ? "Counted from page numbers read in this Volume; the record itself isn't checked."
        : 'Guessed from the usual pages per Image for this kind of book; often a few Images off.';
    case 'volume':
      return 'The citation names no page, so only the Volume is known.';
  }
}

export function certaintyLabel(link: Pick<Link, 'certainty'>) {
  return LABELS[link.certainty];
}

// A Volume's name without the archive's code for it ("I Aa:8"), which the
// archive's name stands in for: "Pää- ja rippikirjat (1783-1790)".
export function volumeTitle(label: string) {
  return label.replace(/^[IVX]+\s+[A-Za-z]+:\s*\d+[a-z]?\s+/u, '');
}

// A Split reference's row says it may be elsewhere.
export const SPLIT_NOTE = 'one of several Volumes';

export function splitLabel(label: string) {
  return `${label} · ${SPLIT_NOTE}`;
}

// Entries in the order they're written on the Image, where the model said
// where; the rest by name.
function byPlace(nameOf: (row: VolumeCitation) => string) {
  return (a: VolumeCitation, b: VolumeCitation) => {
    const top = (a.link.box?.top ?? Infinity) - (b.link.box?.top ?? Infinity);
    if (top !== 0 && !Number.isNaN(top)) return top;
    return nameOf(a).localeCompare(nameOf(b), 'fi');
  };
}

const GROUPED: Certainty[] = ['exact', 'vision', 'estimated'];

// The Volume's rows linking the Image shown, grouped by how sure each is:
// Exact, then Vision matches left to confirm, then Estimated ones. Those
// known only to be in the Volume aren't known to be here, so they're left
// out.
export function groupCitations(
  rows: VolumeCitation[],
  image: number,
  nameOf: (row: VolumeCitation) => string
) {
  const shown = rows.filter((r) => imageOf(r) === image);
  const order = byPlace(nameOf);
  return GROUPED.map((certainty) => ({
    label: LABELS[certainty],
    rows: shown.filter((r) => r.link.certainty === certainty).toSorted(order)
  })).filter((g) => g.rows.length > 0);
}

// A person picked beside the scan: the viewer is to go on with their
// citation, on the Image shown.
export interface ScanPerson {
  personId: number;
  open: { citation: CitationRow; link: Link };
}

export type ScanPersonEvent = CustomEvent<ScanPerson>;

// The Image a row links, or null for one known only to be in the Volume.
export function imageOf(row: VolumeCitation) {
  return row.link.certainty === 'volume' ? null : row.link.image;
}

// The row's Link, as the dock would open it; one known only to be in the
// Volume opens on the Image shown. `viewerUrls` are Astia's viewer URLs of
// the Volume's Images, once known.
export function pickedLink(
  row: VolumeCitation,
  shown: number,
  viewerUrls: string[] | null
): Link {
  if (imageOf(row) !== null) return row.link;
  const url = viewerUrls?.[shown - 1] ?? row.link.url;
  return { ...row.link, image: shown, url };
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
    const { box } = row.link;
    if (imageOf(row) !== image || box === undefined) continue;
    const key = boxKey(box);
    const entry = entries.get(key) ?? { key, box, rows: [] };
    entry.rows.push(row);
    entries.set(key, entry);
  }
  return [...entries.values()];
}
