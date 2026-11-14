import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
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

  private readonly asking = new Asking(this);

  @property({ attribute: false }) person: PersonRow | null = null;

  @state() private given = '';
  @state() private surname = '';
  @state() private sex: Sex = 'U';

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
    if (p === null) return;
    const name = { given: this.given, surname: this.surname, sex: this.sex };
    const saved = await this.asking.run(() =>
      this.state.personEdits.edit(p.id, name)
    );
    if (saved) this.close();
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
        this.asking.refused === null
          ? nothing
          : html`<p class="error">${this.asking.refused}</p>`
      }
      <div class="buttons">
        <span class="gap"></span>
        <button
          ?disabled=${this.asking.busy}
          @click=${() => {
            this.close();
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.asking.busy}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.asking.busy ? 'Saving…' : 'Save'}
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
