import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { actionStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { renderLeaveAsk } from '../ask/leave';
import { controlStyles, editActionsStyles } from '../box-stage/styles';
import { alsoCiting } from './also';
import { scanEditStyles } from './edit-styles';

function stop(e: Event) {
  e.stopPropagation();
}

// At the foot of the pane beside the scan while a Box is pending, a new or
// edited Entry's (entry-form.ts) or the source's own (box-pane.ts): Cancel
// and Save. A way out of the source waiting on the Box asks first, in a
// modal, whether to discard it. Pointer and wheel input stays here, so a
// press doesn't pan. A Mark's Box is on a Record pin shared by everyone
// citing the record, whom it names.
@customElement('sl-scan-edit')
class ScanEditElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    editActionsStyles,
    actionStyles,
    scanEditStyles
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private saving = false;
  // The server's words when a save was refused.
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  private async save() {
    this.saving = true;
    this.refused = null;
    try {
      await this.state.chart.save();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  private renderSave(run: () => void) {
    return html`<button class="primary" ?disabled=${this.saving} @click=${run}>
      ${this.saving ? 'Saving…' : 'Save'}
    </button>`;
  }

  private renderAsk() {
    return renderLeaveAsk({
      keep: () => {
        this.state.viewer.answer('keep');
      },
      discard: () => {
        this.state.viewer.answer('discard');
      }
    });
  }

  private renderActions() {
    return html`
      <div class="actions">
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.refused = null;
            this.state.viewer.cancel();
          }}
        >
          Cancel
        </button>
        ${this.renderSave(() => {
          void this.save();
        })}
      </div>
    `;
  }

  // The pending change's: for the source's Box, whom it moves too.
  override render() {
    const { viewer } = this.state;
    const pending = viewer.pending.get();
    if (pending === null) return nothing;
    const source = viewer.source.get();
    const names =
      pending.kind === 'mark' && source !== null
        ? alsoCiting(this.state, source)
        : [];
    const also =
      names.length === 0
        ? nothing
        : html`<p class="also">Also moves ${names.join(', ')}.</p>`;
    return this.renderAsking(also, this.renderSaving());
  }

  // The pane's own buttons stay under the ask: Cancel there gets back to
  // them, to save.
  private renderSaving() {
    return this.state.viewer.leaving.get()
      ? html`${this.renderActions()} ${this.renderAsk()}`
      : this.renderActions();
  }

  // What the change is about, why a save was refused, and what's asked.
  private renderAsking(about: unknown, asking: unknown) {
    return html`
      ${about}
      ${
        this.refused === null
          ? nothing
          : html`<p class="refused">${this.refused}</p>`
      }
      ${asking}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-edit': ScanEditElement;
  }
}
