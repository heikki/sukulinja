import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Reminder } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { listed } from './helpers';

import './add';
import './row';

// The only place Reminders are: every open one, newest first, each with
// what it's on, a line going to each (`go`, from its row); Show done adds
// the done ones, dimmed. Each is edited, done or deleted in its row. A new
// one, started from a card's menu or the Scan viewer's, is written at the
// top. A tab of the corner panel; leaving it drops
// the draft.
@customElement('sl-reminders-list')
class RemindersListElement extends SignalWatcher(LitElement) {
  static override styles = [
    cornerListStyles,
    css`
      li {
        padding: 0.45rem 0.75rem;
        border-radius: 6px;
      }

      li.done {
        opacity: 0.55;
      }

      sl-reminder-add {
        flex: none;
        margin-bottom: 0.75rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private showDone = false;

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.state.reminders.draft(null);
  }

  private renderList(all: Reminder[]) {
    const rows = listed(all, this.showDone);
    if (rows.length === 0) {
      const none = this.showDone ? 'No Reminders.' : 'No open Reminders.';
      return html`<p class="muted">${none}</p>`;
    }
    return html`<ul>
      ${repeat(
        rows,
        (r) => r.id,
        (r) =>
          html`<li class=${r.done === null ? '' : 'done'}>
            <sl-reminder-row .reminder=${r}></sl-reminder-row>
          </li>`
      )}
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

  private renderDraft() {
    const places = this.state.reminders.drafting.get();
    if (places === null) return nothing;
    return html`<sl-reminder-add .places=${places}></sl-reminder-add>`;
  }

  private renderShowDone() {
    const all = this.state.reminders.all.get();
    const done = Array.isArray(all)
      ? all.filter((r) => r.done !== null).length
      : 0;
    if (done === 0) return nothing;
    return html`<button
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
    return html`${this.renderDraft()} ${this.renderBody()}
      <div class="actions">${this.renderShowDone()}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminders-list': RemindersListElement;
  }
}
