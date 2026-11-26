import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { actionStyles } from '@/client/dialog-styles';
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
// Save. Why a save was refused shows beside, and why choosing a portrait
// was, with OK. Pointer and wheel input stays here, so a press
// doesn't pan.
@customElement('sl-photo-edit')
class PhotoEditElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    footBarStyles,
    editActionsStyles,
    actionStyles,
    css`
      :host {
        gap: 0.75rem;
        padding: 0.35rem 0.5rem 0.35rem 0.75rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

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
    await this.asking.run(() => this.viewer.save());
  }

  private cancel() {
    this.asking.forget();
    this.viewer.cancel();
  }

  private renderActions(go: string, going: string, kind: 'primary' | 'danger') {
    return html`<div class="actions">
      <button
        ?disabled=${this.asking.busy}
        @click=${() => {
          this.cancel();
        }}
      >
        Cancel
      </button>
      <button
        class=${kind}
        ?disabled=${this.asking.busy}
        @click=${() => {
          void this.save();
        }}
      >
        ${this.asking.busy ? going : go}
      </button>
    </div>`;
  }

  override render() {
    const pending = this.viewer.pending.get();
    const refused =
      this.asking.refused === null
        ? nothing
        : html`<p class="refused">${this.asking.refused}</p>`;
    if (pending !== null) {
      const name = this.nameOf(pending.personId);
      return html`
        <p>
          ${pending.moving ? `Editing the box of ${name}` : `Tagging ${name}`}
        </p>
        ${refused} ${this.renderActions('Save', 'Saving…', 'primary')}
      `;
    }
    const portrait = this.viewer.refused.get();
    if (portrait !== null) {
      return html`
        <p class="refused">Couldn't use it as the portrait: ${portrait}</p>
        <div class="actions">
          <button
            @click=${() => {
              this.cancel();
            }}
          >
            OK
          </button>
        </div>
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
