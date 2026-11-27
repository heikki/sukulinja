// The pins' files in a data folder. More than one process may save into
// one folder at once, as the dev server beside the app. Each save takes pins.lock,
// re-reads pins.local.json, applies all its changes, and renames a whole new
// file over it; reads take no lock, as the rename means they never see half
// a file.

import { rename, rm, stat, writeFile } from 'node:fs/promises';

import type { Pins } from './types';

const LOCK_RETRY_MS = 10;
const LOCK_WAIT_MS = 5000;
// Older than any save takes: its process died holding it.
const LOCK_STALE_MS = 30_000;

// The local file's pins. Record pins and Reference pins are now kept in
// the datasets (marks.ts); the ones left here are those no dataset cites.
export type LocalPins = Pins;

// Written whole under another name, then renamed over the file, so a
// reader never sees half of it.
async function writeJson(path: string, value: unknown) {
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
  return { volumes: local?.volumes ?? {}, references: local?.references ?? {} };
}

export async function writeLocalFile(path: string, local: LocalPins) {
  await writeJson(path, local);
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
// over one left by a process that died, and gives up after `waitMs`.
export async function withLock<T>(
  lock: string,
  fn: () => Promise<T>,
  { waitMs = LOCK_WAIT_MS } = {}
) {
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
    if (Date.now() - since >= waitMs) {
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
