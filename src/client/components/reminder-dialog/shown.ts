import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { follow, mayOpen, shows } from '../reminders-dialog/helpers';
import { headerOf } from './header';
import type { HeaderGo, ReminderDialogAction } from './index';

import './index';

// The Reminder open in its dialog (`reminders.shown`), wherever it was
// clicked: read-only, headed by what it's on, its text, with Edit, Done
// or Reopen, and Delete. Each Reminder gets a dialog of its own. Clicking
// the person's name in its header selects them again, or closes the dock
// (`dock-close`) on them; the line below it opens the source or Image in
// the Scan viewer, or closes it there. Showing a person asks for the dock
// (`dock-open`).
@customElement('sl-reminder-shown')
class ReminderShownElement extends SignalWatcher(LitElement) {
  @consume({ context: appState }) private readonly state!: AppState;

  // The dock's open, for the person's name to close it.
  @property({ attribute: false }) docked = false;

  // What each header line toggles: the person's name, them selected with
  // the dock open; the line below, the Scan viewer at where it's on, as
  // picking it in the list goes there. A stale Image's, or a source with
  // no scan to open, nothing.
  private goes(reminder: Reminder) {
    const { state } = this;
    const { on } = reminder;
    const dock = (open: boolean) => {
      this.dispatchEvent(new CustomEvent(open ? 'dock-open' : 'dock-close'));
    };
    const there: HeaderGo = {
      open: shows(state, reminder),
      toggle: () => {
        if (shows(state, reminder)) {
          state.viewer.close();
          return;
        }
        void follow(state, reminder);
        if (on.kind !== 'image') dock(true);
      }
    };
    if (on.kind === 'image') return [on.stale ? null : there];
    const shown = () => this.docked && state.selected.id.get() === on.personId;
    const person: HeaderGo = {
      open: shown(),
      toggle: () => {
        if (shown()) {
          dock(false);
          return;
        }
        state.chart.select(on.personId);
        dock(true);
      }
    };
    if (on.kind === 'person') return [person];
    return [person, mayOpen(state, on.citationId) ? there : null];
  }

  private renderDialog(reminder: Reminder) {
    const { reminders } = this.state;
    const open = reminder.done === null;
    const actions: ReminderDialogAction[] = [
      {
        label: open ? 'Done' : 'Reopen',
        run: async () => {
          await reminders.change(reminder.id, { done: open });
        }
      },
      {
        label: 'Delete',
        run: async () => {
          await reminders.remove(reminder.id);
        }
      }
    ];
    return html`<sl-reminder-dialog
      heading="Reminder"
      .header=${headerOf(this.state, reminder)}
      .goes=${this.goes(reminder)}
      .text=${reminder.text}
      .viewing=${true}
      .save=${async (text: string) => {
        await reminders.change(reminder.id, { text });
      }}
      .actions=${actions}
      @close=${() => {
        reminders.show(null);
      }}
    ></sl-reminder-dialog>`;
  }

  override render() {
    const reminder = this.state.reminders.shown.get();
    if (reminder === null) return nothing;
    return keyed(reminder.id, this.renderDialog(reminder));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-shown': ReminderShownElement;
  }
}
