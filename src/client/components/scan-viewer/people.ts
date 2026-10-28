import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { easeOutCubic, reducedMotion } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { VolumeCitation } from '@/common/types';

import { RAIL_PX, SLIDE_MS } from '../side-dock';
import { boxOf, groupCitations, rowDates, rowName } from './citations';
import { controlStyles, scanPeopleStyles } from './styles';

// Collapsed or not for the rest of the visit, across Volumes and citations.
let collapsed = false;

// How long the list last shown stays up while the next Volume's citations
// load, before the pane says it's finding them.
const HOLD_MS = 300;

// The open pane's width.
const OPEN_PX = 256;

// Beside the scan: the people of the tree whose citations link the Image
// shown, grouped as `groupCitations` says. Clicking one picks them; the
// citation the viewer is on is marked. Hovering a row with an entry on the
// scan names the entry's key with `scan-hover`, and rows of the entry
// picked out there (`hovered`) are highlighted.
@customElement('sl-scan-people')
class ScanPeopleElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanPeopleStyles];

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

  // The painted width: trails `collapsed` through the slide, as the person
  // dock's does.
  @state() private shown = collapsed ? RAIL_PX : OPEN_PX;
  private slide: number | null = null;

  private readonly toggle = () => {
    collapsed = !collapsed;
    this.toggleAttribute('collapsed', collapsed);
    const to = collapsed ? RAIL_PX : OPEN_PX;
    if (reducedMotion()) this.shown = to;
    else this.startSlide(this.shown, to);
  };

  private startSlide(from: number, to: number) {
    this.stopSlide();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      this.shown = Math.round(from + (to - from) * easeOutCubic(t));
      this.slide = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.slide = requestAnimationFrame(step);
  }

  private stopSlide() {
    if (this.slide !== null) cancelAnimationFrame(this.slide);
    this.slide = null;
  }

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
    this.stopSlide();
  }

  protected override updated() {
    this.style.width = `${this.shown}px`;
  }

  private stopHold() {
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private hover(key: string | null) {
    this.dispatchEvent(new CustomEvent('scan-hover', { detail: key }));
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

  // As the person dock does: the whole header hides the list, and hidden,
  // a rail with the heading brings it back.
  override render() {
    return html`
      <div class="content" style="width:${OPEN_PX}px" ?inert=${collapsed}>
        <button class="head" @click=${this.toggle}>
          <h2>People here</h2>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
        <div class="list">${this.renderList()}</div>
      </div>
      <button class="rail" ?inert=${!collapsed} @click=${this.toggle}>
        <span aria-hidden="true">‹</span>
        <span class="rail-heading">People here</span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-people': ScanPeopleElement;
  }
}
