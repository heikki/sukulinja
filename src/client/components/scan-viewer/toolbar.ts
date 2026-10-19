import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { volumeTitle } from '@client/link-labels';
import { appState } from '@client/state';
import type { AppState } from '@client/state';

import { controlStyles, scanToolbarStyles } from './styles';

import './volumes';

// The Scan viewer's one row: the archive and the Volume shown, which opens
// the Volumes to change the source to, and closing.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanToolbarStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private choosing = false;

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
  }

  // A press anywhere but the toolbar closes the list; the Volume's button
  // toggles it itself.
  private readonly onOutside = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) this.setChoosing(false);
  };

  private setChoosing(on: boolean) {
    this.choosing = on;
    if (on) window.addEventListener('mousedown', this.onOutside);
    else window.removeEventListener('mousedown', this.onOutside);
  }

  private readonly onListClose = () => {
    this.setChoosing(false);
    this.renderRoot.querySelector<HTMLElement>('button.volume')?.focus();
  };

  override render() {
    const link = this.state.viewer.source.get()?.link;
    const shown = this.state.viewer.volume.get();
    if (link === undefined || shown === null) return nothing;
    const archive = link.archive === undefined ? '' : `${link.archive} · `;
    const title = `${archive}${volumeTitle(shown.label)}`;
    return html`
      <button
        class="volume"
        title=${`${title}\nChange Volume…`}
        aria-haspopup="true"
        aria-expanded=${this.choosing ? 'true' : 'false'}
        @click=${() => {
          this.setChoosing(!this.choosing);
        }}
      >
        <span class="name">${title}</span>
        <span class="chevron" aria-hidden="true">▾</span>
      </button>
      ${
        this.choosing
          ? html`<sl-scan-volumes @close=${this.onListClose}></sl-scan-volumes>`
          : nothing
      }
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
