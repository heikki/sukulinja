import { html } from 'lit';

import type { VolumesRow } from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { volumeCode } from './helpers';

// Asked before all of a Volume's Images are removed from disk, with no
// offload folder to keep them, or for good, from the folder too
// (`dialogStyles`).
export function renderLeaveDialog({
  book,
  forGood,
  confirm,
  cancel
}: {
  book: VolumesRow;
  forGood: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  const name = volumeCode(book.label);
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
          ${forGood ? `Remove ${name} for good?` : `Remove ${name} from disk?`}
        </h2>
        <p>
          ${
            forGood
              ? html`All its images will be removed, from disk and from the
                offload folder.`
              : html`All <strong>${formatBytes(book.onDisk.bytes)}</strong> of
                  its images will be removed.`
          }
          They download again from Astia when opened.
        </p>
        <div class="actions">
          <button @click=${cancel}>Cancel</button>
          <button class="danger" @click=${confirm}>Remove</button>
        </div>
      </div>
    </div>
  `;
}
