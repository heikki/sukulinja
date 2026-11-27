// The operations outside any dataset, shared by them all (operation.ts),
// served at POST /api/<name>: the install's parishes, a parish's church
// books and their downloads, Storage, and the assistant's key.
// Astia's Images and a Volume's re-scan keep their own routes
// (/astia/volumes/…), and the datasets as a whole theirs (/datasets,
// /import).

import type {
  AssistantKeyStatus,
  ChurchBookArchive,
  ChurchBookVolume,
  DownloadStatus,
  OffloadFolder,
  StorageStatus
} from '@/common/types';

import { answers, asksNothing } from './operation';
import { isInteger, isName, isString } from './read';

const ARCHIVE_ID = /^\d+$/u;

// An Astia archive's or Volume's id: digits.
function isAstiaId(value: unknown): value is string {
  return typeof value === 'string' && ARCHIVE_ID.test(value);
}

function archiveOf(body: Record<string, unknown>) {
  const { archiveId } = body;
  return isAstiaId(archiveId) ? { archiveId } : null;
}

function volumeOf(body: Record<string, unknown>) {
  const { volumeId } = body;
  return isAstiaId(volumeId) ? { volumeId } : null;
}

export const APP_OPERATIONS = {
  // Every parish, by its archive's title in Astia (its id when Astia
  // can't say).
  parishes: asksNothing<ChurchBookArchive[]>(),

  // The parish archives whose titles start most like `name`, best first.
  findParishArchives: answers<{ name: string }, ChurchBookArchive[]>(
    '{ name }',
    ({ name }) => (isString(name) ? { name } : null)
  ),

  // The archive joins the install's parishes, with no spelling.
  addParish: answers<{ archiveId: string }, undefined>(
    '{ archiveId }',
    archiveOf
  ),

  // The archive leaves the install's parishes; refused while a spelling
  // links into it.
  removeParish: answers<{ archiveId: string }, undefined>(
    '{ archiveId }',
    archiveOf
  ),

  // Every reference giving the spelling links into the archive from now
  // on.
  linkSpelling: answers<{ spelling: string; archiveId: string }, undefined>(
    '{ spelling, archiveId }',
    (body) => {
      const archive = archiveOf(body);
      const { spelling } = body;
      if (archive === null || !isName(spelling) || spelling.trim() === '') {
        return null;
      }
      return { ...archive, spelling };
    }
  ),

  // The parish archive's Volumes, with what of each is on disk.
  churchBooks: answers<{ archiveId: string }, ChurchBookVolume[]>(
    '{ archiveId }',
    archiveOf
  ),

  // Each download this run; starting or carrying on with a Volume's, and
  // stopping it, answer with them too.
  downloads: asksNothing<DownloadStatus[]>(),
  startDownload: answers<{ volumeId: string }, DownloadStatus[]>(
    '{ volumeId }',
    volumeOf
  ),
  stopDownload: answers<{ volumeId: string }, DownloadStatus[]>(
    '{ volumeId }',
    volumeOf
  ),

  // A Volume off the disk and out of the offload folder, its download
  // stopped.
  removeVolume: answers<{ volumeId: string }, undefined>(
    '{ volumeId }',
    volumeOf
  ),
  // Every Image of the Volume but those any dataset's Citations link off
  // the disk, its download stopped, and no other fetched until it's
  // brought back.
  offload: answers<{ volumeId: string }, undefined>('{ volumeId }', volumeOf),

  // Whether the Volume is offloaded: then only its cited Images load.
  isOffloaded: answers<{ volumeId: string }, boolean>('{ volumeId }', volumeOf),
  // The bytes offloading the Volume would free, keeping its cited Images;
  // null when that can't be known.
  offloadFrees: answers<{ volumeId: string }, number | null>(
    '{ volumeId }',
    volumeOf
  ),

  // Storage: what it holds against its cap. Setting the cap, one of
  // its choices, and clearing it answer with it as it then stands.
  storage: asksNothing<StorageStatus>(),
  setStorageCap: answers<{ cap: number }, StorageStatus>(
    '{ cap }',
    ({ cap }) => (isInteger(cap) ? { cap } : null)
  ),
  clearStorage: asksNothing<StorageStatus>(),

  // The offload folder an offload moves Images into, and whether it's
  // attached; null for none, when an offload drops them. Choosing one asks
  // with the app's own folder picker, refused outside the app; each
  // answers with it as it then stands.
  offloadFolder: asksNothing<OffloadFolder | null>(),
  chooseOffloadFolder: asksNothing<OffloadFolder | null>(),
  clearOffloadFolder: asksNothing<OffloadFolder | null>(),

  // Where the assistant's credentials come from. Keeping a key, or
  // removing the one kept, answer with it as it then stands; the key is
  // never sent back.
  assistantKey: asksNothing<AssistantKeyStatus>(),
  setAssistantKey: answers<{ key: string }, AssistantKeyStatus>(
    '{ key }',
    ({ key }) => {
      const trimmed = isString(key) ? key.trim() : '';
      return trimmed === '' ? null : { key: trimmed };
    }
  ),
  removeAssistantKey: asksNothing<AssistantKeyStatus>()
};

export type AppOperations = typeof APP_OPERATIONS;
