import { html, nothing } from 'lit';

import type { Viewer } from '@/client/state';

import type { Loading } from './frame';

import './rescan';
import './vision';

// When Astia re-scanned the Volume, along the top of the stage over any
// Image, shown or failed: what switching to the new filming leaves out,
// and the choice; `retry` loads the Image again once switched.
function rescanNote(retry: () => void) {
  return html`<sl-scan-rescan .retry=${retry}></sl-scan-rescan>`;
}

// Over the stage while the Image loads, or when it can't, with a way to
// ask again unless `retry` is null: no use in a filming Astia replaced;
// for an offloaded Volume, saying so.
// Over an Image already shown (`over`), the last one or the thumbnail, it
// waits a moment before showing, so a cached Image doesn't flash it.
function loadingNote(
  loading: Loading,
  over: boolean,
  retry: (() => void) | null,
  offloaded: boolean
) {
  if (loading === 'failed' && offloaded) {
    return html`
      <div class="note">
        <span>Offloaded</span>
        <span class="hint"
          >Only its cited images are kept. Bring it back in Volumes › All books
          to see the rest.</span
        >
      </div>
    `;
  }
  if (loading === 'failed') {
    return html`
      <div class="note">
        <span>Image unavailable</span>
        ${retry === null ? nothing : html`<button @click=${retry}>Retry</button>`}
      </div>
    `;
  }
  if (loading !== 'loading') return nothing;
  return html`
    <div class="note">
      <span class="loading ${over ? 'later' : ''}">Loading image…</span>
    </div>
  `;
}

// What's over the stage: how the Image is loading, Astia's re-scan of the
// Volume when there is one, and a Vision Match of the source. Over an Image of a filming Astia replaced,
// a failed one can't be asked for again.
export function stageNote(
  viewer: Viewer,
  shown: { loading: Loading; over: boolean; offloaded: boolean },
  retry: () => void
) {
  const old = viewer.oldFilming.get();
  const loading = loadingNote(
    shown.loading,
    shown.over,
    old ? null : retry,
    shown.offloaded
  );
  const vision = html`<sl-scan-vision></sl-scan-vision>`;
  if (viewer.rescan.get() === null) return html`${loading}${vision}`;
  return html`${loading}${rescanNote(retry)}${vision}`;
}
