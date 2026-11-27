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
function bringingBack(folder: FolderState): StorageSteps['move'] {
  if (folder === 'away') return null;
  return folder === 'attached' ? 'bringBack' : 'start';
}

// Stopped while it's on its way; none for one with no scans; an
// Offloaded one brought back first; else downloaded until it's whole, unless
// Astia has re-scanned it, when only switching to the new filming goes on.
function downloadStep(
  { digitized, onDisk, download, offloaded }: Has,
  folder: FolderState
): StorageSteps['move'] {
  if (download?.state === 'queued' || download?.state === 'downloading') {
    return 'stop';
  }
  if (!digitized) return null;
  if (offloaded !== null) return bringingBack(folder);
  if (download?.error === 'rescanned' || isWhole(onDisk)) return null;
  return 'start';
}

// The download's step; with none, a whole Volume on disk is offloaded into
// the Offload folder, attached. Downloading, bringing back and offloading
// never go together, so they're one button.
function moveStep(has: Has, folder: FolderState): StorageSteps['move'] {
  const download = downloadStep(has, folder);
  if (download !== null) return download;
  const { onDisk, offloaded } = has;
  const offloads =
    folder === 'attached' &&
    offloaded === null &&
    onDisk.bytes > 0 &&
    isWhole(onDisk);
  return offloads ? 'offload' : null;
}

// All of it removed, from disk and from the Offload folder, whether it's
// Offloaded or not; nothing while the folder's away, as what it keeps there
// can't go.
function trashStep(
  { onDisk }: Has,
  folder: FolderState
): StorageSteps['trash'] {
  if (folder === 'away') return null;
  const here = folder === 'none' ? onDisk.bytes : onDisk.cached;
  return here > 0 ? 'remove' : null;
}

export function stepsOf(has: Has, folder: FolderState): StorageSteps {
  return {
    move: moveStep(has, folder),
    trash: trashStep(has, folder)
  };
}
