import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { goTo } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { On } from '@/common/types';

import type { ChangePickEvent } from '../changes-list';
import type { VolumeOpenEvent } from '../church-books';
import type { TabPickEvent } from '../corner-panel/panel';
import { openCount } from '../reminders-list/helpers';
import { pressed, remindersLabel, TABS } from './helpers';
import type { CornerList } from './helpers';
import { BOOK_ICON, CLOCK_ICON, FLAG_ICON } from './icons';

import '../changes-list';
import '../church-books';
import '../corner-panel/button';
import '../corner-panel/panel';
import '../reminders-list';

// Beside Settings: a button each for the Reminders, the Changes and the
// Church books, all opening one corner panel on their own tab, or closing
// it; a Reminder being drafted, as from the Scan viewer's menu, opens the
// Reminders. Only the open tab's list is drawn. A line of a Reminder goes
// where it says, the list staying open to finish with it; picking a Change
// goes where it was done. Either asks for the dock (`dock-open`) for a
// person or a Citation. Picking a Volume opens it in the Scan viewer on its
// first Image.
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

  // Whether a Reminder was being drafted at the last update, so one just
  // started opens the Reminders.
  private drafted = false;

  private readonly close = () => {
    this.open = null;
  };

  private readonly onTab = (e: TabPickEvent) => {
    this.open = e.detail as CornerList;
  };

  private goTo(on: On) {
    void goTo(this.state, on);
    if (on.kind !== 'image') this.dispatchEvent(new CustomEvent('dock-open'));
  }

  private readonly onReminderGo = (e: CustomEvent<On>) => {
    this.goTo(e.detail);
  };

  private readonly onChange = (e: ChangePickEvent) => {
    this.open = null;
    this.goTo(e.detail);
  };

  private readonly onVolume = (e: VolumeOpenEvent) => {
    const { volumeId, label } = e.detail;
    this.open = null;
    this.state.viewer.openImage({ volumeId, volume: label, image: 1 });
  };

  override willUpdate() {
    const drafting = this.state.reminders.drafting.get() !== null;
    if (drafting && !this.drafted) this.open = 'reminders';
    this.drafted = drafting;
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
          @go=${this.onReminderGo}
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
      ${this.renderButton('reminders', remindersLabel(count), FLAG_ICON)}
      ${this.renderButton('changes', 'Changes', CLOCK_ICON)}
      ${this.renderButton('church-books', 'Church books', BOOK_ICON)}
      ${
        this.open === null
          ? nothing
          : html`<sl-corner-panel
              .tabs=${TABS}
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
