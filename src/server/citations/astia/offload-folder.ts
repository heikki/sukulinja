// The offload folder: where an offload moves the Images a Volume doesn't
// keep, an external drive say, in the Scan cache's own layout
// (`<volumeId>/<fileId>.jpg`). They're read from there while it's
// attached; with none set, an offload drops them.

import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { OffloadFolder } from '@/common/types';

import { readSettings, saveSetting } from './install-settings';

const KEY = 'offloadFolder';

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

    // Moves the Volume's files out of the folder into `to`; throws
    // FolderAwayError when it's set and away, moving none.
    async moveOut(volumeId: string, to: string) {
      const folder = await attached();
      if (folder === undefined) return;
      if (folder === null) throw new FolderAwayError('offload folder away');
      const dir = join(folder, volumeId);
      const names = await readdir(dir).catch(() => []);
      await mkdir(to, { recursive: true });
      await Promise.all(
        names.map(async (name) => {
          await copyFile(join(dir, name), join(to, name));
          await rm(join(dir, name), { force: true });
        })
      );
    }
  };
}

export type OffloadFolderStore = ReturnType<typeof openOffloadFolder>;
