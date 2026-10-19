import type {
  Box,
  Certainty,
  CitationRow,
  Link,
  LinkTarget,
  Precision,
  VolumeCitation
} from '@common/types';

// A Link's name, in the words the person panel and the Scan viewer share:
// who says so, then how far down unless it's the entry.
const CERTAINTY: Record<Certainty, string> = {
  marked: 'Marked',
  vision: 'Vision match',
  estimated: 'Estimated'
};

const PRECISION: Record<Precision, string> = {
  entry: '',
  image: ' Image',
  volume: ' Volume'
};

export function linkLabel(link: LinkTarget) {
  return `${CERTAINTY[link.certainty]}${PRECISION[link.precision]}`;
}

// What the name means; an estimate says what it was counted from.
export function linkHint(link: LinkTarget) {
  if (link.certainty === 'vision') {
    return 'The vision model found the name on this Image. Not checked yet: confirm it, or mark the right Image.';
  }
  if (link.certainty === 'marked') {
    switch (link.precision) {
      case 'entry':
        return 'A person marked this record on this Image.';
      case 'image':
        return "A person marked this record on this Image; where on it isn't marked.";
      case 'volume':
        return "A person said the record is in this Volume; its Image isn't marked.";
    }
  }
  if (link.precision === 'volume') {
    return "Only the Volume is known, chosen from what the citation gives; it may be the wrong one, and the Image isn't known.";
  }
  return link.precision === 'image' && link.from === 'pins'
    ? "Counted from page numbers read in this Volume; the record itself isn't checked."
    : 'Guessed from the usual pages per Image for this kind of book; often a few Images off.';
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
    const top = (boxOf(a)?.top ?? Infinity) - (boxOf(b)?.top ?? Infinity);
    if (top !== 0 && !Number.isNaN(top)) return top;
    return nameOf(a).localeCompare(nameOf(b), 'fi');
  };
}

const GROUPED: Certainty[] = ['marked', 'vision', 'estimated'];

// The Volume's rows linking the Image shown, grouped by who says so:
// Marked, then Vision matches left to confirm, then Estimated ones. Those
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
    label: CERTAINTY[certainty],
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
  return 'image' in row.link ? row.link.image : null;
}

// Where on its Image a row's entry is, when its Link points at the entry.
export function boxOf(row: VolumeCitation) {
  return row.link.precision === 'entry' ? row.link.box : null;
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
    const box = boxOf(row);
    if (imageOf(row) !== image || box === null) continue;
    const key = boxKey(box);
    const entry = entries.get(key) ?? { key, box, rows: [] };
    entry.rows.push(row);
    entries.set(key, entry);
  }
  return [...entries.values()];
}
