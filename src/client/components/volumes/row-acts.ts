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
  unlist: (book: VolumesRow) => void;
}

// What the trash button does next, as the view says.
type TrashStep = NonNullable<VolumesRow['steps']['trash']>;

// Storage's move, and the trash button, each in its place.
export function renderActs(book: VolumesRow, does: RowActions) {
  return [move(book, does), trash(book, does)];
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

// Storage's next move: the download, bringing back being one too, or
// offloading.
function move(book: VolumesRow, does: RowActions) {
  const step = book.steps.move;
  if (step === null) return EMPTY_SLOT;
  if (step === 'offload') return offload(book, does);
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

// Unasked, as nothing leaves for good; says first what it frees.
function offload(book: VolumesRow, does: RowActions) {
  const freed = does.frees.get(book.id);
  const frees =
    freed === undefined || freed === null
      ? ''
      : `frees ${formatBytes(freed)}, `;
  return actButton(
    'Offload',
    OFFLOAD_ICON,
    () => {
      does.offload(book);
    },
    {
      title: `Offload: ${frees}keeping the cited images on disk and the rest in the offload folder`,
      disabled: does.busy,
      kind: 'offload',
      onHint: () => {
        does.askFrees(book);
      }
    }
  );
}

const TRASH: Record<
  TrashStep,
  { label: string; title: string; icon: unknown }
> = {
  remove: {
    label: 'Remove',
    title:
      'Remove: from disk and from the offload folder, downloaded again from Astia when opened',
    icon: TRASH_ICON
  },
  unlist: {
    label: 'Remove from the list',
    title: 'Remove from the list',
    icon: UNLIST_ICON
  }
};

// Drawn and coloured by what it would do; dimmed with nothing to.
function trash(book: VolumesRow, does: RowActions) {
  const step = book.steps.trash;
  if (step === null) {
    return actButton('Remove', TRASH_ICON, () => undefined, {
      title:
        "Nothing to remove: not on this computer, or the offload folder's drive away; and cited or not added by hand",
      disabled: true
    });
  }
  const { label, title, icon } = TRASH[step];
  return actButton(
    label,
    icon,
    () => {
      does[step](book);
    },
    { title, disabled: does.busy, kind: step }
  );
}
