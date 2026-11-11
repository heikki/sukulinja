import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { FactRow } from '@/common/types';

import { factLabel, factText } from './helpers';
import { definitionListStyles } from './styles';

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says.
@customElement('sl-person-events')
class PersonEventsElement extends LitElement {
  static override styles = definitionListStyles;

  @property({ attribute: false }) facts: FactRow[] = [];

  override render() {
    return html`<dl>
      ${this.facts.map(
        (f) =>
          html`<dt>${factLabel(f)}</dt>
            <dd>${factText(f)}</dd>`
      )}
    </dl>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-events': PersonEventsElement;
  }
}
