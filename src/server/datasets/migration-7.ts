// Schema 7 (ADR-0024): every Fact's place written one way, as the import
// now writes it: a place in Finland says Suomi, without its province. Its
// coordinates and notes stay, as it's the same place. One Change on
// nothing says how many Facts it was, when there were any.

import type { Database } from 'bun:sqlite';

import type { ChangeWhat } from '@/common/types';

import { tidyPlace } from '../facts/place-names';
import type { Migration } from './migrations';

// Each Fact's place as tidyPlace writes it.
export function tidyPlaces(db: Database) {
  const placed = db
    .query<{ id: number; place: string }, []>(
      'SELECT id, place FROM facts WHERE place IS NOT NULL ORDER BY id'
    )
    .all();
  const rename = db.prepare<null, [string, number]>(
    'UPDATE facts SET place = ? WHERE id = ?'
  );
  let tidied = 0;
  for (const f of placed) {
    const place = tidyPlace(f.place);
    if (place === f.place) continue;
    rename.run(place, f.id);
    tidied++;
  }
  if (tidied === 0) return;
  const what: ChangeWhat = { kind: 'places-tidied', facts: tidied };
  db.run('INSERT INTO changes (at, what) VALUES (?, ?)', [
    new Date().toISOString(),
    JSON.stringify(what)
  ]);
}

export const PLACES_WRITTEN_ONE_WAY: Migration = { to: 7, up: tidyPlaces };
