import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { appState } from '@client/state';
import type { AppState } from '@client/state';
import type { PersonRow } from '@common/types';

import { stepOf } from './keys';
import { controlStyles, scanNavStyles } from './styles';

import './edit';

function stop(e: Event) {
  e.stopPropagation();
}

// Stepping through the Volume, floating over the foot of the scan: the
// Image shown of how many, once Astia says, and while a Box is pending or
// waits to be discarded, its Cancel and Save, named from `persons`. Pointer and wheel input stays
// here, so using it doesn't pan or zoom the scan beneath. The button a held
// ←/→ stands for shows pressed.
@customElement('sl-scan-nav')
export class ScanNavElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanNavStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

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
    this.state.viewer.show(image);
  }

  override render() {
    const count = this.state.viewer.count.get();
    const image = this.state.viewer.image.get();
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
          input.value = String(this.state.viewer.image.get());
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
      ${
        this.state.viewer.pending.get() === null &&
        !this.state.viewer.discarding.get()
          ? nothing
          : html`<sl-scan-edit .persons=${this.persons}></sl-scan-edit>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-nav': ScanNavElement;
  }
}
