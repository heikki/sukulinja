import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import { formDialog, formDialogStyles } from '@/client/form-dialog';
import { formStyles } from '@/client/form-styles';
import { markModal } from '@/client/modals';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow, Sex } from '@/common/types';

import { nameField, sexField } from './fields';

const SEXES = new Set<string>(['M', 'F', 'X', 'U']);

// A person's name and sex being changed, in a modal: their given names,
// surname and sex as the chart has them. Save or Enter saves; it, Cancel,
// Esc or a press on the scrim say `closed`.
@customElement('sl-name-form')
class NameFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    dialogStyles,
    formDialogStyles
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) person: PersonRow | null = null;

  @state() private given = '';
  @state() private surname = '';
  @state() private sex: Sex = 'U';

  constructor() {
    super();
    markModal(this);
  }

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

  // Not while saving: a refusal would have nowhere to show.
  private close() {
    if (!this.asking.busy) this.dispatchEvent(new Event('closed'));
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
    return formDialog({
      title: 'Change the name',
      close: () => {
        this.close();
      },
      keydown: this.onKeyDown,
      fields: html`
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
      `,
      actions: html`
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
      `
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-name-form': NameFormElement;
  }
}
