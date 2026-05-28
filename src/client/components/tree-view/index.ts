import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { apiUrl } from '@client/api';
import type { FamilyRow, PersonRow } from '@common/types';

import { boxRenderer, formatDates, formatName } from './box-renderer';
import { buildChart } from './build';
import type { Box, EmitOutput, Extents, Point } from './emit';
import { treeViewStyles } from './styles';
import { ViewportController } from './viewport';
import type { ViewportOptions } from './viewport';

const SVG_MARGIN_PX = 24;
const DEFAULT_FOCUS_ID = 1;
const VIEWPORT_OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3 },
  dragThresholdPx: 4,
  svgMarginPx: SVG_MARGIN_PX
};

const FOCUS_HASH_RE = /^#\/person\/(?<id>\d+)$/;
const SEARCH_MIN_LEN = 2;
const SEARCH_MAX_RESULTS = 50;

function readFocusFromHash() {
  const m = FOCUS_HASH_RE.exec(location.hash);
  const id = m?.groups?.id;
  if (id === undefined) return null;
  return parseInt(id, 10);
}

@customElement('sl-tree-view')
export class TreeViewElement extends LitElement {
  static override styles = treeViewStyles;

  @property({ type: Number, reflect: true }) levels = 1;

  @state() private persons = new Map<number, PersonRow>();
  @state() private focusId: number | null = null;
  @state() private loading = true;
  @state() private query = '';

  private readonly parentFamByPerson = new Map<number, FamilyRow>();
  private readonly spouseFamsByPerson = new Map<number, FamilyRow[]>();

  // Captured during render so the viewport port can resolve chart-local
  // coords to canvas pixels using the same extents the SVG was sized to.
  private chartExtents: Extents | null = null;

  private readonly viewport = new ViewportController(
    this,
    {
      chartExtents: () => this.chartExtents,
      canvasSize: () => {
        const c = this.queryCanvas();
        return c === null
          ? null
          : { width: c.clientWidth, height: c.clientHeight };
      },
      canvasRect: () => this.queryCanvas()?.getBoundingClientRect() ?? null
    },
    VIEWPORT_OPTIONS
  );

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
  }

  private readonly onHashChange = () => {
    const id = readFocusFromHash();
    if (id === null || !this.persons.has(id) || id === this.focusId) return;
    // Pan was last set to pin the previously-focused box at click position;
    // without a fresh pin, back/forward would land the new focus at a stale
    // offset. Recenter on the canvas instead.
    this.viewport.beginRefocus(this.canvasCenter());
    this.focusId = id;
  };

  override willUpdate(changed: PropertyValues) {
    // Levels change rebuilds the chart with different extents, which would
    // drift Focus on screen since chart (0,0) is mapped through extents.min.
    // Capture Focus's current screen pixel so the post-rebuild pin keeps it
    // put. Refocus already supplies its own pin via setFocus / onHashChange.
    if (
      changed.has('levels') &&
      this.viewport.panReady &&
      !this.viewport.hasPendingPin
    ) {
      this.viewport.beginRefocus(this.viewport.chartToScreen({ x: 0, y: 0 }));
    }
  }

  override updated(_changed: PropertyValues) {
    if (this.loading || this.focusId === null) return;
    this.viewport.attachCanvas(this.queryCanvas());
    this.viewport.ensureInitialPan();
    this.viewport.applyPendingPin();
  }

  private queryCanvas() {
    return this.renderRoot.querySelector<HTMLElement>('.canvas');
  }

  private canvasCenter(): Point | null {
    const canvas = this.queryCanvas();
    if (canvas === null) return null;
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  }

  private async load() {
    const [personsRes, familiesRes] = await Promise.all([
      fetch(apiUrl('/api/persons')),
      fetch(apiUrl('/api/families'))
    ]);
    const persons = (await personsRes.json()) as PersonRow[];
    const families = (await familiesRes.json()) as FamilyRow[];

    this.persons = new Map(persons.map((p) => [p.id, p]));
    this.parentFamByPerson.clear();
    this.spouseFamsByPerson.clear();
    for (const f of families) {
      for (const cid of f.child_ids) this.parentFamByPerson.set(cid, f);
      if (f.husband_id !== null) this.appendSpouseFam(f.husband_id, f);
      if (f.wife_id !== null) this.appendSpouseFam(f.wife_id, f);
    }

    const hashId = readFocusFromHash();
    if (hashId !== null && this.persons.has(hashId)) {
      this.focusId = hashId;
    } else {
      const def = this.pickDefaultFocus();
      this.focusId = def;
      if (def !== null) history.replaceState(null, '', `#/person/${def}`);
    }
    this.loading = false;
  }

  private appendSpouseFam(personId: number, fam: FamilyRow) {
    let arr = this.spouseFamsByPerson.get(personId);
    if (arr === undefined) {
      arr = [];
      this.spouseFamsByPerson.set(personId, arr);
    }
    arr.push(fam);
  }

  private pickDefaultFocus() {
    if (this.persons.has(DEFAULT_FOCUS_ID)) return DEFAULT_FOCUS_ID;
    const first = this.persons.keys().next();
    return first.done === true ? null : first.value;
  }

  resetFocus() {
    if (this.loading) return;
    const def = this.pickDefaultFocus();
    if (def === null) return;
    this.setFocus(def, this.canvasCenter());
  }

  private setFocus(id: number, pinScreen: Point | null) {
    if (id === this.focusId) {
      this.query = '';
      return;
    }
    this.viewport.beginRefocus(pinScreen);
    this.focusId = id;
    history.pushState(null, '', `#/person/${id}`);
    this.query = '';
  }

  private filteredSearch() {
    const q = this.query.trim().toLowerCase();
    if (q.length < SEARCH_MIN_LEN) return [];
    const out: PersonRow[] = [];
    for (const p of this.persons.values()) {
      const key = `${p.given ?? ''} ${p.surname ?? ''}`.toLowerCase();
      if (key.includes(q)) {
        out.push(p);
        if (out.length >= SEARCH_MAX_RESULTS) break;
      }
    }
    return out;
  }

  private renderBox(box: Box) {
    const person = this.persons.get(box.personId);
    if (person === undefined) return nothing;
    return boxRenderer.render(
      box,
      person,
      box.personId === this.focusId,
      () => {
        if (this.viewport.dragMoved) return;
        // Pin from layout coords rather than getBoundingClientRect — label
        // widths vary by name length and would drift the captured "center"
        // across back-and-forth toggles.
        this.setFocus(box.personId, this.viewport.chartToScreen(box.pos));
      }
    );
  }

  private renderToolbar(
    focusPerson: PersonRow | undefined,
    results: PersonRow[]
  ) {
    return html`
      <div class="toolbar">
        <input
          type="search"
          placeholder="Find person…"
          .value=${this.query}
          @input=${(e: InputEvent) => {
            this.query = (e.target as HTMLInputElement).value;
          }}
        />
        <label class="levels">
          Levels
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            .value=${String(this.levels)}
            @input=${(e: InputEvent) => {
              this.levels = parseInt((e.target as HTMLInputElement).value, 10);
            }}
          />
          <span class="meta">${this.levels}</span>
        </label>
        ${focusPerson === undefined
          ? nothing
          : html`<span class="meta">Focus: ${formatName(focusPerson)}</span>`}
        ${results.length > 0
          ? html`<div class="results">
              ${results.map((p) => {
                const dates = formatDates(p);
                return html`
                  <button
                    @click=${() => {
                      this.setFocus(p.id, this.canvasCenter());
                    }}
                  >
                    ${formatName(p)}
                    ${dates.length > 0
                      ? html`<span class="meta">(${dates})</span>`
                      : nothing}
                  </button>
                `;
              })}
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderCanvas(chart: EmitOutput) {
    const { min, max } = chart.extents;
    const vbX = min.x - SVG_MARGIN_PX;
    const vbY = min.y - SVG_MARGIN_PX;
    const vbW = max.x - min.x + SVG_MARGIN_PX * 2;
    const vbH = max.y - min.y + SVG_MARGIN_PX * 2;
    const { pan, scale, panReady, dragging } = this.viewport;
    return html`
      <div
        class="canvas ${dragging ? 'dragging' : ''}"
        @mousedown=${this.viewport.onMouseDown}
        @dblclick=${this.viewport.onDblClick}
      >
        ${panReady
          ? html`<div
              class="pan"
              style="transform: translate(${Math.round(pan.x)}px, ${Math.round(
                pan.y
              )}px)"
            >
              <svg
                viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
                width=${vbW * scale}
                height=${vbH * scale}
              >
                <defs>
                  <clipPath id="sl-avatar" clipPathUnits="userSpaceOnUse">
                    <circle
                      cx=${boxRenderer.avatarCx}
                      cy=${boxRenderer.boxH / 2}
                      r=${boxRenderer.avatarR}
                    />
                  </clipPath>
                </defs>
                <g class="edges">
                  ${repeat(
                    chart.lines,
                    (l) => l.key,
                    (l) => svg`<path
                      class="edge"
                      d="M ${l.from.x} ${l.from.y} L ${l.to.x} ${l.to.y}"
                    />`
                  )}
                </g>
                ${repeat(
                  chart.boxes,
                  (b) => b.personId,
                  (b) => this.renderBox(b)
                )}
              </svg>
            </div>`
          : nothing}
      </div>
    `;
  }

  override render() {
    if (this.loading) return html`<div class="empty">Loading…</div>`;
    if (this.focusId === null) {
      return html`<div class="empty">No people in database.</div>`;
    }
    const chart = buildChart(
      this.focusId,
      {
        persons: this.persons,
        parentFamByPerson: this.parentFamByPerson,
        spouseFamsByPerson: this.spouseFamsByPerson,
        levels: this.levels
      },
      boxRenderer
    );
    if (chart === null) {
      return html`<div class="empty">No data for selected focus.</div>`;
    }
    this.chartExtents = chart.extents;
    const results = this.filteredSearch();
    const focusPerson = this.persons.get(this.focusId);
    return html`${this.renderToolbar(focusPerson, results)}${this.renderCanvas(
      chart
    )}`;
  }
}
