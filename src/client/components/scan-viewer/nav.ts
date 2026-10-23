import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { imageAfter, stepOf } from './keys';
import type { ImageMove } from './keys';
import { remindersHere } from './reminder-choices';
import { controlStyles, scanNavStyles } from './styles';

import './edit';

function stop(e: Event) {
  e.stopPropagation();
}

// Stepping through the Volume, floating over the foot of the scan: the
// Image shown of how many, once Astia says, and while a Box is pending or
// waits to be discarded, its Cancel and Save. Pointer and wheel input stays
// here, so using it doesn't pan or zoom the scan beneath. The button a held
// key stands for (←/→, with Shift or without, Home or End) shows pressed.
@customElement('sl-scan-nav')
export class ScanNavElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanNavStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // The move the key held made. Pressed where it goes nowhere, it shows
  // nothing: there's no step to show. Landing on the first or last Image, its
  // button stays pressed, not disabled, until the key is let go.
  @state() private pressed: ImageMove | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
    // Capturing, so it hears the key before the viewer moves.
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.release);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.release);
  }

  private readonly onKey = (e: KeyboardEvent) => {
    const step = stepOf(e)?.image;
    if (step === undefined) return;
    if (e.type === 'keyup') {
      this.pressed = null;
      return;
    }
    // A key held repeats; once at the end it goes nowhere, still pressed.
    if (e.repeat && this.pressed === step) return;
    const { viewer } = this.state;
    const to = imageAfter(step, viewer.image.get(), viewer.count.get());
    this.pressed = to === null ? null : step;
  };

  // A key let go elsewhere never says so here.
  private readonly release = () => {
    this.pressed = null;
  };

  private ask(image: number) {
    this.state.viewer.show(image);
  }

  private renderMove(move: ImageMove, label: string, icon: string) {
    const to = imageAfter(
      move,
      this.state.viewer.image.get(),
      this.state.viewer.count.get()
    );
    return html`<button
      class=${this.pressed === move ? 'pressed' : ''}
      aria-label=${label}
      ?disabled=${to === null && this.pressed !== move}
      @click=${() => {
        if (to !== null) this.ask(to);
      }}
    >
      ${icon}
    </button>`;
  }

  // The open Reminders on the Image shown, as a marker with their count;
  // clicking asks for them (`scan-reminders`, at the marker's top middle in
  // client coordinates).
  private renderReminders() {
    const count = remindersHere(this.state).length;
    if (count === 0) return nothing;
    return html`<button
      class="reminders"
      aria-label=${count === 1 ? '1 reminder' : `${count} reminders`}
      @click=${(e: MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const at = { x: rect.left + rect.width / 2, y: rect.top - 6 };
        this.dispatchEvent(
          new CustomEvent('scan-reminders', {
            detail: at,
            bubbles: true,
            composed: true
          })
        );
      }}
    >
      ⚑ ${count}
    </button>`;
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
      ${this.renderMove('first', 'First image', '⇤')}
      ${this.renderMove(-10, 'Back 10 images', '«')}
      ${this.renderMove(-1, 'Previous image', '‹')}
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
      ${this.renderMove(1, 'Next image', '›')}
      ${this.renderMove(10, 'Forward 10 images', '»')}
      ${this.renderMove('last', 'Last image', '⇥')} ${this.renderReminders()}
      ${this.renderOldFilming()}
      ${
        this.state.viewer.pending.get() === null &&
        !this.state.viewer.discarding.get() &&
        this.state.viewer.confirming.get() === null
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
