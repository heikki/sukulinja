import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { gedcomDate } from '@/common/dates';
import {
  ADDABLE_FACTS,
  factKindLabel,
  hasType,
  hasValue
} from '@/common/facts';
import type { FactFields, FactRow, Marriage } from '@/common/types';

// What a Fact says, as the form shows it.
function fieldsOf(fact: FactRow): FactFields {
  return {
    date: fact.date === null ? '' : gedcomDate(fact.date),
    place: fact.place ?? '',
    value: fact.value === 'Y' ? '' : (fact.value ?? ''),
    type: fact.type ?? ''
  };
}

const BLANK: FactFields = { date: '', place: '', value: '', type: '' };

// A spouse as a marriage's form names them.
function spouseLabel(m: Marriage) {
  return m.spouse === null ? 'with an unknown spouse' : `with ${m.spouse}`;
}

// A Fact being added or changed, in place of its row in Events: its kind
// (picked for a new one, a marriage's spouse too when there's more than
// one), date, place, an attribute's value and an Event's type. Save or
// Enter saves it, and it and Cancel or Esc say `closed`. A Fact being
// changed can be deleted, asked first.
@customElement('sl-fact-form')
class FactFormElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, formStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // The Fact changed; null for a new one.
  @property({ attribute: false }) fact: FactRow | null = null;
  // Where a new marriage's Facts can go.
  @property({ attribute: false }) marriages: Marriage[] = [];

  @state() private tag = ADDABLE_FACTS[0]!.tag;
  @state() private familyId: number | null = null;
  @state() private fields: FactFields = BLANK;
  @state() private saving = false;
  @state() private deleting = false;
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    if (this.fact !== null) this.fields = fieldsOf(this.fact);
    this.state.facts.loadPlaces();
  }

  override firstUpdated() {
    this.renderRoot.querySelector<HTMLElement>('select, input')?.focus();
  }

  private get kind() {
    return this.fact?.tag ?? this.tag;
  }

  private close() {
    this.dispatchEvent(new Event('closed'));
  }

  private async run(save: () => Promise<void>) {
    if (this.saving) return;
    this.saving = true;
    this.refused = null;
    try {
      await save();
      this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
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

  private deleteFact() {
    const { fact } = this;
    if (fact === null) return;
    void this.run(async () => {
      await this.state.facts.remove(fact.id);
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
      if (this.deleting) this.deleteFact();
      else this.save();
    }
  };

  private set(key: keyof FactFields) {
    return (e: Event) => {
      const { value } = e.target as HTMLInputElement;
      this.fields = { ...this.fields, [key]: value };
    };
  }

  // The kinds a Fact can be added as; a marriage's only with a family to
  // put it in.
  private renderKind() {
    if (this.fact !== null) return nothing;
    const kinds = ADDABLE_FACTS.filter(
      (k) => !k.family || this.marriages.length > 0
    );
    return html`<label>
      <span>Event</span>
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
    placeholder: string,
    list?: string
  ) {
    return html`<label>
      <span>${label}</span>
      <input
        type="text"
        list=${list ?? nothing}
        autocomplete="off"
        placeholder=${placeholder}
        .value=${this.fields[key]}
        @input=${this.set(key)}
      />
    </label>`;
  }

  private renderButtons() {
    if (this.deleting) {
      const kind = factKindLabel(this.kind).toLowerCase();
      return html`<p class="ask">Delete the ${kind}?</p>
        <div class="buttons end">
          <button
            ?disabled=${this.saving}
            @click=${() => {
              this.deleting = false;
            }}
          >
            Cancel
          </button>
          <button
            class="danger"
            ?disabled=${this.saving}
            @click=${() => {
              this.deleteFact();
            }}
          >
            ${this.saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>`;
    }
    return html`<div class="buttons">
      ${
        this.fact === null
          ? nothing
          : html`<button
              class="danger"
              ?disabled=${this.saving}
              @click=${() => {
                this.deleting = true;
              }}
            >
              Delete
            </button>`
      }
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
          this.save();
        }}
      >
        ${this.saving ? 'Saving…' : 'Save'}
      </button>
    </div>`;
  }

  override render() {
    const tag = this.kind;
    const places = this.state.facts.places.get();
    return html`<div class="form" @keydown=${this.onKeyDown}>
      ${this.renderKind()} ${this.renderSpouse()}
      ${
        hasType(tag) ? this.renderField('type', 'Type', 'e.g. Muutto') : nothing
      }
      ${
        hasValue(tag)
          ? this.renderField('value', factKindLabel(tag), 'e.g. torppari')
          : nothing
      }
      ${this.renderField('date', 'Date', 'e.g. 3.3.1761 or n. 1761')}
      ${this.renderField('place', 'Place', 'e.g. Haukivuori', 'places')}
      <datalist id="places">
        ${places.map((p) => html`<option value=${p}></option>`)}
      </datalist>
      ${
        this.refused === null
          ? nothing
          : html`<p class="error">${this.refused}</p>`
      }
      ${this.renderButtons()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-fact-form': FactFormElement;
  }
}
