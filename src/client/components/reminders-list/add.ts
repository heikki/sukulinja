import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { typing } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ReminderPlaces } from '@/client/state/reminders';

import { reminderStyles } from './styles';

// Writing a new Reminder, at the top of the list: what it will be on, in
// muted lines, the person's line ticked to put it on their Citation, or not
// to put it on the Image; then its text. Save or ⌘Enter writes it, and it
// and Cancel stop the draft.
@customElement('sl-reminder-add')
class ReminderAddElement extends LitElement {
  static override styles = [focusRingStyles, reminderStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) places!: ReminderPlaces;

  @state() private text = '';
  @state() private withPerson = true;
  @state() private saving = false;
  @state() private error: string | null = null;

  override firstUpdated() {
    this.renderRoot.querySelector('textarea')?.focus();
  }

  private get target() {
    const { cited, base } = this.places;
    return this.withPerson && cited !== null ? cited.target : base.target;
  }

  private readonly stop = () => {
    this.state.reminders.draft(null);
  };

  private async save() {
    if (this.saving || this.text.trim() === '') return;
    this.saving = true;
    this.error = null;
    try {
      await this.state.reminders.remind(this.text, this.target);
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

  private renderPlace() {
    const { cited, base } = this.places;
    if (cited === null) {
      return html`<div class="lines">
        ${base.header.map((line) => html`<div>${line}</div>`)}
      </div>`;
    }
    const [who, ...where] = cited.header;
    const lines = this.withPerson ? where : base.header;
    return html`<div class="lines">
      <label class="who">
        <input
          type="checkbox"
          .checked=${this.withPerson}
          @change=${(e: Event) => {
            this.withPerson = (e.target as HTMLInputElement).checked;
          }}
        />${who}
      </label>
      ${lines.map((line) => html`<div>${line}</div>`)}
    </div>`;
  }

  override render() {
    return html`
      ${this.renderPlace()}
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
