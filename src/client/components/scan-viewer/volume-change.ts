import { html } from 'lit';

import type { Viewer } from '@/client/state';

import type { VolumeOpen } from '../volumes/picker';

import '../volumes/picker';

// Another Volume to show in the Scan viewer, from the Volume picker: on
// the shown Volume's parish and series, the Volumes its source's reference
// fits on top. One opened is shown, the source's Link left as it is;
// either way it asks to `close`. With no Volume shown, on `archive`'s.
export function renderVolumeChange(
  viewer: Viewer,
  close: () => void,
  archive: string | null = null
) {
  const volume = viewer.volume.get();
  const citation = viewer.source.get()?.citation ?? null;
  return html`<sl-volume-picker
    heading="Change volume"
    subtitle="show another Volume, or add one to this tree's list"
    .shown=${
      volume === null
        ? { volumeId: null, archive }
        : { volumeId: volume.id, archive: viewer.archive.get() }
    }
    .citationId=${citation?.churchBook === true ? citation.id : null}
    @open-volume=${(e: CustomEvent<VolumeOpen>) => {
      viewer.changeVolume({
        id: e.detail.volumeId,
        label: e.detail.label,
        years: null
      });
      close();
    }}
    @close=${close}
  ></sl-volume-picker>`;
}
