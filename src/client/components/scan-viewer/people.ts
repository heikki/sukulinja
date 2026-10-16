import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { PersonRow, VolumeCitation } from '@common/types';

import { formatName } from '../tree-view/renderer';
import { boxKey, citationLabel, citedAs, groupCitations } from './citations';
import { controlStyles, scanPeopleStyles } from './styles';

// Collapsed or not for the rest of the visit, across Volumes and citations.
let collapsed = false;

// Beside the scan: the people of the tree whose citations link the Image
// shown, grouped as `groupCitations` says, and those known only to be in
// the Volume. Clicking one asks for them with `scan-pick`; the citation the
// viewer is on (`current`) is marked. Hovering a row with an entry on the
// scan names the entry's key with `scan-hover`, and rows of the entry picked
// out there (`hovered`) are highlighted.
@customElement('sl-scan-people')
export class ScanPeopleElement extends LitElement {
  static override styles = [controlStyles, scanPeopleStyles];

  // The Volume's citations; null until they arrive, or when they can't.
  @property({ attribute: false }) rows: VolumeCitation[] | null = null;
  @property({ type: Number }) image = 1;
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  @property({ attribute: false }) current: number | null = null;
  @property({ attribute: false }) hovered: string | null = null;
  @property({ type: Boolean }) failed = false;

  private readonly nameOf = (row: VolumeCitation) => {
    const person = this.persons.get(row.personId);
    return person === undefined
      ? (row.citation.record?.name ?? '—')
      : formatName(person);
  };

  private readonly toggle = () => {
    collapsed = !collapsed;
    this.toggleAttribute('collapsed', collapsed);
    this.requestUpdate();
  };

  override connectedCallback() {
    super.connectedCallback();
    this.toggleAttribute('collapsed', collapsed);
  }

  private hover(key: string | null) {
    this.dispatchEvent(new CustomEvent('scan-hover', { detail: key }));
  }

  private renderRow(row: VolumeCitation) {
    const current = row.citation.id === this.current;
    const key = row.box === undefined ? null : boxKey(row.box);
    const hovered = key !== null && key === this.hovered;
    return html`
      <li>
        <button
          class="row ${current ? 'current' : ''} ${hovered ? 'hovered' : ''}"
          aria-current=${current ? 'true' : nothing}
          title=${row.citation.reference ?? ''}
          @click=${() => {
            this.dispatchEvent(new CustomEvent('scan-pick', { detail: row }));
          }}
          @mouseenter=${() => {
            if (key !== null) this.hover(key);
          }}
          @mouseleave=${() => {
            if (key !== null) this.hover(null);
          }}
        >
          <span class="name">${this.nameOf(row)}</span>
          <span class="muted">${citedAs(row)} · ${citationLabel(row)}</span>
        </button>
      </li>
    `;
  }

  private renderList() {
    if (this.rows === null) {
      return html`<p class="muted">
        ${this.failed ? 'People unavailable' : 'Finding people…'}
      </p>`;
    }
    const groups = groupCitations(this.rows, this.image, this.nameOf);
    if (groups.length === 0) {
      return html`<p class="muted">No one in the tree is linked here.</p>`;
    }
    return groups.map(
      (g) => html`
        <h3>${g.label}</h3>
        <ul>
          ${g.rows.map((r) => this.renderRow(r))}
        </ul>
      `
    );
  }

  override render() {
    if (collapsed) {
      return html`
        <button
          class="toggle"
          title="Show the people here"
          aria-label="Show the people here"
          @click=${this.toggle}
        >
          ‹
        </button>
      `;
    }
    return html`
      <div class="head">
        <h2>People here</h2>
        <button
          class="toggle"
          title="Hide the people here"
          aria-label="Hide the people here"
          @click=${this.toggle}
        >
          ›
        </button>
      </div>
      <div class="list">${this.renderList()}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-people': ScanPeopleElement;
  }
}
