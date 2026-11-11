import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { volumeTitle } from '@/client/link-labels';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import '../box-stage/toolbar';

// The Scan viewer's one row: the archive and the Volume shown. The source
// clicked again, or Escape, closes the viewer.
@customElement('sl-scan-toolbar')
class ScanToolbarElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  override render() {
    const { viewer } = this.state;
    if (viewer.opened.get() === null) return nothing;
    const shown = viewer.volume.get();
    const source = viewer.source.get();
    // The Volume's archive, or with none shown, the one a source wasn't
    // found in.
    const named =
      shown === null && source?.link === null
        ? source.unlinked.archive
        : viewer.archive.get();
    const archive = named === null || named === undefined ? '' : `${named} · `;
    const volume = shown === null ? 'No Volume' : volumeTitle(shown.label);
    return html`<sl-viewer-toolbar
      heading=${`${archive}${volume}`}
    ></sl-viewer-toolbar>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-toolbar': ScanToolbarElement;
  }
}
