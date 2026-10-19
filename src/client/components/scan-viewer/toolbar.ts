import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { volumeTitle } from '@client/link-labels';
import { appState } from '@client/state';
import type { AppState } from '@client/state';

import { controlStyles, scanToolbarStyles } from './styles';

// The Scan viewer's one row: the archive and Volume of the source's Link,
// and closing.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanToolbarStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  override render() {
    const link = this.state.viewer.source.get()?.link;
    if (link === undefined) return nothing;
    const archive = link.archive === undefined ? '' : `${link.archive} · `;
    const title = `${archive}${volumeTitle(link.volume)}`;
    return html`
      <span class="volume" title=${title}>${title}</span>
      <button
        class="close"
        title="Close (Esc)"
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
