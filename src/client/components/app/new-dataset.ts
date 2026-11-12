import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import type { LifecycleApi } from '@/client/dataset-api/lifecycle';
import { dialogStyles } from '@/client/dialog-styles';
import { formStyles } from '@/client/form-styles';
import { slugFromFilename } from '@/common/slug';
import type { DatasetInfo, Sex } from '@/common/types';

import { nameField, sexField } from '../person-form/fields';

// Starting a new dataset, beside importing one: its name, and its first
// person's name and sex, who the chart starts from. Once made, the app
// goes to it; Cancel, Esc or a press outside say `closed`. A name another
// dataset has is refused here already, as by the server.
@customElement('sl-new-dataset')
class NewDatasetElement extends LitElement {
  static override styles = [
    formStyles,
    dialogStyles,
    css`
      :host {
        display: contents;
      }

      .dialog .form {
        border: 0;
        padding: 0;
        background: none;
      }

      .dialog .form p {
        margin: 0.5rem 0 0.1rem;
        color: var(--muted);
      }

      .dialog .actions {
        margin-top: 1rem;
      }

      .dialog .form p.error {
        margin: 0;
        color: var(--danger);
      }
    `
  ];

  @property({ attribute: false }) lifecycle!: LifecycleApi;
  // The datasets there are, whose names are taken.
  @property({ attribute: false }) datasets: DatasetInfo[] = [];

  @state() private name = '';
  @state() private given = '';
  @state() private surname = '';
  @state() private sex: Sex = 'U';
  @state() private saving = false;
  @state() private refused: string | null = null;

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  private close() {
    if (!this.saving) this.dispatchEvent(new Event('closed'));
  }

  // Why the name can't be used, before asking; null when it can.
  private nameRefused() {
    const slug = slugFromFilename(this.name.trim());
    if (slug === '') return 'The name needs a letter or a digit.';
    const taken = this.datasets.find((d) => d.slug === slug);
    return taken === undefined
      ? null
      : `There's a dataset named ${taken.displayName} already.`;
  }

  private async create() {
    if (this.saving) return;
    const refused = this.nameRefused();
    if (refused !== null) {
      this.refused = refused;
      return;
    }
    this.saving = true;
    this.refused = null;
    try {
      const info = await this.lifecycle.create({
        name: this.name.trim(),
        given: this.given,
        surname: this.surname,
        sex: this.sex
      });
      window.location.assign(`/d/${info.slug}/`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
    else if (e.key === 'Enter' && !e.isComposing) void this.create();
  };

  override render() {
    return html`<div
      class="overlay"
      @click=${() => {
        this.close();
      }}
    >
      <div
        class="dialog"
        role="dialog"
        aria-labelledby="new-title"
        @keydown=${this.onKeyDown}
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2 id="new-title">New dataset</h2>
        <div class="form">
          ${nameField('Name', 'e.g. Esimerkin suku', this.name, (v) => {
            this.name = v;
          })}
          <p>The first person, who the tree starts from:</p>
          ${nameField('Given names', 'e.g. Matti', this.given, (v) => {
            this.given = v;
          })}
          ${nameField('Surname', 'e.g. Esimerkki', this.surname, (v) => {
            this.surname = v;
          })}
          ${sexField(this.sex, (sex) => {
            this.sex = sex;
          })}
          ${
            this.refused === null
              ? nothing
              : html`<p class="error">${this.refused}</p>`
          }
        </div>
        <div class="actions">
          <button
            ?disabled=${this.saving}
            @click=${() => {
              this.close();
            }}
          >
            Cancel
          </button>
          <button
            class="primary"
            ?disabled=${this.saving}
            @click=${() => {
              void this.create();
            }}
          >
            ${this.saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-new-dataset': NewDatasetElement;
  }
}
