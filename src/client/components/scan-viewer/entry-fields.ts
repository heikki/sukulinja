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

const PLACES = [
  { key: 'village', label: 'Village' },
  { key: 'farm', label: 'Farm' }
] as const;

// An Entry's fields on its card (ADR-0033): the dates its Event gives,
// typed the app's way, then its village and farm, each set as typed
// (`set-field`). Under them the lines of what they'd do to the tree,
// each with its box (`tick`), but two Facts of a kind, to choose between
// in Sources. Never required: nothing ticked saves the Entry alone.
@customElement('sl-entry-fields')
class EntryFieldsElement extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      gap: 0.35rem;
    }

    label.field {
      display: grid;
      grid-template-columns: 4.2rem 1fr;
      gap: 0.4rem;
      align-items: center;
    }

    span {
      color: var(--muted);
    }

    input[type='text'] {
      min-width: 0;
      padding: 0.1rem 0.3rem;
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
      gap: 0.2rem;
      margin: 0.15rem 0 0;
      padding: 0.35rem 0 0;
      border-top: 1px solid var(--border);
      list-style: none;
      font-size: 0.85em;
    }

    li label {
      display: flex;
      gap: 0.4rem;
      align-items: start;
    }

    li input {
      margin: 0.15rem 0 0;
    }

    li.two {
      padding-left: 1.35rem;
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

  private renderField(key: keyof TypedFields, label: string, date: boolean) {
    const text = this.fields[key];
    const unread = date && text.trim() !== '' && typedDate(text) === null;
    return html`<label class="field">
      <span>${label}</span>
      <input
        type="text"
        .value=${text}
        placeholder=${date ? '3.3.1761' : ''}
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
        this.renderField(key, label, true)
      )}
      ${PLACES.map(({ key, label }) => this.renderField(key, label, false))}
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
