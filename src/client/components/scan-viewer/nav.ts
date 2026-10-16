import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { stepOf } from './keys';
import { controlStyles, scanNavStyles } from './styles';

function stop(e: Event) {
  e.stopPropagation();
}

// Stepping through the Volume, floating over the foot of the scan: the
// Image shown (`image`) of how many (`count`, once known). Asks the viewer
// for an Image with `scan-show`. Pointer and wheel input stays here, so
// using it doesn't pan or zoom the scan beneath. The button a held ←/→
// stands for shows pressed.
@customElement('sl-scan-nav')
export class ScanNavElement extends LitElement {
  static override styles = [controlStyles, scanNavStyles];

  @property({ type: Number }) image = 1;
  @property({ attribute: false }) count: number | null = null;

  // Which way the arrow key held steps. Its button stays live while held,
  // so a step onto the first or last Image still shows the press.
  @state() private pressed: 1 | -1 | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.release);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.release);
  }

  private readonly onKey = (e: KeyboardEvent) => {
    const step = stepOf(e)?.image;
    if (step === undefined) return;
    this.pressed = e.type === 'keydown' ? step : null;
  };

  // A key let go elsewhere never says so here.
  private readonly release = () => {
    this.pressed = null;
  };

  private ask(image: number) {
    this.dispatchEvent(new CustomEvent('scan-show', { detail: image }));
  }

  override render() {
    const { count, image } = this;
    return html`
      <button
        class=${this.pressed === -1 ? 'pressed' : ''}
        title="Previous image (←)"
        aria-label="Previous image"
        ?disabled=${image <= 1 && this.pressed !== -1}
        @click=${() => {
          this.ask(image - 1);
        }}
      >
        ‹
      </button>
      <input
        type="number"
        min="1"
        max=${count ?? nothing}
        aria-label="Image"
        .value=${live(String(image))}
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          this.ask(Number(input.value));
          input.value = String(this.image);
        }}
      />
      <span class="count">${count === null ? '' : `of ${count}`}</span>
      <button
        class=${this.pressed === 1 ? 'pressed' : ''}
        title="Next image (→)"
        aria-label="Next image"
        ?disabled=${count !== null && image >= count && this.pressed !== 1}
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
