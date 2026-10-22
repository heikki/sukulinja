import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { stepOf } from './keys';
import { controlStyles, scanNavStyles } from './styles';

import './edit';

function stop(e: Event) {
  e.stopPropagation();
}

// Stepping through the Volume, floating over the foot of the scan: the
// Image shown of how many, once Astia says, and while a Box is pending or
// waits to be discarded, its Cancel and Save. Pointer and wheel input stays
// here, so using it doesn't pan or zoom the scan beneath. The button a held
// ←/→ stands for shows pressed.
@customElement('sl-scan-nav')
export class ScanNavElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanNavStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // Which way the arrow key held steps. At the first or last Image its
  // button is disabled all the same: there's no step to show.
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

  // After Not now: the Volume is still on Astia's old filming, and
  // read-only; clicking asks about switching again.
  private renderOldFilming() {
    const { viewer } = this.state;
    if (!viewer.oldFilming.get() || viewer.rescan.get() !== null) {
      return nothing;
    }
    return html`<button
      class="old-filming"
      @click=${() => {
        viewer.askAgain();
      }}
    >
      ⓘ Old filming
    </button>`;
  }

  override render() {
    const count = this.state.viewer.count.get();
    const image = this.state.viewer.image.get();
    return html`
      <button
        class=${this.pressed === -1 ? 'pressed' : ''}
        aria-label="Previous image"
        ?disabled=${image <= 1}
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
        @focus=${(e: FocusEvent) => {
          (e.target as HTMLInputElement).select();
        }}
        @mousedown=${(e: MouseEvent) => {
          // Taking focus, a click selects the number to type over: its own
          // press would put the caret down instead and drop the selection.
          const input = e.target as HTMLInputElement;
          if (this.shadowRoot?.activeElement === input) return;
          e.preventDefault();
          input.focus();
        }}
        @keydown=${(e: KeyboardEvent) => {
          // Enter lets go of the field, which commits the number. Escape
          // first puts back the Image shown, so letting go changes nothing,
          // and stops there rather than closing the viewer. Either way the
          // arrow keys step again. Both are marked handled, or WKWebView
          // hands them on to macOS, which beeps.
          const input = e.target as HTMLInputElement;
          if (e.key === 'Escape') {
            e.stopPropagation();
            input.value = String(this.state.viewer.image.get());
          } else if (e.key !== 'Enter') {
            return;
          }
          e.preventDefault();
          input.blur();
        }}
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          this.ask(Number(input.value));
          input.value = String(this.state.viewer.image.get());
        }}
      />
      <span class="count">${count === null ? '' : `of ${count}`}</span>
      <button
        class=${this.pressed === 1 ? 'pressed' : ''}
        aria-label="Next image"
        ?disabled=${count !== null && image >= count}
        @click=${() => {
          this.ask(image + 1);
        }}
      >
        ›
      </button>
      ${this.renderOldFilming()}
      ${
        this.state.viewer.pending.get() === null &&
        !this.state.viewer.discarding.get()
          ? nothing
          : html`<sl-scan-edit></sl-scan-edit>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-nav': ScanNavElement;
  }
}
