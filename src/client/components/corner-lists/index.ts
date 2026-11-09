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
import { CornerPopover } from '../corner-panel/popover';
import { openCount } from '../reminders-list/helpers';
import { listsLabel, TABS } from './helpers';
import type { CornerList } from './helpers';
import { LISTS_ICON } from './icons';

import '../changes-list';
import '../church-books';
import '../corner-panel/button';
import '../corner-panel/panel';
import '../reminders-list';

// Beside Settings: one button opening a popover of the Reminders, the
// Changes and the Church books, a tab each, as Settings opens its own; only
// one popover is open at a time. It opens on the tab last shown, and a
// Reminder being drafted, as from the Scan viewer's menu, opens it on the
// Reminders. Only the open tab's list is drawn. A line of a Reminder goes
// where it says, the popover staying open to finish with it; picking a
// Change goes where it was done. Either asks for the dock (`dock-open`) for
// a person or a Citation. Picking a Volume opens it in the Scan viewer on
// its first Image.
@customElement('sl-corner-lists')
class CornerListsElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      position: relative;
      display: inline-flex;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private tab: CornerList = 'reminders';

  // Whether a Reminder was being drafted at the last update, so one just
  // started opens the Reminders.
  private drafted = false;

  // Closed by another popover opening, a press outside or Esc.
  private readonly corner = new CornerPopover(this);

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

  private readonly onTab = (e: TabPickEvent) => {
    const tab = TABS.find((t) => t.id === e.detail);
    if (tab !== undefined) this.tab = tab.id;
  };

  private goTo(on: On) {
    void goTo(this.state, on);
    if (on.kind !== 'image') this.dispatchEvent(new CustomEvent('dock-open'));
  }

  private readonly onReminderGo = (e: CustomEvent<On>) => {
    this.goTo(e.detail);
  };

  private readonly onChange = (e: ChangePickEvent) => {
    this.corner.set(false);
    this.goTo(e.detail);
  };

  private readonly onVolume = (e: VolumeOpenEvent) => {
    const { volumeId, label, archive } = e.detail;
    this.corner.set(false);
    this.state.viewer.openImage({ volumeId, volume: label, image: 1, archive });
  };

  override willUpdate() {
    const drafting = this.state.reminders.drafting.get() !== null;
    if (drafting && !this.drafted) {
      this.corner.set(true);
      this.tab = 'reminders';
    }
    this.drafted = drafting;
  }

  private renderList() {
    switch (this.tab) {
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
    }
  }

  override render() {
    const count = openCount(this.state.reminders.all.get()) ?? 0;
    return html`
      <sl-corner-button
        label=${listsLabel(count)}
        ?expanded=${this.corner.open}
        @click=${() => {
          this.corner.set(!this.corner.open);
        }}
      >
        ${LISTS_ICON}
      </sl-corner-button>
      ${
        this.corner.open
          ? html`<sl-corner-panel
              .tabs=${TABS}
              active=${this.tab}
              @tab=${this.onTab}
            >
              ${this.renderList()}
            </sl-corner-panel>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-lists': CornerListsElement;
  }
}
