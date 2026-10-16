// What the Scan viewer shows beside a Volume: every person's church-book
// citation in the dataset that resolves into it, with its Image there.
// Kept per Volume until a correction or a vision save changes the local
// anchors or placements; a re-import makes new handlers, and so a new
// cache.

import type { Database } from 'bun:sqlite';

import type { VolumeCitation } from '@common/types';

import { localStamp } from './citation-scans/anchors';
import { parseChurchBookRef } from './citation-scans/record';
import { isChurchBook, volumeScans } from './citation-scans/scans';
import { toCitation } from './person-details';
import type { CitationDbRow } from './person-details';

type Row = CitationDbRow & { personId: number };
type PersonCitation = Row & { page: string };

// One row per person and record: a person citing the same record twice is
// listed once.
function onePerRecord(rows: PersonCitation[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.personId} ${r.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolve(rows: PersonCitation[], volumeId: string) {
  const refs = rows.map((r) => parseChurchBookRef(r.page, r.text ?? ''));
  const scans = await volumeScans(volumeId, refs);
  if (scans === null) return null;
  return rows.flatMap((r, i): VolumeCitation[] => {
    const found = scans[i];
    if (found === null || found === undefined) return [];
    const { scan, split } = found;
    const { year: _, ...citation } = toCitation(r);
    const volumeOnly = scan.method === 'volume';
    const row: VolumeCitation = {
      personId: r.personId,
      citation,
      image: volumeOnly ? null : scan.image,
      method: scan.method,
      split
    };
    if (scan.by !== undefined) row.by = scan.by;
    if (scan.box !== undefined) row.box = scan.box;
    return [row];
  });
}

// The Volume's citations, or null when it isn't in any of the dataset's
// parishes.
export function createVolumeCitations(db: Database) {
  const citations = db.prepare<Row, []>(
    `SELECT c.id, c.scope_id AS personId, s.title AS source, c.page, c.text
     FROM citations c LEFT JOIN sources s ON s.id = c.source_id
     WHERE c.scope_type = 'person' ORDER BY c.scope_id, c.sort_order`
  );
  const kept = new Map<
    string,
    { stamp: string; rows: Promise<VolumeCitation[] | null> }
  >();

  return async (volumeId: string) => {
    const stamp = await localStamp();
    const hit = kept.get(volumeId);
    if (hit?.stamp === stamp) return await hit.rows;
    const rows = onePerRecord(
      citations.all().filter((r): r is PersonCitation => isChurchBook(r.page))
    );
    const entry = { stamp, rows: resolve(rows, volumeId) };
    kept.set(volumeId, entry);
    // A failure isn't kept: Astia comes back.
    entry.rows.catch(() => kept.delete(volumeId));
    return await entry.rows;
  };
}
