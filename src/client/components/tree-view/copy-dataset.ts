import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { formStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { nameField } from '../person-form/fields';

// Copying everyone the chart draws as a new dataset: its name asked, what
// goes said, and once made, the app goes to it. Cancel, Esc or a press
// outside say `closed`.
@customElement('sl-copy-dataset')
class CopyDatasetElement extends LitElement {
  static override styles = [
    formStyles,
    dialogStyles,
    css`
      :host {
        display: contents;
      }

      .dialog .form {
        margin-top: 0.3rem;
        border: 0;
        padding: 0;
        background: none;
      }

      .dialog p {
        margin: 0.5rem 0 0.1rem;
        color: var(--muted);
      }

      .dialog .actions {
        margin-top: 1.2rem;
      }

      .dialog p.error {
        margin: 0.5rem 0 0;
        color: var(--danger);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  // Everyone the chart draws, by id.
  @property({ attribute: false }) personIds: number[] = [];

  @state() private name = '';

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  private close() {
    if (!this.asking.busy) this.dispatchEvent(new Event('closed'));
  }

  private async copy() {
    if (this.name.trim() === '') return;
    await this.asking.run(async () => {
      const info = await this.state.api.copyToNewDataset(
        this.name.trim(),
        this.personIds
      );
      window.location.assign(`/d/${info.slug}/`);
    });
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') this.close();
    else if (e.key === 'Enter' && !e.isComposing) void this.copy();
  };

  override render() {
    const n = this.personIds.length;
    const { busy, refused } = this.asking;
    return html`<div
      class="overlay"
      @click=${() => {
        this.close();
      }}
    >
      <div
        class="dialog"
        role="dialog"
        aria-labelledby="copy-title"
        @keydown=${this.onKeyDown}
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2 id="copy-title">New dataset from the chart</h2>
        <div class="form">
          ${nameField('Name', 'e.g. Esimerkin suku', this.name, (v) => {
            this.name = v;
          })}
          <p>
            Copies the ${n === 1 ? 'person' : `${n} people`} on the chart, with
            their Facts, sources and photos. Reminders and Changes stay here,
            and this dataset stays as it is.
          </p>
          ${refused === null ? nothing : html`<p class="error">${refused}</p>`}
        </div>
        <div class="actions">
          <button
            ?disabled=${busy}
            @click=${() => {
              this.close();
            }}
          >
            Cancel
          </button>
          <button
            class="primary"
            ?disabled=${busy || this.name.trim() === ''}
            @click=${() => {
              void this.copy();
            }}
          >
            ${busy ? 'Copying…' : 'Copy'}
          </button>
        </div>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-copy-dataset': CopyDatasetElement;
  }
}
