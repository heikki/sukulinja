// Catches Astia re-scanning a pinned Volume before anyone opens it: lists
// the pins made on a filming Astia has since replaced, which the app now
// leaves out. Shipped Page pins listed here want moving to the new
// filming's Images in src/server/citation-scans/pins.json; hand marks
// want marking again in the app.
//
//   bun run scripts/check-rescans/index.ts [--data <folder>]
//     [--update-cache]
//
// Checks the shipped pins and the data folder's own (default `data`), in
// its pins.local.json and in each dataset's Marks, against each Volume's list fetched from Astia past any cache, one
// request at a time. --update-cache also keeps the new lists in the data
// folder and drops its cached Images of the filmings replaced, as the Scan
// viewer does when told to switch. Exits 1 when a Volume was re-scanned.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@/server/citation-scans/astia';
import { readLocalFile } from '@/server/citation-scans/pin-files';
import shipped from '@/server/citation-scans/pins.json';
import { checkRescans } from '@/server/citation-scans/rescans';
import { openScanCache } from '@/server/citation-scans/scan-cache';
import { openScanFolder } from '@/server/citation-scans/scans';
import { DatasetRegistry } from '@/server/dataset-registry';

import { reportLines } from './report';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'data': { type: 'string' },
    'update-cache': { type: 'boolean' }
  }
});
const root = resolve(values.data ?? 'data');
const cache = await mkdtemp(join(tmpdir(), 'check-rescans-'));
try {
  const fresh = openAstia(cache);
  const kept = openAstia(join(root, '.astia-cache'));
  const registry = new DatasetRegistry(root);
  const folder = openScanFolder(root, { astia: kept });
  const marked = (await registry.list())
    .filter((d) => !d.outdated)
    .map((d) => folder.scans(registry.open(d.slug)).marked());
  const result = await checkRescans(
    {
      shipped: shipped.volumes,
      local: [await readLocalFile(join(root, 'pins.local.json')), ...marked]
    },
    async (id) => await fresh.volumeImages(id),
    async (id) => await kept.volumeImages(id)
  );
  for (const line of reportLines(result)) console.log(line);
  if (values['update-cache'] === true) {
    const scans = openScanCache({ astia: kept, root, switches: true });
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
