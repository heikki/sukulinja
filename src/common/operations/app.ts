// The operations outside any dataset, shared by them all (operation.ts),
// served at POST /api/<name>: the install's parishes, a parish's church
// books and their downloads, the Scan cache, and the assistant's key.
// Astia's Images and a Volume's re-scan keep their own routes
// (/astia/volumes/…), and the datasets as a whole theirs (/datasets,
// /import).

import type {
  AssistantKeyStatus,
  ChurchBookArchive,
  ChurchBookVolume,
  DownloadStatus,
  InstalledBook,
  ScanCacheStatus
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

  // Every Volume with something on this computer, the install's parishes'
  // first, in their order. Taking one off the disk stops its download and
  // answers with them as they then stand.
  allBooks: asksNothing<InstalledBook[]>(),
  removeFromDisk: answers<{ volumeId: string }, InstalledBook[]>(
    '{ volumeId }',
    volumeOf
  ),

  // The Scan cache: what it holds against its cap. Setting the cap, one of
  // its choices, and clearing it answer with it as it then stands.
  scanCache: asksNothing<ScanCacheStatus>(),
  setScanCap: answers<{ cap: number }, ScanCacheStatus>('{ cap }', ({ cap }) =>
    isInteger(cap) ? { cap } : null
  ),
  clearScanCache: asksNothing<ScanCacheStatus>(),

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
