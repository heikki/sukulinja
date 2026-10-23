import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import type { ReminderTarget } from '@/common/types';

import type { ReminderChoice } from './helpers';
import { reminderDialogStyles } from './styles';

export type { ReminderChoice } from './helpers';
export { imageLabel, personLabel, placeOf, targetOf } from './helpers';

function stop(e: Event) {
  e.stopPropagation();
}

// Writing a Reminder, or editing one: what it's on, picked from `choices`
// starting at `chosen` (or named, when there's only one), and its text.
// Save runs `save`, and closes once it's done; one refused says why and
// stays open. Cancel, Esc or a press on the scrim asks to `close`. A modal
// <dialog>, so it's over everything wherever it's opened from. Keys and
// presses stay here, so nothing under it acts on them; ⌘Enter saves.
@customElement('sl-reminder-dialog')
export class ReminderDialogElement extends LitElement {
  static override styles = reminderDialogStyles;

  @property() heading = 'Add reminder';
  @property({ attribute: false }) choices: ReminderChoice[] = [];
  @property({ attribute: false }) chosen = 0;
  @property({ attribute: false }) text = '';
  @property({ attribute: false }) save:
    ((text: string, target: ReminderTarget) => Promise<void>) | null = null;

  @state() private typed: string | null = null;
  @state() private picked: number | null = null;
  @state() private saving = false;
  @state() private error: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
  }

  override firstUpdated() {
    this.renderRoot.querySelector('dialog')?.showModal();
    this.renderRoot.querySelector('textarea')?.focus();
  }

  private get value() {
    return this.typed ?? this.text;
  }

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      void this.submit();
    }
  };

  private async submit() {
    const target = this.choices[this.picked ?? this.chosen]?.target;
    const { save } = this;
    if (target === undefined || save === null) return;
    if (this.value.trim() === '' || this.saving) return;
    this.saving = true;
    this.error = null;
    try {
      await save(this.value, target);
      this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.saving = false;
    }
  }

  private renderOn() {
    if (this.choices.length === 1) {
      return html`<p class="on">On ${this.choices[0]!.label}</p>`;
    }
    const at = this.picked ?? this.chosen;
    return html`
      <label for="on">On</label>
      <select
        id="on"
        @change=${(e: Event) => {
          this.picked = (e.target as HTMLSelectElement).selectedIndex;
        }}
      >
        ${this.choices.map(
          (c, i) => html`<option ?selected=${i === at}>${c.label}</option>`
        )}
      </select>
    `;
  }

  override render() {
    return html`
      <dialog
        aria-label=${this.heading}
        @click=${(e: Event) => {
          // On the scrim, outside the card.
          if (e.target === e.currentTarget) this.close();
        }}
        @cancel=${(e: Event) => {
          e.preventDefault();
        }}
      >
        <div class="dialog">
          <h2>${this.heading}</h2>
          ${this.renderOn()}
          <textarea
            aria-label="Reminder"
            .value=${this.value}
            @input=${(e: Event) => {
              this.typed = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
          <div class="actions">
            <button @click=${this.close} ?disabled=${this.saving}>
              Cancel
            </button>
            <button
              class="primary"
              ?disabled=${this.saving || this.value.trim() === ''}
              @click=${() => {
                void this.submit();
              }}
            >
              ${this.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </dialog>
    `;
  }
}

// What the dialog opens with.
export type ReminderDialogProps = Pick<
  ReminderDialogElement,
  'heading' | 'choices' | 'chosen' | 'text' | 'save'
>;

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-dialog': ReminderDialogElement;
  }
}
