// Once: renames `imported_page` to `original_page` in every dataset of a
// data folder, the checkout's or the installed app's, and their databases
// from before an import. Deleted once it has run.
//
//   bun run scripts/rename-original-page/index.ts [--data <folder>]

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { renameOriginalPage } from './rename';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { data: { type: 'string' } }
});
for (const { path, result } of await renameOriginalPage(
  resolve(values.data ?? 'data')
)) {
  console.log(`${path}: ${result}`);
}
