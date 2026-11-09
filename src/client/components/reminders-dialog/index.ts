import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { isStale, onLabel } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { listed } from './helpers';

import '../corner-panel/panel';

export type ReminderPickEvent = CustomEvent<Reminder>;

// Every open Reminder in the dataset, newest first, each with what it's
// on; one on an Image from an earlier filming is flagged so. Clicking one
// picks it (`pick`). Show done adds the done ones, dimmed. In a corner
// panel over the chart, which asks to `close`.
@customElement('sl-reminders-dialog')
class RemindersDialogElement extends SignalWatcher(LitElement) {
  static override styles = cornerListStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private showDone = false;

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

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
          >${onLabel(reminder.on, persons)}${
            isStale(reminder.on)
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
    return html`<button
      slot="actions"
      class="toggle"
      aria-pressed=${this.showDone ? 'true' : 'false'}
      @click=${() => {
        this.showDone = !this.showDone;
      }}
    >
      ${this.showDone ? 'Hide done' : `Show done (${done})`}
    </button>`;
  }

  override render() {
    return html`<sl-corner-panel
      heading="Reminders"
      kind="reminders"
      @close=${() => {
        this.dispatchEvent(new CustomEvent('close'));
      }}
    >
      ${this.renderBody()} ${this.renderShowDone()}
    </sl-corner-panel>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminders-dialog': RemindersDialogElement;
  }
}
