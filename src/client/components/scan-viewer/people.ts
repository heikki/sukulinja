import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@client/dataset-api';
import { appState } from '@client/state';
import type { AppState } from '@client/state';
import type { PersonRow, VolumeCitation } from '@common/types';

import { boxKey, boxOf, groupCitations, pickRow, rowName } from './citations';
import { controlStyles, scanPeopleStyles } from './styles';

// Collapsed or not for the rest of the visit, across Volumes and citations.
let collapsed = false;

// How long the list last shown stays up while the next Volume's citations
// load, before the pane says it's finding them.
const HOLD_MS = 300;

// Beside the scan: the people of the tree whose citations link the Image
// shown, grouped as `groupCitations` says. Clicking one picks them; the
// citation the viewer is on is marked. Hovering a row with an entry on the
// scan names the entry's key with `scan-hover`, and rows of the entry
// picked out there (`hovered`) are highlighted. The picked row, when a
// vision match, can be confirmed, saved as marking its Image by hand would be.
@customElement('sl-scan-people')
export class ScanPeopleElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanPeopleStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  @property({ attribute: false }) hovered: string | null = null;

  // The citation being confirmed, and the last one that couldn't be.
  @state() private confirming: number | null = null;
  @state() private refused: { id: number; error: string } | null = null;
  // Moving to another Volume, the list last shown stays up until its
  // citations arrive, so the pane doesn't blink to a one-line note and
  // back; the note shows only once the wait is long enough to see.
  private last: { rows: VolumeCitation[]; image: number } | null = null;
  @state() private waitedLong = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly nameOf = (row: VolumeCitation) => rowName(this.persons, row);

  private readonly toggle = () => {
    collapsed = !collapsed;
    this.toggleAttribute('collapsed', collapsed);
    this.requestUpdate();
  };

  override connectedCallback() {
    super.connectedCallback();
    this.toggleAttribute('collapsed', collapsed);
  }

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
    this.dispatchEvent(new CustomEvent('scan-hover', { detail: key }));
  }

  private async confirm(row: VolumeCitation) {
    const id = row.citation.id;
    this.confirming = id;
    this.refused = null;
    const refused = await this.state.viewer
      .confirm(row)
      .then(() => null)
      .catch((err: unknown) => {
        if (err instanceof ApiError) return err;
        throw err;
      })
      .finally(() => {
        this.confirming = null;
      });
    if (refused !== null) this.refused = { id, error: refused.message };
  }

  private renderConfirm(row: VolumeCitation, current: boolean) {
    if (!current || row.link.certainty !== 'vision') return nothing;
    const id = row.citation.id;
    return html`
      <button
        class="confirm"
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
    const current =
      row.citation.id === this.state.viewer.source.get()?.citation.id;
    const box = boxOf(row);
    const key = box === null ? null : boxKey(box);
    const hovered = key !== null && key === this.hovered;
    return html`
      <li>
        <button
          class="row ${current ? 'current' : ''} ${hovered ? 'hovered' : ''}"
          aria-current=${current ? 'true' : nothing}
          @click=${() => {
            pickRow(this, this.state.viewer, row);
          }}
          @mouseenter=${() => {
            if (key !== null) this.hover(key);
          }}
          @mouseleave=${() => {
            if (key !== null) this.hover(null);
          }}
        >
          <span class="name">${this.nameOf(row)}</span>
        </button>
        ${this.renderConfirm(row, current)}
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

  // As the person dock does: the whole header hides the list, and hidden,
  // a rail with the heading brings it back.
  override render() {
    if (collapsed) {
      return html`
        <button class="rail" @click=${this.toggle}>
          <span aria-hidden="true">‹</span>
          <span class="rail-heading">People here</span>
        </button>
      `;
    }
    return html`
      <button class="head" @click=${this.toggle}>
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
