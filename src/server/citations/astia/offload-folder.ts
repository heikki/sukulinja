// The offload folder: an archive of every Image fetched while it's
// attached, an external drive say, in the Scan cache's own layout
// (`<volumeId>/<fileId>.jpg`), where an offload moves the Images a Volume
// doesn't keep. Nothing is removed from it but an old filming's Images
// once a Volume is switched to a re-scan, and a Volume's Images removed
// for good.
// Beside a Volume's Images, its facts (`facts.json`): its page numbers and
// their marks, so the folder holds the Volume whole. They're read from there while
// it's attached; with none set, an offload drops them.

import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  stat
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { OffloadFolder } from '@/common/types';

import { readSettings, saveSetting } from './install-settings';

const KEY = 'offloadFolder';
const FACTS = 'facts.json';

// Asked to move Images while the folder set isn't attached.
export class FolderAwayError extends Error {
  override name = 'FolderAwayError';
}

async function isDir(path: string) {
  return (await stat(path).catch(() => null))?.isDirectory() === true;
}

export function openOffloadFolder(settingsFile: string) {
  async function path() {
    const { [KEY]: saved } = await readSettings(settingsFile);
    return typeof saved === 'string' && isAbsolute(saved) ? saved : null;
  }

  // The folder when it's set and attached; null when it's set and away;
  // undefined when none is set.
  async function attached() {
    const folder = await path();
    if (folder === null) return undefined;
    return (await isDir(folder)) ? folder : null;
  }

  return {
    // The folder set, and whether it's attached; null for none.
    async status(): Promise<OffloadFolder | null> {
      const folder = await path();
      return folder === null
        ? null
        : { path: folder, attached: await isDir(folder) };
    },

    // Sets the folder, or with null none; one that isn't a folder isn't.
    async set(folder: string | null) {
      if (folder !== null && !(isAbsolute(folder) && (await isDir(folder)))) {
        throw new FolderAwayError(`not a folder: ${folder}`);
      }
      await saveSetting(settingsFile, KEY, folder);
    },

    // Where the Volume's file is in the folder, when it's attached and has
    // it.
    async find(volumeId: string, fileId: string) {
      const folder = await attached();
      if (folder === undefined || folder === null) return null;
      const at = join(folder, volumeId, `${fileId}.jpg`);
      return (await Bun.file(at).exists()) ? at : null;
    },

    // Throws FolderAwayError when a folder is set and away: an offload
    // waits for it rather than drop what it would move.
    async ready() {
      if ((await attached()) === null) {
        throw new FolderAwayError('offload folder away');
      }
    },

    // Moves the files into the folder; throws FolderAwayError when it's set
    // and away, moving none.
    async moveIn(
      volumeId: string,
      files: Array<{ from: string; fileId: string }>
    ) {
      const folder = await attached();
      if (folder === undefined) return;
      if (folder === null) throw new FolderAwayError('offload folder away');
      const dir = join(folder, volumeId);
      await mkdir(dir, { recursive: true });
      await Promise.all(
        files.map(async ({ from, fileId }) => {
          // Copied, then dropped: the folder is on another drive.
          await copyFile(from, join(dir, `${fileId}.jpg`));
          await rm(from, { force: true });
        })
      );
    },

    // The Volumes the folder has files of, when it's attached; none else.
    async volumes() {
      const folder = await attached();
      if (folder === undefined || folder === null) return [];
      const entries = await readdir(folder, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    },

    // The names of the Volume's files in the folder, when it's attached;
    // none else.
    async names(volumeId: string) {
      const folder = await attached();
      if (folder === undefined || folder === null) return [];
      return await readdir(join(folder, volumeId)).catch(() => []);
    },

    // Keeps a copy of the Volume's file in the folder, when it's attached
    // and hasn't it whole yet: bytes just fetched, or a file on disk.
    async keep(volumeId: string, name: string, from: Uint8Array | string) {
      const folder = await attached();
      if (folder === undefined || folder === null) return;
      const at = join(folder, volumeId, name);
      // One there already of the same size is the same; one that isn't
      // was cut off on its way in.
      const size =
        typeof from === 'string' ? (await stat(from)).size : from.byteLength;
      if ((await stat(at).catch(() => null))?.size === size) return;
      await mkdir(join(folder, volumeId), { recursive: true });
      // Written aside and moved in, so a cut-off copy never shows as kept;
      // aside under a name of its own, as two copies may cross.
      const part = `${at}.${crypto.randomUUID()}.part`;
      await (typeof from === 'string'
        ? copyFile(from, part)
        : Bun.write(part, from));
      await rename(part, at);
    },

    // Drops the Volume's files of those names, when the folder's attached:
    // an old filming's, after a re-scan. Nothing else is removed from it.
    async drop(volumeId: string, names: string[]) {
      const folder = await attached();
      if (folder === undefined || folder === null) return;
      await Promise.all(
        names.map(async (name) => {
          const at = join(folder, volumeId, name);
          // A copy on its way in is let be: only one left cut off goes.
          if (name.endsWith('.part')) {
            const info = await stat(at).catch(() => null);
            if (info === null || Date.now() - info.mtimeMs < 60_000) return;
          }
          await rm(at, { force: true });
        })
      );
    },

    // The Volume's facts as the folder keeps them, as written; null when
    // it has none or isn't attached.
    async facts(volumeId: string) {
      const folder = await attached();
      if (folder === undefined || folder === null) return null;
      const file = Bun.file(join(folder, volumeId, FACTS));
      return (await file.exists()) ? await file.text() : null;
    },

    // Keeps the Volume's facts in the folder, when it's attached: written
    // aside and moved in, as an Image is.
    async keepFacts(volumeId: string, text: string) {
      const folder = await attached();
      if (folder === undefined || folder === null) return;
      const at = join(folder, volumeId, FACTS);
      await mkdir(join(folder, volumeId), { recursive: true });
      const part = `${at}.${crypto.randomUUID()}.part`;
      await Bun.write(part, text);
      await rename(part, at);
    },

    // Removes the Volume's Images from the folder, its facts kept, as
    // they're about the Volume and not its Images; throws FolderAwayError
    // when it's set and away, removing nothing.
    async forget(volumeId: string) {
      const folder = await attached();
      if (folder === undefined) return;
      if (folder === null) throw new FolderAwayError('offload folder away');
      const at = join(folder, volumeId);
      const names = await readdir(at).catch(() => []);
      await Promise.all(
        names
          .filter((n) => !n.startsWith(FACTS))
          .map(async (n) => {
            await rm(join(at, n), { recursive: true, force: true });
          })
      );
      await rmdir(at).catch(() => undefined);
    },

    // Copies the Volume's files from the folder into `to`, leaving the
    // folder as it is; throws FolderAwayError when it's set and away,
    // copying none.
    async copyOut(volumeId: string, to: string) {
      const folder = await attached();
      if (folder === undefined) return;
      if (folder === null) throw new FolderAwayError('offload folder away');
      const dir = join(folder, volumeId);
      const all = await readdir(dir).catch(() => []);
      const names = all.filter((n) => n.endsWith('.jpg'));
      await mkdir(to, { recursive: true });
      // Each written aside and moved in, so a cut-off copy never shows as
      // an Image; all settled before a failure is told, so none lands after.
      const copies = await Promise.allSettled(
        names.map(async (name) => {
          const part = join(to, `${name}.${crypto.randomUUID()}.part`);
          try {
            await copyFile(join(dir, name), part);
            await rename(part, join(to, name));
          } catch (err) {
            await rm(part, { force: true }).catch(() => undefined);
            throw err;
          }
        })
      );
      const failed = copies.find((c) => c.status === 'rejected');
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
      if (failed !== undefined) throw failed.reason;
    }
  };
}

export type OffloadFolderStore = ReturnType<typeof openOffloadFolder>;
