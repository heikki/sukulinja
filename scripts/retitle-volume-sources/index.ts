// Titles every Volume source the app made with its archive first, as the
// app now titles a new one (ADR-0019): "Juvan seurakunnan arkisto, I Aa:1
// Pää- ja rippikirjat (1790-1796)". Asks Astia for each Volume's archive;
// one it can't place keeps its title. Running it again changes nothing.
// Delete this script once it has run on every dataset.
//
//   bun run scripts/retitle-volume-sources/index.ts [--data <folder>] [--dataset <slug>]
//
// Runs on each dataset of the data folder (default `data`), or the one
// named. Run it with the app closed.

import { resolve } from 'node:path';
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
  .filter((d) => d.outdated === null)
  .map((d) => d.slug)
  .filter((slug) => values.dataset === undefined || slug === values.dataset);
if (slugs.length === 0) {
  console.error(`No dataset to retitle in ${root}.`);
  process.exit(1);
}
const citations = openCitations(root, {
  datasets: async () => await Promise.resolve([])
});
for (const slug of slugs) {
  const db = registry.open(slug);
  // eslint-disable-next-line no-await-in-loop -- one dataset at a time
  const done = await citations.forDataset(db).retitleVolumeSources();
  console.log(`${slug}: ${done.length} sources retitled`);
  for (const { from, to } of done) {
    console.log(`  ${from ?? '(none)'}\n  → ${to}`);
  }
}
