import { html, nothing } from 'lit';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import { ApiError } from '@/client/dataset-api';
import type { Point } from '@/client/pan-zoom';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import type { MenuItem } from '../context-menu';
import { placeOf, targetOf } from './helpers';
import type { ReminderDialogProps } from './index';

import '../context-menu';
import './index';

// Why the last change to a Reminder failed.
export interface ReminderError {
  id: number;
  message: string;
}

// What can be done to a Reminder a list shows: its menu, with Done or
// Reopen, Edit… and Delete, and the dialog editing it. The menu is
// rendered where `render` is put, and placed in the box `box` gives: the
// element it's positioned in. It closes when the host scrolls.
export class ReminderActions implements ReactiveController {
  // A Reminder whose menu is open, at a point in that box.
  private menu: { reminder: Reminder; at: Point } | null = null;
  private dialog: ReminderDialogProps | null = null;
  // Why the last change to one failed, to say under it.
  private failed: ReminderError | null = null;

  // `state` is asked for only once the host has it.
  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly state: () => AppState,
    private readonly box: () => DOMRect | undefined
  ) {
    host.addController(this);
  }

  get error() {
    return this.failed;
  }

  hostConnected() {
    this.host.addEventListener('scroll', this.onScroll);
  }

  hostDisconnected() {
    this.host.removeEventListener('scroll', this.onScroll);
  }

  private readonly onScroll = () => {
    this.closeMenu();
  };

  readonly closeMenu = () => {
    if (this.menu === null) return;
    this.menu = null;
    this.host.requestUpdate();
  };

  // Opens a Reminder's menu at the pointer, or under it from the keyboard.
  readonly open = (e: MouseEvent, reminder: Reminder) => {
    e.preventDefault();
    e.stopPropagation();
    const box = this.box();
    if (box === undefined) return;
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const keyed = e.type === 'click' && e.detail === 0;
    const x = keyed ? row.left : e.clientX;
    const y = keyed ? row.bottom : e.clientY;
    this.failed = null;
    this.menu = { reminder, at: { x: x - box.left, y: y - box.top } };
    this.host.requestUpdate();
  };

  // Runs a change to a Reminder, saying under it if it fails.
  private changing(reminder: Reminder, run: () => Promise<void>) {
    this.failed = null;
    run().catch((err: unknown) => {
      if (!(err instanceof ApiError)) throw err;
      this.failed = { id: reminder.id, message: err.message };
      this.host.requestUpdate();
    });
  }

  private edit(reminder: Reminder) {
    const state = this.state();
    const label = placeOf(reminder.on, state.chart.people.get().persons);
    this.dialog = {
      heading: 'Edit reminder',
      choices: [{ label, target: targetOf(reminder.on) }],
      chosen: 0,
      text: reminder.text,
      save: async (text) => {
        await state.reminders.change(reminder.id, { text });
      }
    };
    this.host.requestUpdate();
  }

  private items(reminder: Reminder) {
    const { reminders } = this.state();
    const open = reminder.done === null;
    const items: MenuItem[] = [
      {
        label: open ? 'Done' : 'Reopen',
        run: () => {
          this.changing(reminder, async () => {
            await reminders.change(reminder.id, { done: open });
          });
        }
      },
      {
        label: 'Edit…',
        run: () => {
          this.edit(reminder);
        }
      },
      {
        label: 'Delete',
        run: () => {
          this.changing(reminder, async () => {
            await reminders.remove(reminder.id);
          });
        }
      }
    ];
    return items;
  }

  private renderMenu() {
    if (this.menu === null) return nothing;
    const { reminder, at } = this.menu;
    return html`<sl-context-menu
      .items=${this.items(reminder)}
      .at=${at}
      @close=${this.closeMenu}
    ></sl-context-menu>`;
  }

  private renderDialog() {
    if (this.dialog === null) return nothing;
    const { heading, choices, chosen, text, save } = this.dialog;
    return html`<sl-reminder-dialog
      .heading=${heading}
      .choices=${choices}
      .chosen=${chosen}
      .text=${text}
      .save=${save}
      @close=${() => {
        this.dialog = null;
        this.host.requestUpdate();
      }}
    ></sl-reminder-dialog>`;
  }

  // The open menu and the dialog.
  render() {
    return html`${this.renderMenu()} ${this.renderDialog()}`;
  }
}
