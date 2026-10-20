import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { volumeTitle } from '@client/link-labels';
import { appState } from '@client/state';
import type { AppState, LinkOpen } from '@client/state';

import { controlStyles, scanToolbarStyles } from './styles';

// The archive of a source's Link, or of the books it wasn't found in.
function archiveOf(source: LinkOpen) {
  return source.link === null ? source.unlinked.archive : source.link.archive;
}

// The Scan viewer's one row: the archive and the Volume shown, and closing.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanToolbarStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  override render() {
    const source = this.state.viewer.source.get();
    if (source === null) return nothing;
    const shown = this.state.viewer.volume.get();
    const named = archiveOf(source);
    const archive = named === undefined ? '' : `${named} · `;
    const volume = shown === null ? 'No Volume' : volumeTitle(shown.label);
    return html`
      <span class="volume">${archive}${volume}</span>
      <button
        class="close"
        aria-label="Close"
        @click=${() => {
          this.state.viewer.close();
        }}
      >
        ✕
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-toolbar': ScanToolbarElement;
  }
}
