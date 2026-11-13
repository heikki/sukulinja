// Schema 6 (ADR-0023): a Fact's address that stands alone, MyHeritage's
// residence written as its ADDR, becomes its place, as the import now
// keeps it; a mailing address stays. One Change on nothing says how many
// Facts it was, when there were any.

import type { Database } from 'bun:sqlite';

import type { ChangeWhat } from '@/common/types';

import { placeOf } from '../facts/address-place';
import type { Migration } from './migrations';

function up(db: Database) {
  const alone = db
    .query<{ id: number; address: string }, []>(
      `SELECT id, address FROM facts
       WHERE place IS NULL AND address IS NOT NULL ORDER BY id`
    )
    .all();
  const toPlace = db.prepare<null, [string, number]>(
    'UPDATE facts SET place = ?, address = NULL WHERE id = ?'
  );
  const dropAddress = db.prepare<null, [number]>(
    "DELETE FROM addresses WHERE owner_type = 'fact' AND owner_id = ?"
  );
  let moved = 0;
  for (const f of alone) {
    const { place } = placeOf({ place: null, address: f.address });
    if (place === null) continue;
    toPlace.run(place, f.id);
    dropAddress.run(f.id);
    moved++;
  }
  if (moved === 0) return;
  const what: ChangeWhat = { kind: 'addresses-to-places', facts: moved };
  db.run('INSERT INTO changes (at, what) VALUES (?, ?)', [
    new Date().toISOString(),
    JSON.stringify(what)
  ]);
}

export const ADDRESSES_BECOME_PLACES: Migration = { to: 6, up };
