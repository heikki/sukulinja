import { html, nothing } from 'lit';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { placeOf, targetOf } from './helpers';
import type { ReminderDialogAction } from './index';

import './index';

// A Reminder in the Reminder dialog, as clicking it in a list asks: what
// it's on, its text to change, and Done or Reopen and Delete, after `go`
// when the list has somewhere to take it. Done keeps a change to the text
// too. Rendered where `render` is put.
export class ReminderModal implements ReactiveController {
  private shown: {
    reminder: Reminder;
    go: ReminderDialogAction | null;
  } | null = null;

  // `state` is asked for only once the host has it.
  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly state: () => AppState
  ) {
    host.addController(this);
  }

  // Gone with its host, it's closed.
  hostDisconnected() {
    this.shown = null;
  }

  get isOpen() {
    return this.shown !== null;
  }

  readonly open = (
    reminder: Reminder,
    go: ReminderDialogAction | null = null
  ) => {
    this.shown = { reminder, go };
    this.host.requestUpdate();
  };

  private readonly close = () => {
    this.shown = null;
    this.host.requestUpdate();
  };

  render() {
    if (this.shown === null) return nothing;
    const { reminder, go } = this.shown;
    const { chart, reminders } = this.state();
    const label = placeOf(reminder.on, chart.people.get().persons);
    const done = reminder.done === null;
    const actions: ReminderDialogAction[] = [
      ...(go === null ? [] : [go]),
      {
        label: done ? 'Done' : 'Reopen',
        run: async (text) => {
          const edited = text === reminder.text ? {} : { text };
          await reminders.change(reminder.id, { done, ...edited });
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
      .choices=${[{ label, target: targetOf(reminder.on) }]}
      .chosen=${0}
      .text=${reminder.text}
      .save=${async (text: string) => {
        await reminders.change(reminder.id, { text });
      }}
      .actions=${actions}
      @close=${this.close}
    ></sl-reminder-dialog>`;
  }
}
