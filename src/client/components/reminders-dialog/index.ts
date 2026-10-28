import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Floating } from '@/client/floating';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { isStale, listed, onLabel } from './helpers';
import { remindersDialogStyles } from './styles';

export type ReminderPickEvent = CustomEvent<Reminder>;

function stop(e: Event) {
  e.stopPropagation();
}

// Every open Reminder in the dataset, newest first, each with what it's
// on; one on an Image from an earlier filming is flagged so. Clicking one
// picks it (`pick`). Show done adds the done ones, dimmed. A panel
// floating over the chart, dragged by its background: ✕ in its corner or
// Esc asks to `close`, and presses on it stay here.
@customElement('sl-reminders-dialog')
export class RemindersDialogElement extends SignalWatcher(LitElement) {
  static override styles = remindersDialogStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private showDone = false;

  private readonly floating = new Floating(this, 'reminders');

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
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

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  // Esc is its own; other keys go on, so what's under it still has them.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  private renderRow(reminder: Reminder) {
    const persons = this.state.chart.people.get().persons;
    const done = reminder.done !== null;
    return html`<li>
      <button
        class="row ${done ? 'done' : ''}"
        aria-haspopup="dialog"
        @click=${() => {
          this.dispatchEvent(new CustomEvent('pick', { detail: reminder }));
        }}
      >
        <span class="text">${reminder.text}</span>
        <span class="on"
          >${onLabel(reminder, persons)}${
            isStale(reminder)
              ? html`<span class="chip">From an earlier filming</span>`
              : nothing
          }</span
        >
      </button>
    </li>`;
  }

  private renderList(all: Reminder[]) {
    const rows = listed(all, this.showDone);
    if (rows.length === 0) {
      const none = this.showDone ? 'No Reminders.' : 'No open Reminders.';
      return html`<p class="muted">${none}</p>`;
    }
    return html`<ul>
      ${rows.map((r) => this.renderRow(r))}
    </ul>`;
  }

  private renderBody() {
    const all = this.state.reminders.all.get();
    if (all === null) return html`<p class="muted">Loading…</p>`;
    if (all === 'failed') {
      return html`<p class="muted">Couldn't load the Reminders.</p>`;
    }
    return this.renderList(all);
  }

  private renderShowDone() {
    const all = this.state.reminders.all.get();
    const done = Array.isArray(all)
      ? all.filter((r) => r.done !== null).length
      : 0;
    if (done === 0) return nothing;
    return html`<div class="actions">
      <button
        class="show-done"
        aria-pressed=${this.showDone ? 'true' : 'false'}
        @click=${() => {
          this.showDone = !this.showDone;
        }}
      >
        ${this.showDone ? 'Hide done' : `Show done (${done})`}
      </button>
    </div>`;
  }

  override render() {
    return html`
      <div
        class="dialog"
        popover="manual"
        role="dialog"
        aria-label="Reminders"
        @pointerdown=${this.floating.grip}
      >
        <div class="top">
          <h2>Reminders</h2>
          <button class="close" aria-label="Close" @click=${this.close}>
            ✕
          </button>
        </div>
        ${this.renderBody()} ${this.renderShowDone()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminders-dialog': RemindersDialogElement;
  }
}
