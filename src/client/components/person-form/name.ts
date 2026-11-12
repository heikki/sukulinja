import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow, Sex } from '@/common/types';

import { nameField, sexField } from './fields';

const SEXES = new Set<string>(['M', 'F', 'X', 'U']);

// A person's name and sex being changed, in place of them in the panel's
// header: their given names, surname and sex as the chart has them. Save
// or Enter saves; it, Cancel or Esc say `closed`.
@customElement('sl-name-form')
class NameFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    css`
      .form {
        background: var(--card);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) person: PersonRow | null = null;

  @state() private given = '';
  @state() private surname = '';
  @state() private sex: Sex = 'U';
  @state() private saving = false;
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    const p = this.person;
    if (p === null) return;
    this.given = p.given ?? '';
    this.surname = p.surname ?? '';
    this.sex = p.sex !== null && SEXES.has(p.sex) ? (p.sex as Sex) : 'U';
  }

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  private close() {
    this.dispatchEvent(new Event('closed'));
  }

  private async save() {
    const p = this.person;
    if (this.saving || p === null) return;
    this.saving = true;
    this.refused = null;
    try {
      await this.state.personEdits.edit(p.id, {
        given: this.given,
        surname: this.surname,
        sex: this.sex
      });
      this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  // Enter saves and Esc closes, from any field; the rest of the keys are
  // the field's.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void this.save();
    }
  };

  override render() {
    return html`<div class="form" @keydown=${this.onKeyDown}>
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
      <div class="buttons">
        <span class="gap"></span>
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
            void this.save();
          }}
        >
          ${this.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-name-form': NameFormElement;
  }
}
