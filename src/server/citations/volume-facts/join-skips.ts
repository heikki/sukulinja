// The one-off migration run by hand when two Page pins of no pages began
// to skip the Images between them (2026-11-24, ADR-0032): every Volume's
// pins in a data folder's pins.local.json, and in an Offload folder's
// facts copies, rewritten to skip just what they did (joiningSkips), told
// which pins are of the filming shown by the data folder's cached Astia
// lists. Run
// with the app closed, before the version that joins skips first opens
// the folder: scripts/join-skips.ts. A folder done is marked, and never
// rewritten again, as pins already joined would come apart.

import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { joiningSkips } from '@/common/page-numbering';

import { openAstia } from '../astia/astia';
import { FACTS } from '../storage/folder';
import { readLocalFile, withLock, writeLocalFile } from './files';
import type { VolumePins } from './types';

const DONE = '.skips-joined';

// The Image file ids of a Volume's filming shown, as the data folder's
// cached Astia lists have them; null where none is cached.
type FilesOf = (volumeId: string) => Promise<string[] | null>;

// The data folder's cached Astia lists.
export function cachedFiles(dataFolder: string): FilesOf {
  const astia = openAstia(join(dataFolder, '.astia-cache'));
  return async (volumeId) => await astia.cachedImages(volumeId);
}

// The Volume's pins as they now skip what they did, a pin of a filming
// other than `files` lists left out of telling skips apart, as it's left
// out of the counting: whether any changed.
function joined(volume: VolumePins, files: string[] | null) {
  const pages = joiningSkips(
    volume.pages,
    (p) =>
      files === null ||
      p.fileId === undefined ||
      files[p.image - 1] === p.fileId
  );
  const changed = JSON.stringify(pages) !== JSON.stringify(volume.pages);
  return { volume: { ...volume, pages }, changed };
}

// Whether the folder was migrated already; else marks it before `run`,
// so a run cut short is never run again over what it migrated.
async function once(folder: string, run: () => Promise<string[]>) {
  const done = Bun.file(join(folder, DONE));
  if (await done.exists()) return null;
  await Bun.write(done, `${new Date().toISOString()}\n`);
  return await run();
}

// Written aside and moved in, so a copy is never left cut off.
async function writeWhole(path: string, value: unknown) {
  const part = `${path}.${crypto.randomUUID()}.part`;
  await Bun.write(part, JSON.stringify(value, null, 2));
  await rename(part, path);
}

// The data folder's pins: the Volumes changed, by id, or null if it was
// migrated already.
export async function joinSkipsInDataFolder(
  folder: string,
  filesOf: FilesOf = cachedFiles(folder)
) {
  return await once(folder, async () => {
    const localFile = join(folder, 'pins.local.json');
    if (!(await Bun.file(localFile).exists())) return [];
    return await withLock(join(folder, 'pins.lock'), async () => {
      const local = await readLocalFile(localFile);
      const changed: string[] = [];
      for (const [id, volume] of Object.entries(local.volumes)) {
        // eslint-disable-next-line no-await-in-loop -- one cached list at a time
        const now = joined(volume, await filesOf(id));
        if (now.changed) changed.push(id);
        local.volumes[id] = now.volume;
      }
      await writeLocalFile(localFile, local);
      return changed;
    });
  });
}

// The Offload folder's facts copies, each rewritten in place with all it
// says: the Volumes changed, by id, or null if it was migrated already.
export async function joinSkipsInOffloadFolder(
  folder: string,
  filesOf: FilesOf
) {
  return await once(folder, async () => {
    const changed: string[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(folder, entry.name, FACTS);
      const file = Bun.file(path);
      // eslint-disable-next-line no-await-in-loop -- one small file at a time
      if (!(await file.exists())) continue;
      // eslint-disable-next-line no-await-in-loop -- as above
      const copy = (await file.json()) as VolumePins;
      // eslint-disable-next-line no-await-in-loop -- as above
      const now = joined(copy, await filesOf(entry.name));
      if (!now.changed) continue;
      changed.push(entry.name);
      // eslint-disable-next-line no-await-in-loop -- as above
      await writeWhole(path, now.volume);
    }
    return changed;
  });
}
