// Writes every Fact's place one way (ADR-0024): a place in Finland ends in
// Suomi, without its province, its parish spelled one way and a village
// named as its parish once. A place's coordinates and notes stay, as it's
// the same place. One Change on nothing says how many Facts it was. The
// database's file as it was is copied beside it first. Running it again
// changes nothing. Delete this script once it has run on every dataset.
//
//   bun run scripts/tidy-places/index.ts [--data <folder>] [--dataset <slug>]
//
// Runs on each dataset of the data folder (default `data`), or the one
// named. Run it with the app closed.

import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openChanges } from '@/server/changes/changes';
import { DatasetRegistry } from '@/server/datasets/registry';

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
for (const slug of slugs) {
  const db = registry.open(slug);
  const placed = db
    .query<{ id: number; place: string }, []>(
      'SELECT id, place FROM facts WHERE place IS NOT NULL ORDER BY id'
    )
    .all()
    .map((f) => ({ ...f, tidied: tidyPlace(f.place) }))
    .filter((f) => f.tidied !== f.place);
  if (placed.length === 0) {
    console.log(`${slug}: every place written one way already`);
    continue;
  }
  db.run('PRAGMA wal_checkpoint(TRUNCATE);');
  copyFileSync(
    join(root, slug, 'db.sqlite'),
    join(root, slug, 'db.before-tidy-places.sqlite')
  );
  const rename = db.prepare<null, [string, number]>(
    'UPDATE facts SET place = ? WHERE id = ?'
  );
  const changes = openChanges(db, NO_SOURCES);
  db.transaction(() => {
    for (const f of placed) rename.run(f.tidied, f.id);
    changes.add({
      on: null,
      what: { kind: 'places-tidied', facts: placed.length }
    });
  })();
  const renamed = new Map<string, string>();
  for (const f of placed) renamed.set(f.place, f.tidied);
  console.log(`${slug}: ${placed.length} Facts, ${renamed.size} places`);
  for (const [from, to] of renamed) console.log(`  ${from}\n  → ${to}`);
}
