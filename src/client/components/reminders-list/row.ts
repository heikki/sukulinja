import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { focusRingStyles } from '@/client/focus-ring';
import { isStale } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { keepTyping } from '@/client/typing';
import type { Reminder } from '@/common/types';

import { onLines, renderLines } from './lines';
import { reminderStyles } from './styles';

// A Reminder in the list: its text, then what it's on, each line going
// there; under it Edit, Done or Reopen, and Delete. Edit turns the text into
// a field, saved with Save. One refused says why.
@customElement('sl-reminder-row')
class ReminderRowElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, reminderStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) reminder!: Reminder;

  @state() private typed: string | null = null;

  private get reminders() {
    return this.state.reminders;
  }

  // Runs `run`, one at a time, saying why if it's refused.
  private async running(run: () => Promise<void>) {
    await this.asking.run(run);
  }

  private async save() {
    const text = this.typed;
    if (text === null || text.trim() === '') return;
    await this.running(async () => {
      await this.reminders.change(this.reminder.id, { text });
      this.typed = null;
    });
  }

  // Set on Edit, so the field takes focus once it's drawn.
  private focusField = false;

  override updated() {
    if (!this.focusField) return;
    this.focusField = false;
    this.renderRoot.querySelector('textarea')?.focus();
  }

  private renderEditing(text: string) {
    return html`<textarea
        aria-label="Reminder"
        .value=${text}
        @keydown=${keepTyping}
        @input=${(e: Event) => {
          this.typed = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="buttons end">
        <button
          ?disabled=${this.asking.busy}
          @click=${() => {
            this.typed = null;
            this.asking.forget();
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.asking.busy || text.trim() === ''}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.asking.busy ? 'Saving…' : 'Save'}
        </button>
      </div>`;
  }

  private renderButtons() {
    const { id, done } = this.reminder;
    return html`<div class="buttons">
      <button
        ?disabled=${this.asking.busy}
        @click=${() => {
          this.focusField = true;
          this.typed = this.reminder.text;
        }}
      >
        Edit
      </button>
      <button
        ?disabled=${this.asking.busy}
        @click=${() => {
          void this.running(async () => {
            await this.reminders.change(id, { done: done === null });
          });
        }}
      >
        ${done === null ? 'Done' : 'Reopen'}
      </button>
      <button
        ?disabled=${this.asking.busy}
        @click=${() => {
          void this.running(async () => {
            await this.reminders.remove(id);
          });
        }}
      >
        Delete
      </button>
    </div>`;
  }

  override render() {
    const { reminder } = this;
    const lines = renderLines(
      onLines(this.state, reminder),
      isStale(reminder.on)
    );
    return html`
      ${
        this.typed === null
          ? html`<p class="text">${reminder.text}</p>`
          : nothing
      }
      ${lines}
      ${this.typed === null ? this.renderButtons() : this.renderEditing(this.typed)}
      ${this.asking.refused === null ? nothing : html`<p class="error">${this.asking.refused}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-row': ReminderRowElement;
  }
}
