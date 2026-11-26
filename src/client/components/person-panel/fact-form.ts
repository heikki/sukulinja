import { SignalWatcher } from '@lit-labs/signals';
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
import { gedcomDate } from '@/common/dates';
import {
  ADDABLE_FACTS,
  addableTo,
  factKindLabel,
  hasType,
  hasValue
} from '@/common/facts';
import type { FactFields, FactRow, Marriage } from '@/common/types';

import '../line-field';

// What a Fact says, as the form shows it.
function fieldsOf(fact: FactRow): FactFields {
  return {
    date: fact.date === null ? '' : gedcomDate(fact.date),
    place: fact.place ?? '',
    address: fact.address ?? '',
    value: fact.value === 'Y' ? '' : (fact.value ?? ''),
    type: fact.type ?? ''
  };
}

const BLANK: FactFields = {
  date: '',
  place: '',
  address: '',
  value: '',
  type: ''
};

// A spouse as a marriage's form names them.
function spouseLabel(m: Marriage) {
  return m.spouse === null ? 'with an unknown spouse' : `with ${m.spouse}`;
}

// A Fact being added or changed, in a modal: its kind
// (picked for a new one, a marriage's spouse too when there's more than
// one), date, place (and a residence's, or one recorded with it, address),
// an attribute's value and an Event's type. Save or Enter saves it, and
// it, Cancel, Esc or a press on the scrim say `closed`. Deleting is
// Facts' menu's.
@customElement('sl-fact-form')
class FactFormElement extends SignalWatcher(LitElement) {
  static override styles = [
    focusRingStyles,
    formStyles,
    dialogStyles,
    formDialogStyles,
    css`
      /* A place may run to a few lines: its label stays by the first. */
      label.lines {
        align-items: start;
      }

      label.lines span {
        padding-top: 0.3rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  // The Fact changed; null for a new one.
  @property({ attribute: false }) fact: FactRow | null = null;
  // Where a new marriage's Facts can go.
  @property({ attribute: false }) marriages: Marriage[] = [];
  // The person's own Facts, so a new one isn't a second birth.
  @property({ attribute: false }) own: FactRow[] = [];

  @state() private tag = ADDABLE_FACTS[0]!.tag;
  @state() private familyId: number | null = null;
  @state() private fields: FactFields = BLANK;

  constructor() {
    super();
    markModal(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.fact !== null) this.fields = fieldsOf(this.fact);
    this.state.facts.loadPlaces();
  }

  // A new Fact's kind is one still offered: the first, when the person's
  // Facts change and theirs is one they now have.
  override willUpdate() {
    if (this.fact !== null) return;
    const kinds = this.kinds();
    if (!kinds.some((k) => k.tag === this.tag)) {
      this.tag = kinds[0]?.tag ?? this.tag;
    }
  }

  override firstUpdated() {
    this.renderRoot
      .querySelector<HTMLElement>('select, input, sl-line-field')
      ?.focus();
  }

  // The kinds a Fact can be added as: none the person has their one of
  // already, and a marriage's only with a family to put it in.
  private kinds() {
    return addableTo(this.own).filter(
      (k) => !k.family || this.marriages.length > 0
    );
  }

  private get kind() {
    return this.fact?.tag ?? this.tag;
  }

  // Not while saving: a refusal would have nowhere to show.
  private close() {
    if (!this.asking.busy) this.dispatchEvent(new Event('closed'));
  }

  private async run(save: () => Promise<void>) {
    if (await this.asking.run(save)) this.close();
  }

  private save() {
    const { facts } = this.state;
    const { fact, fields } = this;
    void this.run(async () => {
      if (fact !== null) {
        await facts.edit(fact.id, fields);
        return;
      }
      const family = ADDABLE_FACTS.find((k) => k.tag === this.tag)?.family;
      const familyId =
        family === true
          ? (this.familyId ?? this.marriages[0]?.familyId ?? null)
          : null;
      await facts.add({ ...fields, tag: this.tag, familyId });
    });
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
      this.save();
    }
  };

  private set(key: keyof FactFields) {
    return (e: Event) => {
      const { value } = e.target as HTMLInputElement | HTMLTextAreaElement;
      this.fields = { ...this.fields, [key]: value };
    };
  }

  private renderKind() {
    if (this.fact !== null) return nothing;
    const kinds = this.kinds();
    return html`<label>
      <span>Kind</span>
      <select
        @change=${(e: Event) => {
          this.tag = (e.target as HTMLSelectElement).value;
        }}
      >
        ${kinds.map(
          (k) =>
            html`<option value=${k.tag} ?selected=${k.tag === this.tag}>
              ${factKindLabel(k.tag)}
            </option>`
        )}
      </select>
    </label>`;
  }

  private renderSpouse() {
    if (this.fact !== null || this.marriages.length < 2) return nothing;
    const family = ADDABLE_FACTS.find((k) => k.tag === this.tag)?.family;
    if (family !== true) return nothing;
    const chosen = this.familyId ?? this.marriages[0]!.familyId;
    return html`<label>
      <span>Spouse</span>
      <select
        @change=${(e: Event) => {
          this.familyId = Number((e.target as HTMLSelectElement).value);
        }}
      >
        ${this.marriages.map(
          (m) =>
            html`<option value=${m.familyId} ?selected=${m.familyId === chosen}>
              ${spouseLabel(m)}
            </option>`
        )}
      </select>
    </label>`;
  }

  private renderField(
    key: keyof FactFields,
    label: string,
    placeholder: string
  ) {
    return html`<label>
      <span>${label}</span>
      <input
        type="text"
        autocomplete="off"
        placeholder=${placeholder}
        .value=${this.fields[key]}
        @input=${this.set(key)}
      />
    </label>`;
  }

  // A field that wraps and grows, as a place does, offering `suggestions`.
  private renderLines(
    key: keyof FactFields,
    label: string,
    placeholder: string,
    suggestions: readonly string[] = []
  ) {
    return html`<label class="lines">
      <span>${label}</span>
      <sl-line-field
        label=${label}
        placeholder=${placeholder}
        .value=${this.fields[key]}
        .suggestions=${suggestions}
        @input=${this.set(key)}
      ></sl-line-field>
    </label>`;
  }

  private renderButtons() {
    const { busy } = this.asking;
    return html`<button
        ?disabled=${busy}
        @click=${() => {
          this.close();
        }}
      >
        Cancel
      </button>
      <button
        class="primary"
        ?disabled=${busy}
        @click=${() => {
          this.save();
        }}
      >
        ${busy ? 'Saving…' : 'Save'}
      </button>`;
  }

  override render() {
    const tag = this.kind;
    const places = this.state.facts.places.get();
    const kind = factKindLabel(tag).toLowerCase();
    return formDialog({
      title: this.fact === null ? 'Add fact' : `Edit ${kind}`,
      close: () => {
        this.close();
      },
      keydown: this.onKeyDown,
      fields: html`
        ${this.renderKind()} ${this.renderSpouse()}
        ${
          hasType(tag)
            ? this.renderField('type', 'Type', 'e.g. Muutto')
            : nothing
        }
        ${
          hasValue(tag)
            ? this.renderField('value', factKindLabel(tag), 'e.g. torppari')
            : nothing
        }
        ${this.renderField('date', 'Date', 'e.g. 3.3.1761 or n. 1761')}
        ${this.renderLines('place', 'Place', 'e.g. Tuppurala, Juva', places)}
        ${
          tag === 'RESI' || (this.fact?.address ?? null) !== null
            ? this.renderLines('address', 'Address', 'e.g. Kauppakatu 1')
            : nothing
        }
        ${
          this.asking.refused === null
            ? nothing
            : html`<p class="error">${this.asking.refused}</p>`
        }
      `,
      actions: this.renderButtons()
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-fact-form': FactFormElement;
  }
}
