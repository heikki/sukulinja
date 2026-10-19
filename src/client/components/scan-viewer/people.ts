import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { PersonRow, VolumeCitation } from '@common/types';

import { formatName } from '../tree-view/renderer';
import { boxKey, groupCitations, imageOf, SPLIT_NOTE } from './citations';
import { markedIn, saveMark } from './helpers';
import type { ScanMarked } from './helpers';
import { controlStyles, scanPeopleStyles } from './styles';

// Collapsed or not for the rest of the visit, across Volumes and citations.
let collapsed = false;

// Beside the scan: the people of the tree whose citations link the Image
// shown, grouped as `groupCitations` says. Clicking one asks for them with `scan-pick`; the citation the
// viewer is on (`current`) is marked. Hovering a row with an entry on the
// scan names the entry's key with `scan-hover`, and rows of the entry picked
// out there (`hovered`) are highlighted. A vision match can be confirmed
// from its row, saved as marking its Image by hand would be, and reported
// with `scan-marked`.
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
  // The Volume shown, which a confirmation marks.
  @property({ attribute: false }) volumeId: string | null = null;

  // The citation being confirmed, and the last one that couldn't be.
  @state() private confirming: number | null = null;
  @state() private refused: { id: number; error: string } | null = null;

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

  private async confirm(row: VolumeCitation) {
    const { volumeId } = this;
    const image = imageOf(row);
    if (volumeId === null || image === null) return;
    this.confirming = row.citation.id;
    this.refused = null;
    const saved = await saveMark(row.citation.id, {
      volumeId,
      image
    });
    this.confirming = null;
    if ('error' in saved) {
      this.refused = { id: row.citation.id, error: saved.error };
      return;
    }
    const detail: ScanMarked = markedIn(saved.resolved, volumeId);
    this.dispatchEvent(
      new CustomEvent('scan-marked', { detail, bubbles: true, composed: true })
    );
  }

  private renderConfirm(row: VolumeCitation) {
    if (row.link.certainty !== 'vision') return nothing;
    const id = row.citation.id;
    return html`
      <button
        class="confirm"
        title="Mark this Image as where the record is"
        ?disabled=${this.confirming !== null}
        @click=${() => {
          void this.confirm(row);
        }}
      >
        ${this.confirming === id ? 'Saving…' : 'Confirm'}
      </button>
      ${
        this.refused?.id === id
          ? html`<p class="refused">${this.refused.error}</p>`
          : nothing
      }
    `;
  }

  private renderRow(row: VolumeCitation) {
    const current = row.citation.id === this.current;
    const { box } = row.link;
    const key = box === undefined ? null : boxKey(box);
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
          ${row.split ? html`<span class="muted">${SPLIT_NOTE}</span>` : nothing}
        </button>
        ${this.renderConfirm(row)}
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

  // As the person dock does: the whole header hides the list, and hidden,
  // a rail with the heading brings it back.
  override render() {
    if (collapsed) {
      return html`
        <button class="rail" title="Show the people here" @click=${this.toggle}>
          <span aria-hidden="true">‹</span>
          <span class="rail-heading">People here</span>
        </button>
      `;
    }
    return html`
      <button class="head" title="Hide the people here" @click=${this.toggle}>
        <h2>People here</h2>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <div class="list">${this.renderList()}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-people': ScanPeopleElement;
  }
}
