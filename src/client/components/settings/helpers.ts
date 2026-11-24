import type { StorageStatus } from '@/common/types';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

// A size as Settings shows it: whole MB below a GB, then GB to one
// place, dropping a trailing .0.
export function formatBytes(bytes: number) {
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  return `${Number((bytes / GB).toFixed(1))} GB`;
}

// What a pick in Settings' Storage row would remove from disk, to ask
// about first: all of it on Clear, but what Offloaded Volumes keep, and on
// a cap below the space used, what Storage drops to fit. Null when nothing
// would go.
export type StorageDrop =
  | { kind: 'clear'; bytes: number; kept: number }
  | { kind: 'cap'; cap: number; bytes: number };

export function clearDrop({
  used,
  kept
}: Pick<StorageStatus, 'used' | 'kept'>): StorageDrop | null {
  return used > kept ? { kind: 'clear', bytes: used - kept, kept } : null;
}

export function capDrop(used: number, cap: number): StorageDrop | null {
  return used > cap ? { kind: 'cap', cap, bytes: used - cap } : null;
}

// A folder as Settings names it: the folder's own name, after its drive's
// when it's on one mounted under /Volumes; the full path is the title.
export function folderName(path: string) {
  const parts = path.split('/').filter((part) => part !== '');
  const name = parts.at(-1) ?? path;
  if (parts[0] === 'Volumes' && parts.length > 2) {
    return `${parts[1]} › ${name}`;
  }
  return name;
}
