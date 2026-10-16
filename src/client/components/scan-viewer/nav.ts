import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { controlStyles, scanNavStyles } from './styles';

function stop(e: Event) {
  e.stopPropagation();
}

// Stepping through the Volume, floating over the foot of the scan: the
// Image shown (`image`) of how many (`count`, once known). Asks the viewer
// for an Image with `scan-show`. Pointer and wheel input stays here, so
// using it doesn't pan or zoom the scan beneath.
@customElement('sl-scan-nav')
export class ScanNavElement extends LitElement {
  static override styles = [controlStyles, scanNavStyles];

  @property({ type: Number }) image = 1;
  @property({ attribute: false }) count: number | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
  }

  private ask(image: number) {
    this.dispatchEvent(new CustomEvent('scan-show', { detail: image }));
  }

  override render() {
    const { count, image } = this;
    return html`
      <button
        title="Previous image (←)"
        aria-label="Previous image"
        ?disabled=${image <= 1}
        @click=${() => {
          this.ask(image - 1);
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
            this.ask(Number(input.value));
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
          this.ask(image + 1);
        }}
      >
        ›
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-nav': ScanNavElement;
  }
}
