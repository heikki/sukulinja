import type { VolumeCitation } from '@/common/types';

import type { StageBox } from '../box-stage/boxes';
import { entriesOn } from './citations';

// Over the scan: a Box around each entry of the Image shown whose place on
// it is known. Only the current citation's is marked; the others show
// while their row is hovered. The current one shows faint while it waits
// to be discarded.
export function entryBoxes(
  rows: VolumeCitation[],
  image: number,
  { current, discarding }: { current: number | null; discarding: boolean }
): StageBox[] {
  return entriesOn(rows, image).map((e) => {
    const marked = e.rows.some((r) => r.citation.id === current);
    return { key: e.key, box: e.box, marked, faint: marked && discarding };
  });
}

// The first person of the entry keyed `key`, picked as their row is.
export function entryRow(rows: VolumeCitation[], image: number, key: string) {
  return entriesOn(rows, image).find((e) => e.key === key)?.rows[0] ?? null;
}
