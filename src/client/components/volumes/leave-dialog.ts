import { html } from 'lit';

import type { VolumesRow } from '@/common/types';

import '../ask';

import type { Ask } from '../ask';
import { formatBytes } from '../settings/helpers';
import { volumeCode } from './helpers';

// Asked before all of a Volume's Images are removed, from disk and from
// the offload folder.
export function renderLeaveDialog({
  book,
  confirm,
  cancel
}: {
  book: VolumesRow;
  confirm: () => void;
  cancel: () => void;
}) {
  const name = volumeCode(book.label);
  const ask: Ask = {
    title: `Remove ${name}?`,
    text:
      book.onDisk.bytes > 0
        ? html`All its images will be removed:
            <strong>${formatBytes(book.onDisk.bytes)}</strong> on disk, and any
            in the offload folder.`
        : html`All its images in the offload folder will be removed.`,
    step: 'Remove',
    tone: 'danger'
  };
  return html`<sl-ask
    .ask=${ask}
    @cancel=${cancel}
    @confirm=${confirm}
  ></sl-ask>`;
}
