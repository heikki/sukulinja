import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { lineKey } from '@/client/state';
import type { TypedFields } from '@/client/state';
import { typedDate } from '@/common/dates';
import { eventDates } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import { offerWords, tickedFirst } from '@/common/entry-offers';
import type { Offer } from '@/common/entry-offers';

// What a field is set to, as typed.
export interface FieldDetail {
  key: keyof TypedFields;
  text: string;
}

// A line's box set, by lineKey.
export interface TickDetail {
  key: string;
  on: boolean;
}

const PLACEHOLDERS = {
  date: '3.3.1761',
  place: 'Esimerkkilä 2',
  page: '12'
};

// An Entry's fields in its Entry pane (ADR-0033): the dates its Event gives,
// typed the app's way, then its page number and place (ADR-0039), each set
// as typed (`set-field`), and what's slotted in (its text). Under them
// the lines of what they'd do to the tree, each with its box (`tick`), but
// two Facts of a kind, to choose between in Sources. Never required: nothing ticked saves the Entry alone.
@customElement('sl-entry-fields')
class EntryFieldsElement extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      gap: 0.6rem;
    }

    label.field {
      display: grid;
      grid-template-columns: 4.75rem 1fr;
      gap: 0.5rem;
      align-items: center;
    }

    span {
      color: var(--muted);
    }

    input[type='text'] {
      min-width: 0;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--fg);
      font: inherit;
    }

    input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    ul {
      display: grid;
      gap: 0.5rem;
      margin: 0.4rem 0 0;
      padding: 0.75rem 0 0;
      border-top: 1px solid var(--border);
      list-style: none;
      line-height: 1.35;
    }

    /* The box in line with its first line, should the words wrap. */
    li label {
      display: flex;
      gap: 0.5rem;
      align-items: start;
    }

    li input {
      flex: none;
      width: 1rem;
      height: 1rem;
      margin: 0.17rem 0 0;
    }

    li.two {
      padding-left: 1.5rem;
      color: var(--muted);
    }
  `;

  @property({ attribute: false }) event: EntryEvent | null = null;
  @property({ attribute: false }) fields!: TypedFields;
  @property({ attribute: false }) ticks: Record<string, boolean> = {};
  @property({ attribute: false }) offers: Offer[] = [];

  private set(key: keyof TypedFields, text: string) {
    const detail: FieldDetail = { key, text };
    this.dispatchEvent(
      new CustomEvent('set-field', { detail, bubbles: true, composed: true })
    );
  }

  private renderField(
    key: keyof TypedFields,
    label: string,
    kind: 'date' | 'place' | 'page'
  ) {
    const text = this.fields[key];
    const typed = text.trim();
    const unread =
      typed !== '' &&
      (kind === 'date'
        ? typedDate(text) === null
        : kind === 'page' && !/^[1-9]\d{0,5}$/.test(typed));
    return html`<label class="field">
      <span>${label}</span>
      <input
        type="text"
        .value=${text}
        inputmode=${kind === 'page' ? 'numeric' : 'text'}
        placeholder=${PLACEHOLDERS[kind]}
        aria-invalid=${unread ? 'true' : 'false'}
        @input=${(e: Event) => {
          this.set(key, (e.target as HTMLInputElement).value);
        }}
      />
    </label>`;
  }

  private renderLine(offer: Offer) {
    if (offer.action === 'two') {
      return html`<li class="two">${offerWords(offer)}</li>`;
    }
    const key = lineKey(offer);
    return html`<li>
      <label>
        <input
          type="checkbox"
          .checked=${this.ticks[key] ?? tickedFirst(offer)}
          @change=${(e: Event) => {
            const detail: TickDetail = {
              key,
              on: (e.target as HTMLInputElement).checked
            };
            this.dispatchEvent(
              new CustomEvent('tick', { detail, bubbles: true, composed: true })
            );
          }}
        />
        ${offerWords(offer)}
      </label>
    </li>`;
  }

  override render() {
    return html`
      ${eventDates(this.event).map(({ key, label }) =>
        this.renderField(key, label, 'date')
      )}
      ${this.renderField('page', 'Page', 'page')}
      ${this.renderField('place', 'Place', 'place')}
      <slot></slot>
      ${
        this.offers.length === 0
          ? nothing
          : html`<ul aria-label="What it does to the tree">
              ${this.offers.map((o) => this.renderLine(o))}
            </ul>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-entry-fields': EntryFieldsElement;
  }
}
