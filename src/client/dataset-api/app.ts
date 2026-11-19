// What the screens ask the app outside any dataset, shared by them all
// (common/operations/app.ts): the install's parishes, a parish's church
// books and their downloads, the Scan cache, and the assistant's key.
// The datasets as a whole are asked by the lifecycle adapter
// (lifecycle.ts).

import type { AppOperations } from '@/common/operations';
import type {
  AssistantKeyStatus,
  ChurchBookArchive,
  ChurchBookVolume,
  InstalledBook,
  OffloadFolder,
  ScanCacheStatus
} from '@/common/types';

import { operationsAt } from './ask';
import type { FetchOptions } from './ask';

// Each call rejects with ApiError when it fails, and with the signal's
// reason once `signal` aborts.
export interface AppApi {
  // Every parish, by its archive's title in Astia.
  parishes: (signal?: AbortSignal) => Promise<ChurchBookArchive[]>;
  // The parish archives whose titles start most like `name`, best first.
  findParishArchives: (
    name: string,
    signal?: AbortSignal
  ) => Promise<ChurchBookArchive[]>;
  // The archive joins the install's parishes, with no spelling.
  addParish: (archiveId: string) => Promise<void>;
  // Every reference giving the spelling links into the archive from now on.
  linkSpelling: (spelling: string, archiveId: string) => Promise<void>;
  // The parish archive's Volumes, with what of each is on disk.
  churchBooks: (archiveId: string) => Promise<ChurchBookVolume[]>;
  // Starts or carries on with the Volume's download, or stops it.
  startDownload: (volumeId: string) => Promise<void>;
  stopDownload: (volumeId: string) => Promise<void>;
  // Every Volume with something on this computer; taking one off the disk
  // answers with them as they then stand.
  allBooks: () => Promise<InstalledBook[]>;
  removeFromDisk: (volumeId: string) => Promise<InstalledBook[]>;
  offload: (volumeId: string) => Promise<InstalledBook[]>;
  bringBack: (volumeId: string) => Promise<InstalledBook[]>;
  // Marks the Volume's page numbers checked, locking them, or no longer,
  // answering with every Volume on this computer; whether they're marked.
  checkPages: (volumeId: string, checked: boolean) => Promise<InstalledBook[]>;
  pagesChecked: (volumeId: string, signal?: AbortSignal) => Promise<boolean>;
  isOffloaded: (volumeId: string) => Promise<boolean>;
  offloadFrees: (volumeId: string) => Promise<number | null>;
  // The Scan cache; setting its cap and clearing it answer with it as it
  // then stands.
  scanCache: () => Promise<ScanCacheStatus>;
  setScanCap: (cap: number) => Promise<ScanCacheStatus>;
  clearScanCache: () => Promise<ScanCacheStatus>;
  // The offload folder, choosing one with the app's picker, and none; each
  // answers with it as it then stands.
  offloadFolder: () => Promise<OffloadFolder | null>;
  chooseOffloadFolder: () => Promise<OffloadFolder | null>;
  clearOffloadFolder: () => Promise<OffloadFolder | null>;
  // Where the assistant's credentials come from; keeping a key and
  // removing it answer with it as it then stands.
  assistantKey: () => Promise<AssistantKeyStatus>;
  setAssistantKey: (key: string) => Promise<AssistantKeyStatus>;
  removeAssistantKey: () => Promise<AssistantKeyStatus>;
}

export function openAppApi({
  fetch: send = async (req) => await fetch(req),
  origin = ''
}: FetchOptions = {}): AppApi {
  const { call } = operationsAt<AppOperations>(send, `${origin}/api`);
  return {
    parishes: async (signal) =>
      await call('parishes', {}, 'the parishes', signal),
    findParishArchives: async (name, signal) =>
      await call('findParishArchives', { name }, 'Finding', signal),
    async addParish(archiveId) {
      await call('addParish', { archiveId }, 'Adding the parish');
    },
    async linkSpelling(spelling, archiveId) {
      await call('linkSpelling', { spelling, archiveId }, 'Linking');
    },
    churchBooks: async (archiveId) =>
      await call('churchBooks', { archiveId }, 'the church books'),
    async startDownload(volumeId) {
      await call('startDownload', { volumeId }, 'Downloading');
    },
    async stopDownload(volumeId) {
      await call('stopDownload', { volumeId }, 'Stopping the download');
    },
    allBooks: async () => await call('allBooks', {}, 'the volumes'),
    removeFromDisk: async (volumeId) =>
      await call('removeFromDisk', { volumeId }, 'Removing from disk'),
    offload: async (volumeId) =>
      await call('offload', { volumeId }, 'Offloading'),
    bringBack: async (volumeId) =>
      await call('bringBack', { volumeId }, 'Bringing back'),
    checkPages: async (volumeId, checked) =>
      await call('checkPages', { volumeId, checked }, 'Marking the pages'),
    pagesChecked: async (volumeId, signal) =>
      await call('pagesChecked', { volumeId }, 'the pages', signal),
    isOffloaded: async (volumeId) =>
      await call('isOffloaded', { volumeId }, 'whether it is offloaded'),
    offloadFrees: async (volumeId) =>
      await call('offloadFrees', { volumeId }, 'what offloading frees'),
    scanCache: async () => await call('scanCache', {}, 'the Scan cache'),
    setScanCap: async (cap) =>
      await call('setScanCap', { cap }, 'Setting the cap'),
    clearScanCache: async () =>
      await call('clearScanCache', {}, 'Clearing the Scan cache'),
    offloadFolder: async () =>
      await call('offloadFolder', {}, 'the offload folder'),
    chooseOffloadFolder: async () =>
      await call('chooseOffloadFolder', {}, 'Choosing a folder'),
    clearOffloadFolder: async () =>
      await call('clearOffloadFolder', {}, 'Clearing the offload folder'),
    assistantKey: async () => await call('assistantKey', {}, 'the key'),
    setAssistantKey: async (key) =>
      await call('setAssistantKey', { key }, 'Saving the key'),
    removeAssistantKey: async () =>
      await call('removeAssistantKey', {}, 'Removing the key')
  };
}
