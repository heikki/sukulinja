import { html } from 'lit';

import type { OffloadFolder } from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { volumeCode } from './helpers';
import type { VolumeRow } from './rows';

// What leaving the disk takes: all of a Volume, or all but its cited
// Images.
export type Leaving = 'remove' | 'offload';

// What becomes of the Images an offload doesn't keep.
function offloadText(folder: OffloadFolder | null) {
  const rest =
    folder === null
      ? 'The rest are removed from disk.'
      : `The rest are moved to ${folder.path}, and read from there while it's attached.`;
  return html`Only its cited images stay on disk. ${rest} Nothing else of it is
  fetched from Astia until it's brought back.`;
}

// Asked before a Volume's Images leave the disk, all of them or all but
// the cited ones (`dialogStyles`).
export function renderLeaveDialog({
  book,
  what,
  folder,
  confirm,
  cancel
}: {
  book: VolumeRow;
  what: Leaving;
  // The offload folder; null for none.
  folder: OffloadFolder | null;
  confirm: () => void;
  cancel: () => void;
}) {
  const name = volumeCode(book.label);
  const remove = what === 'remove';
  return html`
    <div class="overlay" @click=${cancel}>
      <div
        class="dialog"
        role="alertdialog"
        aria-labelledby="leave-title"
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2 id="leave-title">
          ${remove ? `Remove ${name} from disk?` : `Offload ${name}?`}
        </h2>
        <p>
          ${
            remove
              ? html`All <strong>${formatBytes(book.onDisk.bytes)}</strong> of
                  its images will be removed. They download again from Astia
                  when opened.`
              : offloadText(folder)
          }
        </p>
        <div class="actions">
          <button @click=${cancel}>Cancel</button>
          <button class="danger" @click=${confirm}>
            ${remove ? 'Remove' : 'Offload'}
          </button>
        </div>
      </div>
    </div>
  `;
}
