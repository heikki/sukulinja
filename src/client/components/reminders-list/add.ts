import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { targetOf } from '@/client/state/reminders';
import type { ReminderPlaces } from '@/client/state/reminders';
import { typing } from '@/client/typing';

import { reminderStyles } from './styles';

// Writing a new Reminder, at the top of the list: what it will be on, in
// muted lines (the Selected person, and while the Scan viewer is open, the
// Image it shows); then its text. Save or ⌘Enter writes it, and it and
// Cancel stop the draft.
@customElement('sl-reminder-add')
class ReminderAddElement extends LitElement {
  static override styles = [focusRingStyles, reminderStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) places!: ReminderPlaces;

  @state() private text = '';
  @state() private saving = false;
  @state() private error: string | null = null;

  override firstUpdated() {
    this.renderRoot.querySelector('textarea')?.focus();
  }

  private readonly stop = () => {
    this.state.reminders.draft(null);
  };

  private async save() {
    if (this.saving || this.text.trim() === '') return;
    this.saving = true;
    this.error = null;
    try {
      await this.state.reminders.remind(this.text, targetOf(this.places));
      this.stop();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.saving = false;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.save();
    } else if (typing(e)) {
      e.stopPropagation();
    }
  };

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
        @keydown=${this.onKeyDown}
        @input=${(e: Event) => {
          this.text = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="buttons end">
        <button ?disabled=${this.saving} @click=${this.stop}>Cancel</button>
        <button
          class="primary"
          ?disabled=${this.saving || this.text.trim() === ''}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-add': ReminderAddElement;
  }
}
