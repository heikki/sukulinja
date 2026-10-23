import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { ReminderActions } from '../reminder-dialog/actions';
import { listed, onLabel, pickable } from './helpers';
import { remindersDialogStyles } from './styles';

export { follow, openCount } from './helpers';

export type ReminderPickEvent = CustomEvent<Reminder>;

function stop(e: Event) {
  e.stopPropagation();
}

// Every open Reminder in the dataset, newest first, each with what it's
// on; one on an Image from an earlier filming is flagged so. Clicking one
// asks to go there (`pick`), unless it's that stale one; right-clicking
// opens its menu. Show done adds the done ones, dimmed. A modal <dialog>:
// Close, Esc or a press on the scrim asks to `close`, and keys and presses
// stay here.
@customElement('sl-reminders-dialog')
export class RemindersDialogElement extends SignalWatcher(LitElement) {
  static override styles = remindersDialogStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private showDone = false;

  private readonly actions = new ReminderActions(
    this,
    () => this.state,
    () => this.renderRoot.querySelector('.dialog')?.getBoundingClientRect()
  );

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
    for (const type of ['wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('mousedown', this.onMouseDown);
    this.addEventListener('keydown', this.onKeyDown);
  }

  // A press anywhere here but on the open menu, which keeps its own,
  // closes it, as one outside it would.
  private readonly onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    this.actions.closeMenu();
  };

  override firstUpdated() {
    this.renderRoot.querySelector('dialog')?.showModal();
  }

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key !== 'Escape') return;
    e.preventDefault();
    this.close();
  };

  private pick(reminder: Reminder) {
    if (!pickable(reminder)) return;
    this.dispatchEvent(new CustomEvent('pick', { detail: reminder }));
  }

  private renderRow(reminder: Reminder) {
    const persons = this.state.chart.people.get().persons;
    const stale = !pickable(reminder);
    const done = reminder.done !== null;
    const { error } = this.actions;
    return html`<li>
      <button
        class="row ${stale ? 'stale' : ''} ${done ? 'done' : ''}"
        @click=${() => {
          this.pick(reminder);
        }}
        @contextmenu=${(e: MouseEvent) => {
          this.actions.open(e, reminder);
        }}
      >
        <span class="text">${reminder.text}</span>
        <span class="on"
          >${onLabel(reminder, persons)}${
            stale
              ? html`<span class="chip">From an earlier filming</span>`
              : nothing
          }</span
        >
      </button>
      ${
        error?.id === reminder.id
          ? html`<p class="error">${error.message}</p>`
          : nothing
      }
    </li>`;
  }

  private renderList(all: Reminder[]) {
    const rows = listed(all, this.showDone);
    if (rows.length === 0) {
      const none = this.showDone ? 'No Reminders.' : 'No open Reminders.';
      return html`<p class="muted">${none}</p>`;
    }
    return html`<ul @scroll=${this.actions.closeMenu}>
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
      class="show-done"
      aria-pressed=${this.showDone ? 'true' : 'false'}
      @click=${() => {
        this.showDone = !this.showDone;
      }}
    >
      ${this.showDone ? 'Hide done' : `Show done (${done})`}
    </button>`;
  }

  override render() {
    return html`
      <dialog
        aria-label="Reminders"
        @click=${(e: Event) => {
          // On the scrim, outside the card.
          if (e.target === e.currentTarget) this.close();
        }}
        @cancel=${(e: Event) => {
          e.preventDefault();
        }}
      >
        <div class="dialog">
          <h2>Reminders</h2>
          ${this.renderBody()}
          <div class="actions">
            ${this.renderShowDone()}
            <button @click=${this.close}>Close</button>
          </div>
          ${this.actions.render()}
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminders-dialog': RemindersDialogElement;
  }
}
