import { certaintyName } from '@client/link-labels';
import type { Viewer } from '@client/state';
import type { Box, Certainty, VolumeCitation } from '@common/types';

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
    label: certaintyName(certainty),
    rows: shown.filter((r) => r.link.certainty === certainty).toSorted(order)
  })).filter((g) => g.rows.length > 0);
}

// A person picked in the viewer who isn't the Selected person: the viewer
// has noted their citation, and `scan-person` asks for them.
export interface ScanPerson {
  personId: number;
}

export type ScanPersonEvent = CustomEvent<ScanPerson>;

// Picks the row's person from `from`, the part clicked, once any change
// pending is saved or discarded.
export function pickRow(
  from: HTMLElement,
  viewer: Viewer,
  row: VolumeCitation
) {
  viewer.leave(() => {
    const personId = viewer.pick(row);
    if (personId === null) return;
    from.dispatchEvent(
      new CustomEvent<ScanPerson>('scan-person', {
        detail: { personId },
        bubbles: true,
        composed: true
      })
    );
  });
}

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
