import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import {
  controlStyles,
  editActionsStyles,
  footBarStyles
} from '../box-stage/styles';
import { formatName } from '../tree-view/renderer';

function stop(e: Event) {
  e.stopPropagation();
}

// At the foot of the Photo while a Tag is pending: whose it is, Cancel and
// Save; or, for a Tag taken back, asking to confirm. Why a save was
// refused shows beside. Pointer and wheel input stays here, so a press
// doesn't pan.
@customElement('sl-photo-edit')
class PhotoEditElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    footBarStyles,
    editActionsStyles,
    css`
      :host {
        gap: 0.75rem;
        padding: 0.35rem 0.5rem 0.35rem 0.75rem;
      }
    `
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

  private get viewer() {
    return this.state.photoViewer;
  }

  private nameOf(personId: number) {
    const person = this.state.chart.people.get().persons.get(personId);
    return person === undefined ? 'someone' : formatName(person);
  }

  private async save() {
    this.saving = true;
    this.refused = null;
    try {
      await this.viewer.save();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  private cancel() {
    this.refused = null;
    this.viewer.cancel();
  }

  private renderActions(go: string, going: string, kind: 'save' | 'discard') {
    return html`<div class="actions">
      <button
        ?disabled=${this.saving}
        @click=${() => {
          this.cancel();
        }}
      >
        Cancel
      </button>
      <button
        class=${kind}
        ?disabled=${this.saving}
        @click=${() => {
          void this.save();
        }}
      >
        ${this.saving ? going : go}
      </button>
    </div>`;
  }

  override render() {
    const pending = this.viewer.pending.get();
    const removing = this.viewer.removing.get();
    const refused =
      this.refused === null
        ? nothing
        : html`<p class="refused">${this.refused}</p>`;
    if (pending !== null) {
      const name = this.nameOf(pending.personId);
      return html`
        <p>${pending.moving ? `Tag of ${name}` : `New tag for ${name}`}</p>
        ${refused} ${this.renderActions('Save', 'Saving…', 'save')}
      `;
    }
    if (removing !== null) {
      return html`
        <p>Remove the tag of ${this.nameOf(removing)}?</p>
        ${refused} ${this.renderActions('Remove', 'Removing…', 'discard')}
      `;
    }
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photo-edit': PhotoEditElement;
  }
}
