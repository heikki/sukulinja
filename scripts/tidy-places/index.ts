// Writes the places of Heikki's datasets as he chose. First a Fact's
// address standing alone, as MyHeritage writes a residence, becomes its
// place, its ADDR going (ADR-0023). Then every place is written one way
// (ADR-0024): a place in Finland ends in Suomi, without its province, its
// parish spelled one way and a village named as its parish once; its
// coordinates and notes stay, as it's the same place. Each step puts one
// Change on nothing saying how many Facts it was. The database's file as
// it was is copied beside it first. Running it again changes nothing; run
// it after importing a MyHeritage export.
//
//   bun run scripts/tidy-places/index.ts [--data <folder>] [--dataset <slug>]
//
// Runs on each dataset of the data folder (default `data`), or the one
// named. Run it with the app closed.

import type { Database } from 'bun:sqlite';
import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openChanges } from '@/server/changes/changes';
import { DatasetRegistry } from '@/server/datasets/registry';

import { placeOf } from './address';
import { tidyPlace } from './tidy';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    data: { type: 'string' },
    dataset: { type: 'string' }
  }
});
const root = resolve(values.data ?? 'data');
const registry = new DatasetRegistry(root);
const slugs = (await registry.list())
  .filter((d) => !d.outdated)
  .map((d) => d.slug)
  .filter((slug) => values.dataset === undefined || slug === values.dataset);
if (slugs.length === 0) {
  console.error(`No dataset to tidy in ${root}.`);
  process.exit(1);
}
// A Change on nothing reads neither Citations nor scans.
const NO_SOURCES = {
  citationOf: () => null,
  replaced: async () => await Promise.resolve(false)
};
interface Step {
  id: number;
  place: string;
  address: string | null;
}

// The Facts whose address standing alone becomes their place.
function addressesToPlaces(db: Database): Step[] {
  return db
    .query<{ id: number; address: string }, []>(
      'SELECT id, address FROM facts WHERE place IS NULL AND address IS NOT NULL ORDER BY id'
    )
    .all()
    .map((f) => ({ id: f.id, ...placeOf({ place: null, address: f.address }) }))
    .filter((f): f is Step => f.place !== null);
}

// The Facts whose place is written another way.
function placesTidied(db: Database) {
  return db
    .query<{ id: number; place: string }, []>(
      'SELECT id, place FROM facts WHERE place IS NOT NULL ORDER BY id'
    )
    .all()
    .map((f) => ({ ...f, tidied: tidyPlace(f.place) }))
    .filter((f) => f.tidied !== f.place);
}

function tidy(slug: string) {
  const db = registry.open(slug);
  if (addressesToPlaces(db).length === 0 && placesTidied(db).length === 0) {
    console.log(`${slug}: every place written one way already`);
    return;
  }
  db.run('PRAGMA wal_checkpoint(TRUNCATE);');
  copyFileSync(
    join(root, slug, 'db.sqlite'),
    join(root, slug, 'db.before-tidy-places.sqlite')
  );
  const changes = openChanges(db, NO_SOURCES);
  const toPlace = db.prepare<null, [string, number]>(
    'UPDATE facts SET place = ?, address = NULL WHERE id = ?'
  );
  const dropAddress = db.prepare<null, [number]>(
    "DELETE FROM addresses WHERE owner_type = 'fact' AND owner_id = ?"
  );
  const rename = db.prepare<null, [string, number]>(
    'UPDATE facts SET place = ? WHERE id = ?'
  );
  db.transaction(() => {
    const moved = addressesToPlaces(db);
    for (const f of moved) {
      toPlace.run(f.place, f.id);
      dropAddress.run(f.id);
    }
    if (moved.length > 0) {
      changes.add({
        on: null,
        what: { kind: 'addresses-to-places', facts: moved.length }
      });
      console.log(`${slug}: ${moved.length} addresses made places`);
    }
    const tidied = placesTidied(db);
    for (const f of tidied) rename.run(f.tidied, f.id);
    if (tidied.length > 0) {
      changes.add({
        on: null,
        what: { kind: 'places-tidied', facts: tidied.length }
      });
      const renamed = new Map(tidied.map((f) => [f.place, f.tidied]));
      console.log(`${slug}: ${tidied.length} Facts, ${renamed.size} places`);
      for (const [from, to] of renamed) console.log(`  ${from}\n  → ${to}`);
    }
  })();
}

for (const slug of slugs) tidy(slug);
