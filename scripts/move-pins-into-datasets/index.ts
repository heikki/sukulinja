// Once: moves the Marks and Vision matches in a data folder's
// pins.local.json into its datasets' citations (ADR-0013). Run it after
// re-importing every dataset, and again after importing one it listed as
// citing none of the pins left. Deleted once it has run.
//
//   bun run scripts/move-pins-into-datasets/index.ts [--data <folder>]

import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@server/citation-scans/astia';
import { imageSize, openScanCache } from '@server/citation-scans/scan-cache';
import { DatasetRegistry } from '@server/dataset-registry';

import { movePins } from './move';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { data: { type: 'string' } }
});
const root = resolve(values.data ?? 'data');
const astia = openAstia(join(root, '.astia-cache'));
const cache = openScanCache({ astia, root, switches: true });
const result = await movePins(
  root,
  new DatasetRegistry(root),
  async (at) => await imageSize(cache, at)
);
console.log(`moved ${result.moved}`);
for (const line of result.left) console.log(`left: ${line}`);
