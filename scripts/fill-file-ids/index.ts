// One-off: gives a data folder's pins saved before pins kept file ids the
// Astia file id of their Image, from the folder's own .astia-cache: the
// lists its pins were made on. Pins already holding one are left as they
// are, so running it again changes nothing.
//
//   bun run scripts/fill-file-ids/index.ts [--data <folder>]

import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@server/citation-scans/astia';
import { fillFileIds } from '@server/citation-scans/pin-files';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { data: { type: 'string' } }
});
const root = resolve(values.data ?? 'data');
await fillFileIds(root, openAstia(join(root, '.astia-cache')));
console.log(`filled ${join(root, 'pins.local.json')}`);
