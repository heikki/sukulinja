import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import type { FactRow, Marriage } from '@/common/types';

import './fact-form';

import { personEventsStyles } from './events-styles';
import { factLabel, factText } from './helpers';

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says. Clicking one opens it
// for editing in its place, and _Add event_ opens a new one below; one at
// a time.
@customElement('sl-person-events')
class PersonEventsElement extends LitElement {
  static override styles = [focusRingStyles, personEventsStyles];

  @property({ attribute: false }) facts: FactRow[] = [];
  @property({ attribute: false }) marriages: Marriage[] = [];

  // The Fact open in its form, by id, or a new one's.
  @state() private editing: number | 'new' | null = null;

  private readonly close = () => {
    this.editing = null;
  };

  private renderForm(fact: FactRow | null) {
    return html`<sl-fact-form
      .fact=${fact}
      .marriages=${this.marriages}
      @closed=${this.close}
    ></sl-fact-form>`;
  }

  private renderFact(f: FactRow) {
    if (this.editing === f.id) return this.renderForm(f);
    return html`<button
      class="fact"
      title="Edit"
      @click=${() => {
        this.editing = f.id;
      }}
    >
      <span class="kind">${factLabel(f)}</span>
      <span class="text">${factText(f)}</span>
    </button>`;
  }

  override render() {
    const adding = this.editing === 'new';
    return html`<div class="facts">
        ${this.facts.map((f) => this.renderFact(f))}
      </div>
      ${
        adding
          ? this.renderForm(null)
          : html`<button
              class="add"
              @click=${() => {
                this.editing = 'new';
              }}
            >
              Add event
            </button>`
      }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-events': PersonEventsElement;
  }
}
