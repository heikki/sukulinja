import { html } from 'lit';

import type { VolumesRow } from '@/common/types';

import '../ask';

import type { Ask } from '../ask';
import { formatBytes } from '../settings/helpers';
import { volumeCode } from './helpers';

// Asked before all of a Volume's Images are removed from disk, with no
// offload folder to keep them, or for good, from the folder too.
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
  const ask: Ask = {
    title: forGood ? `Remove ${name} for good?` : `Remove ${name} from disk?`,
    text: forGood
      ? html`All its images will be removed, from disk and from the offload
        folder.`
      : html`All <strong>${formatBytes(book.onDisk.bytes)}</strong> of its
          images will be removed.`,
    step: 'Remove',
    tone: 'danger'
  };
  return html`<sl-ask
    .ask=${ask}
    @cancel=${cancel}
    @confirm=${confirm}
  ></sl-ask>`;
}
