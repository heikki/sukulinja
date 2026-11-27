import type { VolumesRow } from '@/common/types';

import { formatBytes } from '../settings/helpers';
import type { DownloadAction } from './helpers';
import {
  actButton,
  BRING_BACK_ICON,
  DOWNLOAD_ICON,
  EMPTY_SLOT,
  OFFLOAD_ICON,
  STOP_ICON,
  TRASH_ICON,
  UNLIST_ICON
} from './table';

// What a row's buttons do, and whether one is already being done.
export interface RowActions {
  busy: boolean;
  // What offloading a Volume would free, by its id, once asked.
  frees: Map<string, number | null>;
  askFrees: (book: VolumesRow) => void;
  download: (book: VolumesRow, action: DownloadAction) => void;
  offload: (book: VolumesRow) => void;
  remove: (book: VolumesRow) => void;
  removeForGood: (book: VolumesRow) => void;
  unlist: (book: VolumesRow) => void;
}

// What the trash button does next, as the view says.
type TrashStep = NonNullable<VolumesRow['steps']['trash']>;

// Its download, and the trash button, each in its place. Downloading,
// bringing back and offloading never go together, as only a whole Volume
// not yet offloaded is offloaded, so offloading takes the download's place.
export function renderActs(book: VolumesRow, does: RowActions) {
  if (book.steps.download === null && book.steps.trash === 'offload') {
    return [
      trashButton(book, does, 'offload'),
      disabledTrash('Nothing to remove: offloaded instead')
    ];
  }
  return [download(book, does), trash(book, does)];
}

const DOWNLOAD_TITLE = {
  start: 'Download',
  bringBack:
    'Download: brought back from the offload folder, the rest from Astia',
  stop: 'Stop'
} as const;

const DOWNLOAD_ICON_OF = {
  start: DOWNLOAD_ICON,
  bringBack: BRING_BACK_ICON,
  stop: STOP_ICON
};

// Storage's next step with the download; bringing back is a download too.
function download(book: VolumesRow, does: RowActions) {
  const step = book.steps.download;
  if (step === null) return EMPTY_SLOT;
  const action: DownloadAction = step === 'stop' ? 'stop' : 'start';
  return actButton(
    action === 'start' ? 'Download' : 'Stop',
    DOWNLOAD_ICON_OF[step],
    () => {
      does.download(book, action);
    },
    { title: DOWNLOAD_TITLE[step] }
  );
}

function offloadTitle(book: VolumesRow, does: RowActions) {
  const freed = does.frees.get(book.id);
  const frees =
    freed === undefined || freed === null
      ? ''
      : `frees ${formatBytes(freed)}, `;
  return `Offload: ${frees}keeping the cited images on disk and the rest in the offload folder`;
}

function trashTitle(book: VolumesRow, does: RowActions, step: TrashStep) {
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

const ICON = {
  offload: OFFLOAD_ICON,
  remove: TRASH_ICON,
  removeForGood: TRASH_ICON,
  unlist: UNLIST_ICON
};

const LABEL: Record<TrashStep, string> = {
  offload: 'Offload',
  remove: 'Remove from disk',
  removeForGood: 'Remove for good',
  unlist: 'Remove from the list'
};

function disabledTrash(title: string) {
  return actButton('Remove', TRASH_ICON, () => undefined, {
    title,
    disabled: true
  });
}

// Drawn and coloured by what it would do; dimmed with nothing to.
function trash(book: VolumesRow, does: RowActions) {
  const step = book.steps.trash;
  return step === null
    ? disabledTrash(
        "Nothing to remove: not on disk, or the offload folder's drive away; and cited or not added by hand"
      )
    : trashButton(book, does, step);
}

function trashButton(book: VolumesRow, does: RowActions, step: TrashStep) {
  return actButton(
    LABEL[step],
    ICON[step],
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
