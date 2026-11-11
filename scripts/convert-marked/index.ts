// Converts every reference already Marked at the entry into a Citation of
// its Image, once (ADR-0016). From then on the app converts each as it's
// Marked. Delete this script once it has run on every dataset.
//
//   bun run scripts/convert-marked/index.ts [--data <folder>] [--dataset <slug>]
//
// Runs on each dataset of the data folder (default `data`), or the one
// named, keeping a copy of its database from before beside it, as
// db.before-conversion.sqlite. Run it with the app closed, and on a copy of
// the data folder first.

import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openCitations } from '@/server/citations';
import { DatasetRegistry } from '@/server/datasets/registry';

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
  console.error(`No dataset to convert in ${root}.`);
  process.exit(1);
}
const citations = openCitations(root, {
  datasets: async () => await Promise.resolve([])
});
for (const slug of slugs) {
  const db = registry.open(slug);
  const before = join(root, slug, 'db.before-conversion.sqlite');
  // eslint-disable-next-line no-await-in-loop -- one dataset at a time
  await rm(before, { force: true });
  db.run('VACUUM INTO ?', [before]);
  // eslint-disable-next-line no-await-in-loop -- one dataset at a time
  const counts = await citations.forDataset(db).convertMarked();
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`${slug}: ${total} citations converted`);
  for (const [volume, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${volume}`);
  }
}
