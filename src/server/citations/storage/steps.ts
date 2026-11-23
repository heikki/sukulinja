// What Storage would do next with a Volume, from what it has of it and
// whether the Offload folder is set and attached. Nothing the folder being
// away would refuse is offered.

import { isWhole } from '@/common/storage';
import type {
  DownloadStatus,
  StorageSteps,
  VolumeOnDisk
} from '@/common/types';

// The Offload folder: none set, set and attached, or set and away.
export type FolderState = 'none' | 'attached' | 'away';

interface Has {
  // Whether Astia has scans of it; true unless it says otherwise.
  digitized: boolean;
  onDisk: VolumeOnDisk;
  download: DownloadStatus | null;
  offloaded: { images: number; bytes: number } | null;
}

// An Offloaded Volume's download brings it back from the Offload folder
// first, which waits for the folder; with none set since, it's only
// downloaded.
function bringingBack(folder: FolderState): StorageSteps['download'] {
  if (folder === 'away') return null;
  return folder === 'attached' ? 'bringBack' : 'start';
}

// Stopped while it's on its way; none for one with no scans; an
// Offloaded one brought back first; else downloaded until it's whole, unless
// Astia has re-scanned it, when only switching to the new filming goes on.
function downloadStep(
  { digitized, onDisk, download, offloaded }: Has,
  folder: FolderState
): StorageSteps['download'] {
  if (download?.state === 'queued' || download?.state === 'downloading') {
    return 'stop';
  }
  if (!digitized) return null;
  if (offloaded !== null) return bringingBack(folder);
  if (download?.error === 'rescanned' || isWhole(onDisk)) return null;
  return 'start';
}

// Its Images off the disk, into the Offload folder when one is set, else
// gone; then, kept in the folder, removed from it too, for good. With the
// folder away, neither.
function trashStep(
  { onDisk, offloaded }: Has,
  folder: FolderState
): StorageSteps['trash'] {
  if (folder === 'none') return onDisk.bytes > 0 ? 'remove' : null;
  if (folder === 'away') return null;
  if (offloaded === null && onDisk.bytes > 0) return 'offload';
  return onDisk.cached > 0 ? 'removeForGood' : null;
}

export function stepsOf(has: Has, folder: FolderState): StorageSteps {
  return {
    download: downloadStep(has, folder),
    trash: trashStep(has, folder)
  };
}
