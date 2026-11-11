import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Relation, Sex } from '@/common/types';

import { placedInside } from '../context-menu';
import type { ChildFamily } from './relations';

const SEXES: Array<[Sex, string]> = [
  ['M', 'Male'],
  ['F', 'Female'],
  ['X', 'Other'],
  ['U', 'Unknown']
];

function stop(e: Event) {
  e.stopPropagation();
}

// A name's field, labelled, telling `set` what's typed.
function nameField(
  label: string,
  hint: string,
  value: string,
  set: (value: string) => void
) {
  return html`<label>
    <span>${label}</span>
    <input
      type="text"
      autocomplete="off"
      placeholder=${hint}
      .value=${value}
      @input=${(e: Event) => {
        set((e.target as HTMLInputElement).value);
      }}
    />
  </label>`;
}

// A new person being added as the relation of `personId`, at `at` in the
// element it's positioned in, where the card's menu was: their given names,
// surname and sex, and, for a child of someone with several families,
// which. Save or Enter adds them; it, Cancel, Esc or a press elsewhere say
// `closed`. Presses on it stay on it, so they don't pan the chart.
@customElement('sl-relative-form')
class RelativeFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    css`
      :host {
        position: absolute;
        z-index: 3;
        width: 20rem;
        box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
        border-radius: 8px;
        font-size: 0.875rem;
        line-height: 1.4;
        cursor: auto;
      }

      .form {
        background: var(--card);
      }

      h3 {
        margin: 0 0 0.2rem;
        overflow: hidden;
        color: var(--muted);
        font-size: 0.8em;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) personId = 0;
  @property({ attribute: false }) relation: Relation = 'child';
  // Names whose relative they'll be: "Father of Juho Esimerkki".
  @property({ attribute: false }) heading = '';
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };
  @property({ attribute: false }) sex: Sex = 'U';
  // The families a child can go into; empty when there's no choice.
  @property({ attribute: false }) families: ChildFamily[] = [];

  @state() private given = '';
  @state() private surname = '';
  @state() private chosenSex: Sex | null = null;
  @state() private familyId: number | null = null;
  @state() private saving = false;
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    window.addEventListener('mousedown', this.onOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
  }

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  override updated() {
    const { x, y } = placedInside(this, this.at);
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
  }

  private readonly onOutside = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) this.close();
  };

  private close() {
    this.dispatchEvent(new Event('closed'));
  }

  private async save() {
    if (this.saving) return;
    this.saving = true;
    this.refused = null;
    const familyId =
      this.families.length === 0
        ? null
        : (this.familyId ?? this.families[0]!.familyId);
    try {
      await this.state.relatives.add(this.personId, {
        relation: this.relation,
        given: this.given,
        surname: this.surname,
        sex: this.chosenSex ?? this.sex,
        familyId
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

  private renderSex() {
    const sex = this.chosenSex ?? this.sex;
    return html`<label>
      <span>Sex</span>
      <select
        @change=${(e: Event) => {
          this.chosenSex = (e.target as HTMLSelectElement).value as Sex;
        }}
      >
        ${SEXES.map(
          ([value, label]) =>
            html`<option value=${value} ?selected=${value === sex}>
              ${label}
            </option>`
        )}
      </select>
    </label>`;
  }

  private renderFamily() {
    if (this.families.length === 0) return nothing;
    const chosen = this.familyId ?? this.families[0]!.familyId;
    return html`<label>
      <span>Family</span>
      <select
        @change=${(e: Event) => {
          this.familyId = Number((e.target as HTMLSelectElement).value);
        }}
      >
        ${this.families.map(
          (f) =>
            html`<option value=${f.familyId} ?selected=${f.familyId === chosen}>
              ${f.label}
            </option>`
        )}
      </select>
    </label>`;
  }

  override render() {
    return html`<div class="form" role="dialog" @keydown=${this.onKeyDown}>
      <h3>${this.heading}</h3>
      ${nameField('Given names', 'e.g. Matti', this.given, (v) => {
        this.given = v;
      })}
      ${nameField('Surname', 'e.g. Esimerkki', this.surname, (v) => {
        this.surname = v;
      })}
      ${this.renderSex()} ${this.renderFamily()}
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
          ${this.saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-relative-form': RelativeFormElement;
  }
}
