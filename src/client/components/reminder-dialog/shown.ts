import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { headerOf } from './header';
import { placeOf, targetOf } from './helpers';
import type { ReminderDialogAction } from './index';

import './index';

// The Reminder open in its dialog (`reminders.shown`), wherever it was
// clicked: read-only, headed by what it's on, its text, with Edit, Done
// or Reopen, and Delete. Each Reminder gets a dialog of its own.
@customElement('sl-reminder-shown')
export class ReminderShownElement extends SignalWatcher(LitElement) {
  @consume({ context: appState }) private readonly state!: AppState;

  private renderDialog(reminder: Reminder) {
    const { chart, reminders } = this.state;
    const label = placeOf(reminder.on, chart.people.get().persons);
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
      .choices=${[{ label, target: targetOf(reminder.on) }]}
      .chosen=${0}
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
