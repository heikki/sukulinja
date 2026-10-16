import { html, nothing } from 'lit';

import type { Loading } from './frame';

// Over the stage while the Image loads, or when it can't, with a way to
// ask again. Over an Image already shown (`over`), the last one or the
// thumbnail, it waits a moment before showing, so a cached Image doesn't
// flash it.
export function loadingNote(
  loading: Loading,
  over: boolean,
  retry: () => void
) {
  if (loading === 'failed') {
    return html`
      <div class="note">
        <span>Image unavailable</span>
        <button @click=${retry}>Retry</button>
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
