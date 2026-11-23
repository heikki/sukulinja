import { formatBytes } from '../settings/helpers';
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
  // What offloading a Volume would free, by its id, once asked.
  frees: Map<string, number | null>;
  askFrees: (book: VolumeRow) => void;
  download: (book: VolumeRow, action: DownloadAction) => void;
  offload: (book: VolumeRow) => void;
  remove: (book: VolumeRow) => void;
  removeForGood: (book: VolumeRow) => void;
  unlist: (book: VolumeRow) => void;
}

// What the trash button does next: Storage's step; and with nothing of it
// on disk, one added by hand that nothing cites taken off the Book list.
export type TrashStep = NonNullable<VolumeRow['next']['trash']> | 'unlist';

export function trashStep(book: VolumeRow): TrashStep | null {
  if (book.next.trash !== null) return book.next.trash;
  if (book.onDisk.bytes > 0) return null;
  if (book.added && (book.cited ?? 0) === 0) return 'unlist';
  return null;
}

// Its download, and the trash button, each in its place.
export function renderActs(book: VolumeRow, does: RowActions) {
  return [download(book, does), trash(book, does)];
}

const DOWNLOAD_TITLE = {
  start: 'Download',
  bringBack:
    'Download: brought back from the offload folder, the rest from Astia',
  stop: 'Stop'
} as const;

// Storage's next step with the download; bringing back is a download too.
function download(book: VolumeRow, does: RowActions) {
  const step = book.next.download;
  if (step === null) return EMPTY_SLOT;
  const action: DownloadAction = step === 'stop' ? 'stop' : 'start';
  return actButton(
    action === 'start' ? 'Download' : 'Stop',
    action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
    () => {
      does.download(book, action);
    },
    { title: DOWNLOAD_TITLE[step] }
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
    case 'removeForGood':
      return 'Remove for good: from disk and from the offload folder, downloaded again from Astia when opened';
    case 'unlist':
      return 'Remove from the list';
  }
}

const LABEL: Record<TrashStep, string> = {
  offload: 'Offload',
  remove: 'Remove from disk',
  removeForGood: 'Remove for good',
  unlist: 'Remove from the list'
};

// Coloured by what it would do; dimmed with nothing to.
function trash(book: VolumeRow, does: RowActions) {
  const step = trashStep(book);
  if (step === null) {
    return actButton('Remove', TRASH_ICON, () => undefined, {
      title:
        "Nothing to remove: not on disk, or the offload folder's drive away; and cited or not added by hand",
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
