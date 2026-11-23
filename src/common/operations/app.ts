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
  OffloadFolder,
  PageMark,
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

  // Every Volume with something on this computer, the install's parishes'
  // first, in their order. Taking one off the disk stops its download and
  // answers with them as they then stand.
  allBooks: asksNothing<InstalledBook[]>(),
  removeFromDisk: answers<{ volumeId: string }, InstalledBook[]>(
    '{ volumeId }',
    volumeOf
  ),
  // Off the disk and out of the offload folder too, for good.
  removeForGood: answers<{ volumeId: string }, InstalledBook[]>(
    '{ volumeId }',
    volumeOf
  ),
  // Every Image of the Volume but those any dataset's Citations link off
  // the disk, its download stopped, and no other fetched until it's
  // brought back; the Volumes as they then stand.
  offload: answers<{ volumeId: string }, InstalledBook[]>(
    '{ volumeId }',
    volumeOf
  ),

  // Marks the Volume's page numbers checked, or as none, locking them in
  // the Scan viewer, or with null takes the mark away: every Volume on
  // this computer then. Whether they're locked by either mark.
  markPages: answers<
    { volumeId: string; as: PageMark | null },
    InstalledBook[]
  >('{ volumeId, as }', (body) => {
    const volume = volumeOf(body);
    const { as } = body;
    return volume === null ||
      !(as === null || as === 'checked' || as === 'none')
      ? null
      : { ...volume, as };
  }),
  pagesLocked: answers<{ volumeId: string }, boolean>('{ volumeId }', volumeOf),
  // Whether the Volume is offloaded: then only its cited Images load.
  isOffloaded: answers<{ volumeId: string }, boolean>('{ volumeId }', volumeOf),
  // The bytes offloading the Volume would free, keeping its cited Images;
  // null when that can't be known.
  offloadFrees: answers<{ volumeId: string }, number | null>(
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
