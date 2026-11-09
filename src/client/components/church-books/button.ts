import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import type { VolumeOpenEvent } from './index';

import '../corner-panel/button';
import './index';

// An open book, in currentColor like the flag and the gear beside it.
const BOOK_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 8 4 C 6.5 2.75 4.25 2.5 1.75 2.75 V 13 C 4.25 12.75 6.5 13 8 14.25 C 9.5 13 11.75 12.75 14.25 13 V 2.75 C 11.75 2.5 9.5 2.75 8 4 Z M 8 4 V 14.25"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// Beside Settings: a book that opens the church books, or closes them.
// Picking a Volume there opens it in the Scan viewer on its first Image,
// with no source.
@customElement('sl-church-books-button')
class ChurchBooksButtonElement extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private open = false;

  private readonly onOpenVolume = (e: VolumeOpenEvent) => {
    const { volumeId, label } = e.detail;
    this.open = false;
    this.state.viewer.openImage({ volumeId, volume: label, image: 1 });
  };

  override render() {
    return html`
      <sl-corner-button
        label="Church books"
        ?expanded=${this.open}
        @click=${() => {
          this.open = !this.open;
        }}
      >
        ${BOOK_ICON}
      </sl-corner-button>
      ${
        this.open
          ? html`<sl-church-books-dialog
              @close=${() => {
                this.open = false;
              }}
              @open-volume=${this.onOpenVolume}
            ></sl-church-books-dialog>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-church-books-button': ChurchBooksButtonElement;
  }
}
