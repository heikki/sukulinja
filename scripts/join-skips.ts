// Run once by hand, with the app closed, before the version where two
// Images set to have no page skip those between first opens its data:
//
//   bun scripts/join-skips.ts [<data folder>]
//
// The data folder is the installed app's by default; the Offload folder
// is the one its settings name, if any, and must be attached.
// See src/server/citations/volume-facts/join-skips.ts.

import { homedir } from 'node:os';
import { join } from 'node:path';

import { openFolder } from '@/server/citations/storage/folder';
import {
  cachedFiles,
  joinSkipsInDataFolder,
  joinSkipsInOffloadFolder
} from '@/server/citations/volume-facts/join-skips';

const dataFolder =
  process.argv[2] ??
  join(homedir(), 'Library', 'Application Support', 'Sukulinja', 'data');

function said(where: string, changed: string[] | null) {
  if (changed === null) return `${where}: migrated already, left as it is.`;
  return [
    `${where}: ${changed.length} Volume(s) rewritten.`,
    ...changed.map((id) => `  ${id}`)
  ].join('\n');
}

const offload = await openFolder(
  join(dataFolder, 'settings.local.json')
).status();
if (offload !== null && !offload.attached) {
  console.error(
    `The Offload folder ${offload.path} isn't attached: attach it and run again.`
  );
  process.exit(1);
}
console.log(said(dataFolder, await joinSkipsInDataFolder(dataFolder)));
if (offload !== null) {
  console.log(
    said(
      offload.path,
      await joinSkipsInOffloadFolder(offload.path, cachedFiles(dataFolder))
    )
  );
}
