import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { VolumeCitation } from '@/common/types';

import { controlStyles, paneRowsStyles } from '../box-stage/styles';
import { boxOf, groupCitations, rowDates, rowName } from './citations';

import '../box-stage/side-pane';

// How long the list last shown stays up while the next Volume's citations
// load, before the pane says it's finding them.
const HOLD_MS = 300;

// Beside the scan: the people of the tree whose citations link the Image
// shown, grouped as `groupCitations` says. Clicking one picks them; the
// citation the viewer is on is marked. Hovering a row with an entry on the
// scan names the entry's key with `box-hover`, and rows of the entry
// picked out there (`hovered`) are highlighted.
@customElement('sl-scan-people')
class ScanPeopleElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    paneRowsStyles,
    css`
      :host {
        display: contents;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // The dataset's people, who name the citations.
  private get persons() {
    return this.state.chart.people.get().persons;
  }
  @property({ attribute: false }) hovered: string | null = null;

  // Moving to another Volume, the list last shown stays up until its
  // citations arrive, so the pane doesn't blink to a one-line note and
  // back; the note shows only once the wait is long enough to see.
  private last: { rows: VolumeCitation[]; image: number } | null = null;
  @state() private waitedLong = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly nameOf = (row: VolumeCitation) => rowName(this.persons, row);

  override willUpdate() {
    const { citations, image } = this.state.viewer;
    const rows = citations.get();
    if (rows !== null) {
      this.stopHold();
      this.waitedLong = false;
      if (Array.isArray(rows)) this.last = { rows, image: image.get() };
    } else if (this.holdTimer === null && !this.waitedLong) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        this.waitedLong = true;
      }, HOLD_MS);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopHold();
  }

  private stopHold() {
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private hover(key: string | null) {
    this.dispatchEvent(new CustomEvent('box-hover', { detail: key }));
  }

  private renderRow(row: VolumeCitation) {
    const current =
      row.citation.id === this.state.viewer.source.get()?.citation.id;
    // As its entry is keyed, when it has one on the Image.
    const key = boxOf(row) === null ? null : row.citation.markKey;
    const hovered = key !== null && key === this.hovered;
    const dates = rowDates(this.persons, row);
    return html`
      <li>
        <button
          class="row ${current ? 'current' : ''} ${hovered ? 'hovered' : ''}"
          aria-current=${current ? 'true' : nothing}
          @click=${() => {
            this.state.chart.pick(row);
          }}
          @mouseenter=${() => {
            if (key !== null) this.hover(key);
          }}
          @mouseleave=${() => {
            if (key !== null) this.hover(null);
          }}
        >
          <span class="name">${this.nameOf(row)}</span>${
            dates === '' ? nothing : html`<span class="dates">(${dates})</span>`
          }
        </button>
      </li>
    `;
  }

  private renderList() {
    const { citations, image } = this.state.viewer;
    const rows = citations.get();
    if (Array.isArray(rows)) return this.renderGroups(rows, image.get());
    if (rows === null && this.last !== null && !this.waitedLong) {
      return this.renderGroups(this.last.rows, this.last.image);
    }
    return html`<p class="muted">
      ${rows === 'failed' ? 'People unavailable' : 'Finding people…'}
    </p>`;
  }

  private renderGroups(rows: VolumeCitation[], image: number) {
    const groups = groupCitations(rows, image, this.nameOf);
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
    return html`<sl-side-pane heading="People here"
      >${this.renderList()}</sl-side-pane
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-people': ScanPeopleElement;
  }
}
