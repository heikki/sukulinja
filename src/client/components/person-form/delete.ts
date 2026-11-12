import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
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

  @property({ attribute: false }) person: PersonRow | null = null;

  @state() private deleting = false;
  @state() private refused: string | null = null;

  private close() {
    if (this.deleting) return;
    this.dispatchEvent(new Event('closed'));
  }

  private async confirm(person: PersonRow) {
    this.deleting = true;
    this.refused = null;
    try {
      await this.state.personEdits.remove(person.id);
      this.deleting = false;
      this.close();
    } catch (err) {
      this.deleting = false;
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    }
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
          this.refused === null
            ? nothing
            : html`<p class="refused">${this.refused}</p>`
        }
        <div class="actions">
          <button @click=${close} ?disabled=${this.deleting}>Cancel</button>
          <button
            class="danger"
            ?disabled=${this.deleting}
            @click=${() => {
              void this.confirm(person);
            }}
          >
            ${this.deleting ? 'Deleting…' : 'Delete'}
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
