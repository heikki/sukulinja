import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { typing } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';
import { isStale } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { onLines, renderLines } from './lines';
import { reminderStyles } from './styles';

// A Reminder in the list: its text, then what it's on, each line going
// there; under it Edit, Done or Reopen, and Delete. Edit turns the text into
// a field, saved with Save or ⌘Enter. One refused says why.
@customElement('sl-reminder-row')
class ReminderRowElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, reminderStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) reminder!: Reminder;

  @state() private typed: string | null = null;
  @state() private busy = false;
  @state() private error: string | null = null;

  private get reminders() {
    return this.state.reminders;
  }

  // Runs `run`, one at a time, saying why if it's refused.
  private async running(run: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await run();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.busy = false;
    }
  }

  private async save() {
    const text = this.typed;
    if (text === null || text.trim() === '') return;
    await this.running(async () => {
      await this.reminders.change(this.reminder.id, { text });
      this.typed = null;
    });
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
        @keydown=${this.onKeyDown}
        @input=${(e: Event) => {
          this.typed = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="buttons end">
        <button
          ?disabled=${this.busy}
          @click=${() => {
            this.typed = null;
            this.error = null;
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.busy || text.trim() === ''}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.busy ? 'Saving…' : 'Save'}
        </button>
      </div>`;
  }

  private renderButtons() {
    const { id, done } = this.reminder;
    return html`<div class="buttons">
      <button
        ?disabled=${this.busy}
        @click=${() => {
          this.focusField = true;
          this.typed = this.reminder.text;
        }}
      >
        Edit
      </button>
      <button
        ?disabled=${this.busy}
        @click=${() => {
          void this.running(async () => {
            await this.reminders.change(id, { done: done === null });
          });
        }}
      >
        ${done === null ? 'Done' : 'Reopen'}
      </button>
      <button
        ?disabled=${this.busy}
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
      ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-row': ReminderRowElement;
  }
}
