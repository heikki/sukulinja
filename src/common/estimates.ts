// A Volume's estimates as Vision Match looks for them (ADR-0029, ADR-0032):
// the rows whose Link is an estimate at an Image, one per record, as a
// Match saved for one is saved for everyone citing it.

import type { VolumeCitation } from './types';

// Those on the Image.
export function estimatesOn(rows: VolumeCitation[], image: number) {
  const byRecord = new Map<string, VolumeCitation>();
  for (const row of rows) {
    const { link } = row;
    if (link.certainty !== 'estimated' || link.precision !== 'image') continue;
    if (link.image !== image) continue;
    const key = row.citation.markKey;
    if (!byRecord.has(key)) byRecord.set(key, row);
  }
  return [...byRecord.values()];
}

// Those in the Volume by the Image they're on, in Image order, a record
// on one Image only.
export function estimatesByImage(rows: VolumeCitation[]) {
  const images = new Set<number>();
  for (const { link } of rows) {
    if (link.certainty === 'estimated' && link.precision === 'image') {
      images.add(link.image);
    }
  }
  const seen = new Set<string>();
  return [...images]
    .toSorted((a, b) => a - b)
    .map((image) => ({
      image,
      rows: estimatesOn(rows, image).filter((r) => {
        const key = r.citation.markKey;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    }))
    .filter((on) => on.rows.length > 0);
}
