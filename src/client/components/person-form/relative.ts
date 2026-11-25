import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import { formDialog, formDialogStyles } from '@/client/form-dialog';
import { formStyles } from '@/client/form-styles';
import { markModal } from '@/client/modals';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow, Relation, RelativeWho, Sex } from '@/common/types';

import { alikePersons } from '../person-search/match';
import { formatDates, formatName } from '../tree-view/renderer';
import { nameField, sexField } from './fields';
import type { ChildFamily } from './relations';

// How many people alike are offered.
const ALIKE_MAX = 5;

function stop(e: Event) {
  e.stopPropagation();
}

// A new person being added as the relation of `personId`, in a modal
// titled `heading`: their given names, surname and sex, and, for a child
// of someone with several families, which. People already in the tree with a name like the one typed are
// offered first, and picking one links them instead. Add or Enter adds a
// new person, then says who was put in place with `added`; it, Cancel,
// Esc or a press on the scrim say `closed`. `deferred`, nothing is added:
// whom it would add or link is said with `named`, for an Entry to make
// with it (ADR-0033). Presses on it stay on it, so they don't pan what's
// under it.
@customElement('sl-relative-form')
class RelativeFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    dialogStyles,
    formDialogStyles,
    css`
      .alike {
        display: grid;
        margin: 0.1rem -0.4rem;
      }

      .dialog .alike p {
        margin: 0 0.4rem 0.1rem;
      }

      .alike button {
        padding: 0.2rem 0.4rem;
        border: 0;
        border-radius: 6px;
        background: none;
        color: var(--fg);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .alike button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--accent) 18%, transparent);
      }

      .muted {
        color: var(--muted);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) personId = 0;
  @property({ attribute: false }) relation: Relation = 'child';
  // Names whose relative they'll be: "Father of Juho Esimerkki".
  @property({ attribute: false }) heading = '';
  @property({ attribute: false }) sex: Sex = 'U';
  // The families a child can go into; empty when there's no choice.
  @property({ attribute: false }) families: ChildFamily[] = [];
  // Everyone in the tree, some of whom may be the one meant.
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  // Says whom it would add or link, adding no one.
  @property({ attribute: false }) deferred = false;
  // Whether the sex is asked; else it's `sex`.
  @property({ attribute: false }) askSex = true;

  @state() private given = '';
  @state() private surname = '';
  @state() private chosenSex: Sex | null = null;
  @state() private familyId: number | null = null;

  constructor() {
    super();
    markModal(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  // Not while saving: a refusal would have nowhere to show.
  private close() {
    if (!this.asking.busy) this.dispatchEvent(new Event('closed'));
  }

  // People already in the tree whose name is like the one typed, to link
  // in place of a new person: none until the name says enough.
  private alike() {
    const others = [...this.persons.values()].filter(
      (p) => p.id !== this.personId
    );
    return alikePersons(others, `${this.given} ${this.surname}`, ALIKE_MAX);
  }

  // Puts the new person, or someone already in the tree, in place.
  private async save(who: RelativeWho) {
    if (this.deferred) {
      this.dispatchEvent(new CustomEvent('named', { detail: who }));
      this.close();
      return;
    }
    const familyId =
      this.families.length === 0
        ? null
        : (this.familyId ?? this.families[0]!.familyId);
    let id = 0;
    const added = await this.asking.run(async () => {
      const relative = { relation: this.relation, who, familyId };
      id = await this.state.personEdits.addRelative(this.personId, relative);
    });
    if (!added) return;
    this.dispatchEvent(new CustomEvent('added', { detail: { id } }));
    this.close();
  }

  // Enter saves and Esc closes, from any field; the rest of the keys are
  // the field's.
  private saveNew() {
    void this.save({
      given: this.given,
      surname: this.surname,
      sex: this.chosenSex ?? this.sex
    });
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      this.saveNew();
    }
  };

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

  // Each one alike, picked to link them instead.
  private renderAlike(alike: PersonRow[]) {
    if (alike.length === 0) return nothing;
    return html`<div class="alike">
      <p>Is it one of these?</p>
      ${alike.map((p) => {
        const dates = formatDates(p);
        return html`<button
          ?disabled=${this.asking.busy}
          @click=${() => {
            void this.save({ personId: p.id });
          }}
        >
          ${formatName(p)}
          ${dates === '' ? nothing : html`<span class="muted">(${dates})</span>`}
        </button>`;
      })}
    </div>`;
  }

  private addLabel(alike: boolean) {
    if (this.asking.busy) return 'Adding…';
    return alike
      ? `${this.deferred ? 'Name' : 'Add'} as new`
      : this.deferred
        ? 'Name'
        : 'Add';
  }

  override render() {
    const alike = this.alike();
    return formDialog({
      title: this.heading,
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
        ${this.renderAlike(alike)}
        ${
          this.askSex
            ? sexField(this.chosenSex ?? this.sex, (sex) => {
                this.chosenSex = sex;
              })
            : nothing
        }
        ${this.renderFamily()}
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
            this.saveNew();
          }}
        >
          ${this.addLabel(alike.length > 0)}
        </button>
      `
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-relative-form': RelativeFormElement;
  }
}
