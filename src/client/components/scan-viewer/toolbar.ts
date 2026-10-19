import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Link } from '@common/types';

import { volumeTitle } from './citations';
import { controlStyles, scanToolbarStyles } from './styles';

// The Scan viewer's one row: the archive and Volume shown, and leaving,
// asked of the viewer with `scan-close`.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends LitElement {
  static override styles = [controlStyles, scanToolbarStyles];

  // The reference's link, whose Volume is shown.
  @property({ attribute: false }) link: Link | null = null;

  override render() {
    const { link } = this;
    if (link === null) return nothing;
    const archive = link.archive === undefined ? '' : `${link.archive} · `;
    const title = `${archive}${volumeTitle(link.volume)}`;
    return html`
      <span class="volume" title=${title}>${title}</span>
      <button
        class="close"
        title="Close (Esc)"
        aria-label="Close"
        @click=${() => {
          this.dispatchEvent(new CustomEvent('scan-close'));
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
