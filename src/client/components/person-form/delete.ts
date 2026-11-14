import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// Asks before deleting the person, saying what goes with them, and
// deletes them. Dispatches `closed` once done or cancelled.
@customElement('sl-delete-person')
class DeletePersonElement extends LitElement {
  static override styles = [
    dialogStyles,
    css`
      .refused {
        color: var(--danger);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) person: PersonRow | null = null;

  private close() {
    if (this.asking.busy) return;
    this.dispatchEvent(new Event('closed'));
  }

  private async confirm(person: PersonRow) {
    const removed = await this.asking.run(() =>
      this.state.personEdits.remove(person.id)
    );
    if (removed) this.close();
  }

  override render() {
    const { person } = this;
    if (person === null) return nothing;
    const close = () => {
      this.close();
    };
    return html`<div class="overlay" @click=${close}>
      <div
        class="dialog"
        role="alertdialog"
        aria-labelledby="delete-title"
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2 id="delete-title">Delete ${formatName(person)}?</h2>
        <p>
          Their Facts, Citations, Tags and Reminders go with them. The Changes
          stay, naming them.
        </p>
        ${
          this.asking.refused === null
            ? nothing
            : html`<p class="refused">${this.asking.refused}</p>`
        }
        <div class="actions">
          <button @click=${close} ?disabled=${this.asking.busy}>Cancel</button>
          <button
            class="danger"
            ?disabled=${this.asking.busy}
            @click=${() => {
              void this.confirm(person);
            }}
          >
            ${this.asking.busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-delete-person': DeletePersonElement;
  }
}
