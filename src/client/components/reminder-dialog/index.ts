import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { Floating } from '@/client/floating';
import type { ReminderTarget } from '@/common/types';

import type { ReminderChoice } from './helpers';
import { reminderDialogStyles } from './styles';

export type { ReminderChoice } from './helpers';
export { imageLabel, personLabel, placeOf, targetOf } from './helpers';

// Something else the dialog can do to the Reminder it shows, beside
// changing its text: marking it done or deleting it. The dialog closes
// once it's done.
export interface ReminderDialogAction {
  label: string;
  run: () => Promise<void> | void;
}

function stop(e: Event) {
  e.stopPropagation();
}

// Writing a Reminder, or showing one: what it's on, picked from `choices`
// starting at `chosen` (or named, when there's only one), and its text.
// With `viewing` it opens read-only, with `actions`, Edit and Close; Edit
// turns the text into a field to change, and Save or Cancel turns it back.
// Writing one, Save runs `save` and closes. Each of `actions` runs and
// closes; one refused says why and stays open. Cancel, Close or Esc asks
// to `close`. A panel floating over everything wherever it's opened from,
// dragged by its heading, leaving what's under it to be worked on. Keys
// and presses on it stay here, so nothing under it acts on them; ⌘Enter
// saves.
@customElement('sl-reminder-dialog')
export class ReminderDialogElement extends LitElement {
  static override styles = reminderDialogStyles;

  @property() heading = 'Add reminder';
  @property({ attribute: false }) choices: ReminderChoice[] = [];
  @property({ attribute: false }) chosen = 0;
  @property({ attribute: false }) text = '';
  @property({ attribute: false }) save:
    ((text: string, target: ReminderTarget) => Promise<void>) | null = null;
  @property({ attribute: false }) actions: ReminderDialogAction[] = [];
  @property({ attribute: false }) viewing = false;
  // What it's on, as muted lines in place of the heading and On; null to
  // head it with `heading`.
  @property({ attribute: false }) header: string[] | null = null;

  // Its text being changed, from read-only.
  @state() private editing = false;
  @state() private typed: string | null = null;
  @state() private picked: number | null = null;
  @state() private saving = false;
  @state() private error: string | null = null;

  private readonly floating = new Floating(this, 'reminder');

  override connectedCallback() {
    super.connectedCallback();
    for (const type of [
      'pointerdown',
      'mousedown',
      'wheel',
      'dblclick',
      'contextmenu'
    ]) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
  }

  override firstUpdated() {
    this.focusFirst();
  }

  // Turning to Edit and back moves focus to the field, and to Edit.
  override updated(changed: PropertyValues) {
    if (changed.get('editing') !== undefined) this.focusFirst();
  }

  // The text field, or read-only, Edit.
  private focusFirst() {
    const first = this.renderRoot.querySelector<HTMLElement>(
      'textarea, button.primary'
    );
    first?.focus();
  }

  private get readOnly() {
    return this.viewing && !this.editing;
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
    } else if (e.key === 'Enter' && e.metaKey && !this.readOnly) {
      e.preventDefault();
      void this.submit();
    }
  };

  private async submit() {
    const target = this.choices[this.picked ?? this.chosen]?.target;
    const { save } = this;
    if (target === undefined || save === null) return;
    if (this.value.trim() === '') return;
    await this.running(async () => {
      await save(this.value, target);
    }, this.viewing);
  }

  // Back to read-only, as it was.
  private readonly stopEditing = () => {
    this.editing = false;
    this.typed = null;
    this.error = null;
  };

  // Runs `run`, one at a time, closing once it's done, or going back to
  // read-only with `toView`.
  private async running(run: () => Promise<void> | void, toView = false) {
    if (this.saving) return;
    this.saving = true;
    this.error = null;
    try {
      await run();
      if (toView) this.stopEditing();
      else this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.saving = false;
    }
  }

  private renderActions() {
    return this.actions.map(
      (action) =>
        html`<button
          ?disabled=${this.saving}
          @click=${() => {
            void this.running(action.run);
          }}
        >
          ${action.label}
        </button>`
    );
  }

  private renderHeader() {
    const { header } = this;
    if (header === null) {
      return html`<h2>${this.heading}</h2>
        ${this.renderOn()}`;
    }
    return html`<div class="header">
      ${header.map((line) => html`<div>${line}</div>`)}
    </div>`;
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

  private renderText() {
    if (this.readOnly) return html`<p class="text">${this.text}</p>`;
    return html`<textarea
      aria-label="Reminder"
      .value=${this.value}
      @input=${(e: Event) => {
        this.typed = (e.target as HTMLTextAreaElement).value;
      }}
    ></textarea>`;
  }

  private renderReadOnlyButtons() {
    return html`
      <div class="more">${this.renderActions()}</div>
      <button @click=${this.close} ?disabled=${this.saving}>Close</button>
      <button
        class="primary"
        ?disabled=${this.saving}
        @click=${() => {
          this.editing = true;
        }}
      >
        Edit
      </button>
    `;
  }

  private renderEditButtons() {
    return html`
      <button
        @click=${this.viewing ? this.stopEditing : this.close}
        ?disabled=${this.saving}
      >
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
    `;
  }

  override render() {
    return html`
      <div
        class="dialog"
        popover="manual"
        role="dialog"
        @pointerdown=${this.floating.grip}
        aria-label=${this.heading}
      >
        ${this.renderHeader()} ${this.renderText()}
        ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
        <div class="actions">
          ${this.readOnly ? this.renderReadOnlyButtons() : this.renderEditButtons()}
        </div>
      </div>
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
