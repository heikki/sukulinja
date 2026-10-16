import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import type { Scan } from '@common/types';

import { volumeTitle } from './citations';
import { controlStyles, scanToolbarStyles } from './styles';

// The Scan viewer's one row: the link's Volume, where in it, and leaving.
// Asks the viewer for an Image with `scan-show`; close is reported with
// `scan-close` to the viewer's host.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends LitElement {
  static override styles = [controlStyles, scanToolbarStyles];

  // The reference's link, whose Volume is shown.
  @property({ attribute: false }) link: Scan | null = null;
  @property({ type: Number }) image = 1;
  // The Volume's Image count, once known.
  @property({ attribute: false }) count: number | null = null;

  private ask(type: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private renderNav() {
    const { count, image } = this;
    return html`
      <button
        title="Previous image (←)"
        aria-label="Previous image"
        ?disabled=${image <= 1}
        @click=${() => {
          this.ask('scan-show', image - 1);
        }}
      >
        ‹
      </button>
      <label>
        Image
        <input
          type="number"
          min="1"
          max=${count ?? nothing}
          .value=${live(String(image))}
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            this.ask('scan-show', Number(input.value));
            input.value = String(this.image);
          }}
        />
        ${count === null ? nothing : html`of ${count}`}
      </label>
      <button
        title="Next image (→)"
        aria-label="Next image"
        ?disabled=${count !== null && image >= count}
        @click=${() => {
          this.ask('scan-show', image + 1);
        }}
      >
        ›
      </button>
    `;
  }

  override render() {
    const { link } = this;
    if (link === null) return nothing;
    return html`
      <span class="volume">
        ${link.archive === undefined ? nothing : `${link.archive} · `}
        ${volumeTitle(link.volume)}
      </span>
      <span class="sep"></span>
      ${this.renderNav()}
      <span class="spacer"></span>
      <button
        title="Close (Esc)"
        aria-label="Close"
        @click=${() => {
          this.dispatchEvent(
            new CustomEvent('scan-close', { bubbles: true, composed: true })
          );
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
