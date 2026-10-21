// The pins' files in a data folder. The app and the vision pass save into
// one folder at once, from separate processes. Each save takes pins.lock,
// re-reads pins.local.json, applies all its changes, and renames a whole new
// file over it; reads take no lock, as the rename means they never see half
// a file. A folder saved before pins has its files migrated, and pins saved
// before pins kept file ids can have them filled in.

import { rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Astia } from './astia';
import type {
  PagePin,
  Pins,
  RecordPin,
  RecordRange,
  ReferencePin,
  VolumePins
} from './locate';
import type { Rejection } from './pins';

const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = 5000;
// Older than any save takes: its process died holding it.
const LOCK_STALE_MS = 30_000;

// The local file: the pins, and the Rejections by the reference's URL.
export interface LocalPins extends Pins {
  rejected: Record<string, Rejection[]>;
}

// Written whole under another name, then renamed over the file, so a
// reader never sees half of it.
export async function writeJson(path: string, value: unknown) {
  const part = `${path}.part`;
  await Bun.write(part, `${JSON.stringify(value, null, 2)}\n`);
  await rename(part, path);
}

async function readIfThere<T>(path: string) {
  const file = Bun.file(path);
  return (await file.exists()) ? ((await file.json()) as T) : null;
}

// The local pins, none where the file isn't there yet.
export async function readLocalFile(path: string): Promise<LocalPins> {
  const local = await readIfThere<Partial<LocalPins>>(path);
  return {
    volumes: local?.volumes ?? {},
    references: local?.references ?? {},
    rejected: local?.rejected ?? {}
  };
}

// Writes the local pins, leaving the Rejections out while there are none.
export async function writeLocalFile(path: string, local: LocalPins) {
  const { rejected, ...pins } = local;
  const none = Object.keys(rejected).length === 0;
  await writeJson(path, none ? pins : local);
}

export async function fileStamp(path: string) {
  const info = await stat(path).catch(() => null);
  return info === null ? '-' : `${info.mtimeMs}:${info.size}`;
}

// ---------------------------------------------------------------- the lock

// When the lock was taken: the time it holds, or its file's when it can't
// be read yet.
async function takenAt(lock: string) {
  const held = await readIfThere<{ at?: number }>(lock).catch(() => null);
  if (typeof held?.at === 'number') return held.at;
  return (await stat(lock).catch(() => null))?.mtimeMs ?? null;
}

async function tryLock(lock: string) {
  try {
    await writeFile(
      lock,
      JSON.stringify({ pid: process.pid, at: Date.now() }),
      {
        flag: 'wx'
      }
    );
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

// Runs `fn` holding the lock: retries while another save holds it, takes
// over one left by a process that died, and gives up after LOCK_WAIT_MS.
export async function withLock<T>(lock: string, fn: () => Promise<T>) {
  const since = Date.now();
  // eslint-disable-next-line no-await-in-loop -- waiting on the other save
  while (!(await tryLock(lock))) {
    // eslint-disable-next-line no-await-in-loop -- as above
    const at = await takenAt(lock);
    if (at !== null && Date.now() - at > LOCK_STALE_MS) {
      // eslint-disable-next-line no-await-in-loop -- as above
      await rm(lock, { force: true });
      continue;
    }
    if (Date.now() - since >= LOCK_WAIT_MS) {
      throw new Error(`The pins are locked by another save: ${lock}`);
    }
    // eslint-disable-next-line no-await-in-loop -- as above
    await Bun.sleep(LOCK_RETRY_MS);
  }
  try {
    return await fn();
  } finally {
    await rm(lock, { force: true });
  }
}

// ---------------------------------------------------------------- migration

// The local files before pins: Anchors, Seen records and Record ranges per
// volume in one, Placements in another.
interface OldVolume {
  title?: string;
  anchors?: PagePin[];
  villages?: string[];
  records?: RecordRange[];
  seen?: RecordPin[];
}

function fromOldVolume(old: OldVolume) {
  const { title, anchors, villages, records, seen } = old;
  const volume: VolumePins = { pages: anchors ?? [] };
  if (title !== undefined) volume.title = title;
  if (villages !== undefined) volume.villages = villages;
  if (records !== undefined) volume.ranges = records;
  if (seen !== undefined) volume.records = seen;
  return volume;
}

// A folder saved before pins has its two local files turned into
// pins.local.json, keeping them as *.migrated.
export async function migrate(folder: string, localFile: string) {
  if (await Bun.file(localFile).exists()) return;
  const anchorsFile = join(folder, 'anchors.local.json');
  const placementsFile = join(folder, 'placements.local.json');
  const anchors = await readIfThere<Record<string, OldVolume>>(anchorsFile);
  const placements =
    await readIfThere<Record<string, ReferencePin>>(placementsFile);
  if (anchors === null && placements === null) return;
  const volumes = Object.fromEntries(
    Object.entries(anchors ?? {}).map(([id, v]) => [id, fromOldVolume(v)])
  );
  await writeJson(localFile, { volumes, references: placements ?? {} });
  for (const old of [anchorsFile, placementsFile]) {
    // eslint-disable-next-line no-await-in-loop -- two files
    if (await Bun.file(old).exists()) await rename(old, `${old}.migrated`);
  }
}

// ---------------------------------------------------------------- file ids

// A pin saved before pins kept file ids gets the one at its Image in its
// Volume's list, which must be of the filming it was made on: the data
// folder's cached lists.
function filled<T extends { image?: number; fileId?: string }>(
  pin: T,
  files: string[]
) {
  const fileId = pin.image === undefined ? undefined : files[pin.image - 1];
  return pin.fileId !== undefined || fileId === undefined
    ? pin
    : { ...pin, fileId };
}

// The Volume's Page pins and Record pins with file ids.
function volumeWithFileIds(volume: VolumePins, files: string[]) {
  const out = { ...volume, pages: volume.pages.map((p) => filled(p, files)) };
  if (volume.records !== undefined) {
    out.records = volume.records.map((p) => filled(p, files));
  }
  return out;
}

// The Volumes the local pins put on an Image.
function volumesOnImages(local: LocalPins) {
  const ids = new Set<string>();
  for (const [id, v] of Object.entries(local.volumes)) {
    if (v.pages.length > 0 || (v.records?.length ?? 0) > 0) ids.add(id);
  }
  for (const p of Object.values(local.references)) {
    if (p.image !== undefined) ids.add(p.volumeId);
  }
  for (const list of Object.values(local.rejected)) {
    for (const r of list) ids.add(r.volumeId);
  }
  return [...ids];
}

function mapValues<T>(o: Record<string, T>, fn: (v: T, key: string) => T) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}

function localWithFileIds(
  local: LocalPins,
  lists: Map<string, string[]>
): LocalPins {
  function listOf(volumeId: string) {
    const files = lists.get(volumeId);
    if (files === undefined) throw new Error(`no list for ${volumeId}`);
    return files;
  }
  return {
    volumes: mapValues(local.volumes, (v, id) =>
      volumeWithFileIds(v, listOf(id))
    ),
    references: mapValues(local.references, (p) =>
      p.image === undefined ? p : filled(p, listOf(p.volumeId))
    ),
    rejected: mapValues(local.rejected, (list) =>
      list.map((r) => filled(r, listOf(r.volumeId)))
    )
  };
}

// Fills in the file ids of the data folder's local pins saved before pins
// kept them, from `astia`'s lists: the folder's cached ones, which its pins
// were made on. Under the lock, like a save.
export async function fillFileIds(folder: string, astia: Astia) {
  const localFile = join(folder, 'pins.local.json');
  const ids = volumesOnImages(await readLocalFile(localFile));
  const lists = new Map(
    await Promise.all(
      ids.map(async (id) => [id, await astia.volumeImages(id)] as const)
    )
  );
  await withLock(join(folder, 'pins.lock'), async () => {
    const local = await readLocalFile(localFile);
    for (const id of Object.keys(local.volumes)) {
      if (!lists.has(id)) lists.set(id, []);
    }
    await writeLocalFile(localFile, localWithFileIds(local, lists));
  });
}
