import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { goTo } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import type { ChangePickEvent } from '../changes-list';
import type { VolumeOpenEvent } from '../church-books';
import type { TabPickEvent } from '../corner-panel/panel';
import type { ReminderPickEvent } from '../reminders-list';
import { openCount } from '../reminders-list/helpers';
import { pressed, remindersLabel, tabsOf } from './helpers';
import type { CornerList } from './helpers';
import { BOOK_ICON, CLOCK_ICON, FLAG_ICON } from './icons';

import '../changes-list';
import '../church-books';
import '../corner-panel/button';
import '../corner-panel/panel';
import '../reminders-list';

// Beside Settings: a button each for the Reminders (once there are any),
// the Changes and the Church books, all opening one corner panel on their
// own tab, or closing it. Only the open tab's list is drawn. Picking a
// Reminder or a Change goes to it, asking for the dock (`dock-open`) when
// it's a person's or a Citation's; picking a Volume opens it in the Scan
// viewer on its first Image.
@customElement('sl-corner-lists')
class CornerListsElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private open: CornerList | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

  private hasReminders() {
    const all = this.state.reminders.all.get();
    return Array.isArray(all) && all.length > 0;
  }

  private readonly close = () => {
    this.open = null;
  };

  private readonly onTab = (e: TabPickEvent) => {
    this.open = e.detail as CornerList;
  };

  private readonly onReminder = (e: ReminderPickEvent) => {
    const reminder = e.detail;
    this.open = null;
    void goTo(this.state, reminder.on);
    this.state.reminders.show(reminder.id);
    if (reminder.on.kind !== 'image') {
      this.dispatchEvent(new CustomEvent('dock-open'));
    }
  };

  private readonly onChange = (e: ChangePickEvent) => {
    const on = e.detail;
    this.open = null;
    void goTo(this.state, on);
    if (on.kind !== 'image') this.dispatchEvent(new CustomEvent('dock-open'));
  };

  private readonly onVolume = (e: VolumeOpenEvent) => {
    const { volumeId, label } = e.detail;
    this.open = null;
    this.state.viewer.openImage({ volumeId, volume: label, image: 1 });
  };

  // The Reminders tab goes once the last Reminder does.
  override willUpdate() {
    if (this.open === 'reminders' && !this.hasReminders()) this.open = null;
  }

  private renderButton(list: CornerList, label: string, icon: unknown) {
    return html`<sl-corner-button
      label=${label}
      ?expanded=${this.open === list}
      @click=${() => {
        this.open = pressed(this.open, list);
      }}
    >
      ${icon}
    </sl-corner-button>`;
  }

  private renderList() {
    switch (this.open) {
      case 'reminders':
        return html`<sl-reminders-list
          @pick=${this.onReminder}
        ></sl-reminders-list>`;
      case 'changes':
        return html`<sl-changes-list @pick=${this.onChange}></sl-changes-list>`;
      case 'church-books':
        return html`<sl-church-books-list
          @open-volume=${this.onVolume}
        ></sl-church-books-list>`;
      case null:
        return nothing;
    }
  }

  override render() {
    const count = openCount(this.state.reminders.all.get()) ?? 0;
    return html`
      ${
        this.hasReminders()
          ? this.renderButton('reminders', remindersLabel(count), FLAG_ICON)
          : nothing
      }
      ${this.renderButton('changes', 'Changes', CLOCK_ICON)}
      ${this.renderButton('church-books', 'Church books', BOOK_ICON)}
      ${
        this.open === null
          ? nothing
          : html`<sl-corner-panel
              .tabs=${tabsOf(this.hasReminders())}
              active=${this.open}
              @tab=${this.onTab}
              @close=${this.close}
            >
              ${this.renderList()}
            </sl-corner-panel>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-lists': CornerListsElement;
  }
}
