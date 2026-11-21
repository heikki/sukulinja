import { formatBytes } from '../settings/helpers';
import { downloadActions } from './helpers';
import type { DownloadAction } from './helpers';
import type { VolumeRow } from './rows';
import {
  actButton,
  DOWNLOAD_ICON,
  EMPTY_SLOT,
  STOP_ICON,
  TRASH_ICON
} from './table';

// What a row's buttons do, and whether one is already being done.
export interface RowActions {
  busy: boolean;
  // Whether an offload folder is chosen, so Images leaving the disk stay
  // in it.
  folder: boolean;
  // What offloading a Volume would free, by its id, once asked.
  frees: Map<string, number | null>;
  askFrees: (book: VolumeRow) => void;
  download: (book: VolumeRow, action: DownloadAction) => void;
  offload: (book: VolumeRow) => void;
  remove: (book: VolumeRow) => void;
  purge: (book: VolumeRow) => void;
  unlist: (book: VolumeRow) => void;
}

// What the trash button does next: its Images off the disk, kept in the
// offload folder when one is chosen, or else gone; then, kept in the
// folder, removed from it too, for good; with none left, one added by hand
// that nothing cites taken off the Book list.
export type TrashStep = 'offload' | 'remove' | 'purge' | 'unlist';

export function trashStep(book: VolumeRow, folder: boolean): TrashStep | null {
  const { onDisk, offloaded } = book;
  // One offloaded before the folder was cleared still has its cited ones.
  if (onDisk.bytes > 0 && !folder) return 'remove';
  if (offloaded === null && onDisk.bytes > 0) return 'offload';
  if (folder && onDisk.cached > 0) return 'purge';
  if (book.added && (book.cited ?? 0) === 0) return 'unlist';
  return null;
}

// Its download, and the trash button, each in its place.
export function renderActs(book: VolumeRow, does: RowActions) {
  return [download(book, does), trash(book, does)];
}

// An offloaded one is brought back from the offload folder first.
function download(book: VolumeRow, does: RowActions) {
  const next =
    book.offloaded !== null && book.download === null
      ? { action: 'start' as const, label: 'Download' }
      : downloadActions(book)[0];
  if (next === undefined) return EMPTY_SLOT;
  const back = book.offloaded !== null && does.folder;
  return actButton(
    next.label,
    next.action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
    () => {
      does.download(book, next.action);
    },
    {
      title: back
        ? 'Download: brought back from the offload folder, the rest from Astia'
        : next.label
    }
  );
}

function offloadTitle(book: VolumeRow, does: RowActions) {
  const freed = does.frees.get(book.id);
  const frees =
    freed === undefined || freed === null
      ? ''
      : `frees ${formatBytes(freed)}, `;
  return `Offload: ${frees}keeping the cited images on disk and the rest in the offload folder`;
}

function trashTitle(book: VolumeRow, does: RowActions, step: TrashStep) {
  switch (step) {
    case 'offload':
      return offloadTitle(book, does);
    case 'remove':
      return `Remove from disk: all ${formatBytes(book.onDisk.bytes)}, downloaded again from Astia when opened`;
    case 'purge':
      return 'Remove for good: from disk and from the offload folder, downloaded again from Astia when opened';
    case 'unlist':
      return 'Remove from the list';
  }
}

const LABEL: Record<TrashStep, string> = {
  offload: 'Offload',
  remove: 'Remove from disk',
  purge: 'Remove for good',
  unlist: 'Remove from the list'
};

// Coloured by what it would do; dimmed with nothing to.
function trash(book: VolumeRow, does: RowActions) {
  const step = trashStep(book, does.folder);
  if (step === null) {
    return actButton('Remove', TRASH_ICON, () => undefined, {
      title: 'Nothing to remove: not on disk, and cited or not added by hand',
      disabled: true
    });
  }
  return actButton(
    LABEL[step],
    TRASH_ICON,
    () => {
      does[step](book);
    },
    {
      title: trashTitle(book, does, step),
      disabled: does.busy,
      kind: step,
      onHint:
        step === 'offload'
          ? () => {
              does.askFrees(book);
            }
          : undefined
    }
  );
}
