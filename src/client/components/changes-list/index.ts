import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { dialogStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Change, ChangeOn } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { byDay, doneLabel, leadsTo, timeLabel, whereLabel } from './helpers';

export type ChangePickEvent = CustomEvent<ChangeOn>;

// Every Change made to the dataset, newest first, by day: when, what was
// done, and whom and where. Clicking one that leads somewhere picks where
// (`pick`); one on nothing is shown but can't be picked. Clear forgets them
// all, once asked. A tab of the corner panel.
@customElement('sl-changes-list')
class ChangesListElement extends SignalWatcher(LitElement) {
  static override styles = [
    cornerListStyles,
    dialogStyles,
    css`
      h3 {
        margin: 0.5rem 0 0.15rem;
        color: var(--muted);
        font-size: 0.8rem;
        font-weight: 500;
      }

      h3:first-child {
        margin-top: 0;
      }

      ul.day {
        flex: none;
        overflow: visible;
        margin-bottom: 0.25rem;
      }

      /* Scrolls between the heading and the panel's foot, its rows reaching
         out to the panel's edges as a list's do. */
      .days {
        flex: 1;
        min-height: 0;
        overflow: hidden auto;
        margin: 0 -0.75rem 0.75rem;
        padding: 0 0.75rem;
      }

      .dialog p.refused {
        color: var(--danger);
      }

      .time {
        color: var(--muted);
        font-variant-numeric: tabular-nums;
        margin-right: 0.5rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // Asking before clearing: open, clearing, or refused in the app's words.
  @state() private asking: null | 'open' | 'clearing' | { refused: string } =
    null;

  override connectedCallback() {
    super.connectedCallback();
    this.state.changes.load();
  }

  private renderRow(change: Change) {
    const persons = this.state.chart.people.get().persons;
    const to = leadsTo(change);
    return html`<li>
      <button
        class="row"
        ?disabled=${to === null}
        @click=${() => {
          if (to === null) return;
          this.dispatchEvent(new CustomEvent('pick', { detail: to }));
        }}
      >
        <span class="text"
          ><span class="time">${timeLabel(change.at)}</span>${doneLabel(
            change.what
          )}</span
        >
        <span class="on">${whereLabel(change, persons)}</span>
      </button>
    </li>`;
  }

  private renderBody() {
    const all = this.state.changes.all.get();
    if (all === null) return html`<p class="muted">Loading…</p>`;
    if (all === 'failed') {
      return html`<p class="muted">Couldn't load the Changes.</p>`;
    }
    if (all.length === 0) {
      return html`<p class="muted">Nothing done here yet.</p>`;
    }
    return html`<div class="days">
      ${byDay(all).map(
        (d) =>
          html`<h3>${d.day}</h3>
            <ul class="day">
              ${d.changes.map((c) => this.renderRow(c))}
            </ul>`
      )}
    </div>`;
  }

  private async clear() {
    this.asking = 'clearing';
    try {
      await this.state.changes.clear();
      this.asking = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.asking = { refused: err.message };
    }
  }

  private renderClear() {
    const all = this.state.changes.all.get();
    if (!Array.isArray(all) || all.length === 0) return nothing;
    return html`<div class="actions">
      <button
        class="toggle"
        @click=${() => {
          this.asking = 'open';
        }}
      >
        Clear…
      </button>
    </div>`;
  }

  private renderDialog() {
    const asking = this.asking;
    if (asking === null) return nothing;
    const count = this.state.changes.all.get()?.length ?? 0;
    const clearing = asking === 'clearing';
    const close = () => {
      if (!clearing) this.asking = null;
    };
    return html`<div class="overlay" @click=${close}>
      <div
        class="dialog"
        role="alertdialog"
        aria-labelledby="clear-title"
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2 id="clear-title">Clear the Changes?</h2>
        <p>
          ${count === 1 ? 'The one Change' : `All ${count} Changes`} will be
          removed from the list. What they did stays done.
        </p>
        ${
          typeof asking === 'object'
            ? html`<p class="refused">${asking.refused}</p>`
            : nothing
        }
        <div class="actions">
          <button @click=${close} ?disabled=${clearing}>Cancel</button>
          <button
            class="danger"
            @click=${() => {
              void this.clear();
            }}
            ?disabled=${clearing}
          >
            ${clearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>
    </div>`;
  }

  override render() {
    return html`${this.renderBody()} ${this.renderClear()}
    ${this.renderDialog()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-changes-list': ChangesListElement;
  }
}
