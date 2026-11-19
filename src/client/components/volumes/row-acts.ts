import { formatBytes } from '../settings/helpers';
import { awayText, downloadActions } from './helpers';
import type { DownloadAction } from './helpers';
import type { VolumeRow } from './rows';
import {
  actButton,
  BRING_BACK_ICON,
  CHECK_ICON,
  DOWNLOAD_ICON,
  EMPTY_SLOT,
  OFFLOAD_ICON,
  REMOVE_ICON,
  STOP_ICON,
  TRASH_ICON
} from './table';

// What a row's buttons do, and whether one is already being done.
export interface RowActions {
  busy: boolean;
  // What offloading a Volume would free, by its id, once asked.
  frees: Map<string, number | null>;
  askFrees: (book: VolumeRow) => void;
  check: (book: VolumeRow) => void;
  download: (book: VolumeRow, action: DownloadAction) => void;
  offload: (book: VolumeRow) => void;
  bringBack: (book: VolumeRow) => void;
  remove: (book: VolumeRow) => void;
  unlist: (book: VolumeRow) => void;
}

// Marking its page numbers, its download, offloading it, and removing it
// from disk or, with nothing there, taking one added by hand off the Book
// list, each in its place; an offloaded one is only brought back.
export function renderActs(book: VolumeRow, does: RowActions) {
  if (book.offloaded !== null) {
    return [EMPTY_SLOT, EMPTY_SLOT, bringBack(book, does), EMPTY_SLOT];
  }
  return [
    check(book, does),
    download(book, does),
    offload(book, does),
    book.onDisk.bytes > 0 ? remove(book, does) : unlist(book, does)
  ];
}

// Only for one All books knows, whose page numbers it says.
function check(book: VolumeRow, does: RowActions) {
  if (book.pages === null) return EMPTY_SLOT;
  const checked = book.pages === 'checked';
  return actButton(
    checked ? 'Unmark page numbers checked' : 'Mark page numbers checked',
    CHECK_ICON,
    () => {
      does.check(book);
    },
    { pressed: checked, disabled: does.busy }
  );
}

function download(book: VolumeRow, does: RowActions) {
  const [next] = downloadActions(book);
  if (next === undefined) return EMPTY_SLOT;
  return actButton(
    next.label,
    next.action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
    () => {
      does.download(book, next.action);
    }
  );
}

// Saying, once pointed at, what it would free.
function offload(book: VolumeRow, does: RowActions) {
  if (book.onDisk.cached === 0) return EMPTY_SLOT;
  const freed = does.frees.get(book.id);
  const frees =
    freed === undefined || freed === null
      ? 'keep only the cited images on disk'
      : `frees ${formatBytes(freed)}, keeping the cited images`;
  return actButton(
    'Offload',
    OFFLOAD_ICON,
    () => {
      does.offload(book);
    },
    {
      title: `Offload: ${frees}`,
      disabled: does.busy,
      onHint: () => {
        does.askFrees(book);
      }
    }
  );
}

// In the offload's place, with what comes back.
function bringBack(book: VolumeRow, does: RowActions) {
  const away = book.offloaded === null ? null : awayText(book.offloaded);
  return actButton(
    'Bring back',
    BRING_BACK_ICON,
    () => {
      does.bringBack(book);
    },
    {
      title: away === null ? 'Bring back' : `Bring back: ${away}`,
      disabled: does.busy
    }
  );
}

function remove(book: VolumeRow, does: RowActions) {
  return actButton(
    'Remove from disk',
    TRASH_ICON,
    () => {
      does.remove(book);
    },
    { disabled: does.busy }
  );
}

// Only one added by hand that nothing cites.
function unlist(book: VolumeRow, does: RowActions) {
  if (!book.added || (book.cited ?? 0) > 0) return EMPTY_SLOT;
  return actButton(
    'Remove',
    REMOVE_ICON,
    () => {
      does.unlist(book);
    },
    { title: 'Remove from the list', disabled: does.busy }
  );
}
