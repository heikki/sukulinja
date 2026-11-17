// A dataset to try Entries in (ADR-0026), for the Entries' tests: four
// people, one couple, a baptism Volume's Images to cite.

import { join } from 'node:path';

import type { VolumeCitation } from '@/common/types';

import type { NewChange } from '../../changes/changes';
import { openDb } from '../../datasets/db';
import { fileId } from '../astia/memory-astia';
import { memoryParishes } from '../astia/parishes';
import { juvaAstia, VOLUMES } from '../astia/test-parish';
import { createCitations } from '../citations';
import { openImages } from '../images';
import { referencesFor } from '../myheritage/test-pins';

export const BAPTISMS = VOLUMES['juva-3'];
export const BOX = { left: 100, top: 200, width: 500, height: 50 };
export const MOVED = { left: 50, top: 60, width: 400, height: 40 };

// An entry on Image `image` of the baptisms, as the Scan viewer gives it.
export function at(image: number, box = BOX) {
  return {
    volumeId: 'juva-3',
    image,
    fileId: fileId('juva-3', image, 'full'),
    box
  };
}

// A baptism there, its Event chosen on the card.
export function baptism(image: number, box = BOX) {
  return { ...at(image, box), event: 'CHR' as const };
}

// Matti (1) and Liisa (2), married in family 1; Juho (3) and Kalle (4) in
// none. Matti has a Birth (1) and a Christening (2). Each of the first
// three has a Citation of their own, by their id. Images 1000×800 pixels.
// Kept in `dir`.
export function entriesDataset(dir: string) {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run(`INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'),
    (3, '@I3@'), (4, '@I4@')`);
  db.run(
    "INSERT INTO families (id, xref, husband_id, wife_id) VALUES (1, '@F1@', 1, 2)"
  );
  db.run(`INSERT INTO facts (id, scope_type, scope_id, tag, date_text)
    VALUES (1, 'person', 1, 'BIRT', '3 MAR 1795'),
      (2, 'person', 1, 'CHR', '12 MAR 1795')`);
  db.run(`INSERT INTO citations (id, scope_type, scope_id, text)
    VALUES (1, 'person', 1, 'Matti'), (2, 'person', 2, 'Liisa'),
      (3, 'person', 3, 'Juho')`);
  const astia = juvaAstia();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const changes: NewChange[] = [];
  const citations = createCitations(db, {
    images: openImages({ astia, parishes: memoryParishes(), sizeOf }),
    references: referencesFor(dir, db, { astia, sizeOf }),
    changed: (c) => {
      changes.push(c);
    }
  });
  return { db, citations, entries: citations.entries, changes };
}

// What `make` or `edit` gave, made.
export function made(rows: VolumeCitation[] | { rejected: string } | null) {
  if (rows === null || 'rejected' in rows) throw new Error('not made');
  return rows;
}
