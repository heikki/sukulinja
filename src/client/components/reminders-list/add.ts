import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { targetOf } from '@/client/state/reminders';
import type { ReminderPlaces } from '@/client/state/reminders';
import { keepTyping } from '@/client/typing';

import { reminderStyles } from './styles';

// Writing a new Reminder, at the top of the list: what it will be on, in
// muted lines (the Selected person, and while the Scan viewer is open, the
// Image it shows); then its text. Save writes it, and it and
// Cancel stop the draft.
@customElement('sl-reminder-add')
class ReminderAddElement extends LitElement {
  static override styles = [focusRingStyles, reminderStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) places!: ReminderPlaces;

  @state() private text = '';

  override firstUpdated() {
    this.renderRoot.querySelector('textarea')?.focus();
  }

  private readonly stop = () => {
    this.state.reminders.draft(null);
  };

  private async save() {
    if (this.text.trim() === '') return;
    const on = targetOf(this.places);
    const saved = await this.asking.run(() =>
      this.state.reminders.remind(this.text, on)
    );
    if (saved) this.stop();
  }

  private renderPlaces() {
    const { person, image } = this.places;
    return html`<div class="lines">
      ${person === null ? nothing : html`<div>${person.header}</div>`}
      ${image === null ? nothing : html`<div>${image.header}</div>`}
    </div>`;
  }

  override render() {
    return html`
      ${this.renderPlaces()}
      <textarea
        aria-label="New reminder"
        placeholder="What to come back to…"
        .value=${this.text}
        @keydown=${keepTyping}
        @input=${(e: Event) => {
          this.text = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="buttons end">
        <button ?disabled=${this.asking.busy} @click=${this.stop}>
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.asking.busy || this.text.trim() === ''}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.asking.busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      ${this.asking.refused === null ? nothing : html`<p class="error">${this.asking.refused}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-add': ReminderAddElement;
  }
}
