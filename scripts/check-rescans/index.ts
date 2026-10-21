// Catches Astia re-scanning a pinned Volume before anyone opens it: lists
// the pins made on a filming Astia has since replaced, which the app now
// leaves out. Shipped Page pins listed here want moving to the new
// filming's Images in src/server/citation-scans/pins.json; hand marks
// want marking again in the app.
//
//   bun run scripts/check-rescans/index.ts [--data <folder>]
//     [--update-cache]
//
// Checks the shipped pins, and with --data the folder's local pins too,
// against each Volume's list fetched from Astia past any cache, one
// request at a time. --update-cache also keeps the new lists in the data
// folder and drops its cached Images of the filmings replaced, as the Scan
// cache would on its own. Exits 1 when a Volume was re-scanned.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@server/citation-scans/astia';
import { readLocalFile } from '@server/citation-scans/pin-files';
import shipped from '@server/citation-scans/pins.json';
import { openScanCache } from '@server/citation-scans/scan-cache';

import { checkRescans, reportLines } from './check';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'data': { type: 'string' },
    'update-cache': { type: 'boolean' }
  }
});
if (values['update-cache'] === true && values.data === undefined) {
  console.error('--update-cache needs --data <folder>');
  process.exit(2);
}

const root = values.data === undefined ? null : resolve(values.data);
const cache = await mkdtemp(join(tmpdir(), 'check-rescans-'));
try {
  const fresh = openAstia(cache);
  const kept = root === null ? null : openAstia(join(root, '.astia-cache'));
  const local =
    root === null
      ? undefined
      : await readLocalFile(join(root, 'pins.local.json'));
  const result = await checkRescans(
    { shipped: shipped.volumes, local },
    async (id) => await fresh.volumeImages(id),
    kept === null ? undefined : async (id) => await kept.volumeImages(id)
  );
  for (const line of reportLines(result)) console.log(line);
  if (root !== null && kept !== null && values['update-cache'] === true) {
    const scans = openScanCache({ astia: kept, root });
    for (const r of result.rescanned) {
      // eslint-disable-next-line no-await-in-loop -- one at a time
      await scans.refresh(r.volumeId);
      console.log(`kept the new list of ${r.volumeId}`);
    }
  }
  if (result.rescanned.length > 0) process.exitCode = 1;
} finally {
  await rm(cache, { recursive: true, force: true });
}
