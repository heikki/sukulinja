import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { apiUrl } from '@client/api';
import type { FamilyRow, PersonRow } from '@common/types';

import { boxRenderer, formatDates, formatName } from './box-renderer';
import { buildChart } from './build';
import type { Box, EmitOutput, Extents, Point } from './emit';
import { startMomentumPan } from './momentum-pan';
import type { MomentumHandle, MomentumOptions } from './momentum-pan';
import { treeViewStyles } from './styles';
import {
  chartToScreen,
  fitTo,
  pinChartPointAtScreen,
  zoomAt
} from './viewport-transform';
import type { FitOptions, ScaleBounds } from './viewport-transform';

const SVG_MARGIN_PX = 24;
const DRAG_THRESHOLD_PX = 4;
const DEFAULT_FOCUS_ID = 1;
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.25, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
const FIT_OPTIONS: FitOptions = { maxScale: 1, marginPx: 24 };
const MOMENTUM_OPTIONS: MomentumOptions = {
  tauMs: 250,
  minV: 0.02,
  minReleaseV: 0.3
};

interface DragOrigin {
  mouse: Point;
  pan: Point;
}

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
  @state() private pan = { x: 0, y: 0 };
  @state() private scale = 1;
  @state() private panReady = false;
  @state() private dragging = false;

  private readonly parentFamByPerson = new Map<number, FamilyRow>();
  private readonly spouseFamsByPerson = new Map<number, FamilyRow[]>();

  private dragOrigin: DragOrigin | null = null;
  private dragMoved = false;
  private pendingPinScreen: Point | null = null;
  // Captured during render so updated() / pin math can resolve chart-local
  // coords to canvas pixels using the same extents the SVG was sized to.
  private chartExtents: Extents | null = null;

  private wheelTarget: HTMLElement | null = null;
  // Two most-recent pointer samples during drag — enough to compute the
  // release velocity for momentum pan without smoothing noise from older
  // samples that span across direction changes.
  private dragSamples: Array<{ t: number; x: number; y: number }> = [];
  private momentum: MomentumHandle | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    if (this.wheelTarget !== null) {
      this.wheelTarget.removeEventListener('wheel', this.onWheel);
      this.wheelTarget = null;
    }
    this.cancelMomentum();
  }

  private attachWheelListener() {
    // Attach directly (not via Lit's @wheel) so we can pass passive:false —
    // required for preventDefault to suppress page scroll. The canvas only
    // appears once loading completes, so this can't go in firstUpdated.
    if (this.wheelTarget !== null) return;
    const canvas = this.queryCanvas();
    if (canvas === null) return;
    this.wheelTarget = canvas;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private readonly onHashChange = () => {
    const id = readFocusFromHash();
    if (id === null || !this.persons.has(id) || id === this.focusId) return;
    // Pan was last set to pin the previously-focused box at click position;
    // without a fresh pin, back/forward would land the new focus at a stale
    // offset. Recenter on the canvas instead.
    this.pendingPinScreen = this.pinFromCanvasCenter();
    this.focusId = id;
  };

  override willUpdate(changed: PropertyValues) {
    // Levels change rebuilds the chart with different extents, which would
    // drift Focus on screen since chart (0,0) is mapped through extents.min.
    // Capture Focus's current screen pixel so updated() re-pins it after the
    // new chart is rendered. (Refocus already pins via setFocus; dragging /
    // search-bar updates don't change extents and so don't need this.)
    if (
      changed.has('levels') &&
      this.panReady &&
      this.pendingPinScreen === null
    ) {
      this.pendingPinScreen = this.pinFromNode({ x: 0, y: 0 });
    }
  }

  override updated(_changed: PropertyValues) {
    if (this.loading || this.focusId === null) return;
    this.attachWheelListener();
    if (!this.panReady) {
      this.measureInitialPan();
      return;
    }
    const vbo = this.viewBoxOrigin();
    if (this.pendingPinScreen !== null && vbo !== null) {
      // After a focus change, the new focus lives at chart (0, 0). Set pan so
      // the captured pendingPinScreen pixel coincides with the new focus at
      // the current scale — eliminating the "jump" effect on refocus.
      this.pan = pinChartPointAtScreen(
        this.scale,
        { x: 0, y: 0 },
        this.pendingPinScreen,
        vbo
      );
      this.pendingPinScreen = null;
    }
  }

  private viewBoxOrigin(): Point | null {
    if (this.chartExtents === null) return null;
    return {
      x: this.chartExtents.min.x - SVG_MARGIN_PX,
      y: this.chartExtents.min.y - SVG_MARGIN_PX
    };
  }

  private measureInitialPan() {
    const canvas = this.queryCanvas();
    if (canvas === null || canvas.clientWidth === 0) return;
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return;
    this.pan = pinChartPointAtScreen(
      this.scale,
      { x: 0, y: 0 },
      { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
      vbo
    );
    this.panReady = true;
  }

  private queryCanvas() {
    return this.renderRoot.querySelector<HTMLElement>('.canvas');
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
    this.setFocus(def, this.pinFromCanvasCenter());
  }

  private setFocus(id: number, pinScreen: Point | null) {
    if (id === this.focusId) {
      this.query = '';
      return;
    }
    this.cancelMomentum();
    if (pinScreen !== null) this.pendingPinScreen = pinScreen;
    this.focusId = id;
    history.pushState(null, '', `#/person/${id}`);
    this.query = '';
  }

  // Compute pin position directly from layout coords — using getBoundingClientRect
  // on the <g> would include text labels whose width varies by name length,
  // shifting the captured "center" inconsistently and accumulating drift over
  // back-and-forth toggles.
  private pinFromNode(node: Point) {
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return null;
    return chartToScreen({ pan: this.pan, scale: this.scale }, node, vbo);
  }

  private pinFromCanvasCenter() {
    const canvas = this.queryCanvas();
    if (canvas === null) return null;
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  }

  private readonly onCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.cancelMomentum();
    this.dragOrigin = {
      mouse: { x: e.clientX, y: e.clientY },
      pan: { ...this.pan }
    };
    this.dragMoved = false;
    this.dragSamples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (this.dragOrigin === null) return;
    const dx = e.clientX - this.dragOrigin.mouse.x;
    const dy = e.clientY - this.dragOrigin.mouse.y;
    if (!this.dragMoved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      this.dragMoved = true;
      this.dragging = true;
    }
    if (!this.dragMoved) return;
    const nextX = this.dragOrigin.pan.x + dx;
    const nextY = this.dragOrigin.pan.y + dy;
    this.dragSamples.push({
      t: performance.now(),
      x: e.clientX,
      y: e.clientY
    });
    if (this.dragSamples.length > 2) this.dragSamples.shift();
    if (nextX === this.pan.x && nextY === this.pan.y) return;
    this.pan = { x: nextX, y: nextY };
  };

  private readonly onMouseUp = () => {
    this.dragOrigin = null;
    if (!this.dragging) {
      this.dragSamples = [];
      return;
    }
    this.maybeStartMomentum();
    this.dragSamples = [];
    setTimeout(() => {
      this.dragging = false;
    }, 0);
  };

  private maybeStartMomentum() {
    if (this.dragSamples.length < 2) return;
    const [prev, last] = this.dragSamples as [
      { t: number; x: number; y: number },
      { t: number; x: number; y: number }
    ];
    const dt = last.t - prev.t;
    if (dt <= 0) return;
    this.momentum = startMomentumPan(
      (last.x - prev.x) / dt,
      (last.y - prev.y) / dt,
      MOMENTUM_OPTIONS,
      (dx, dy) => {
        this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
      }
    );
  }

  private cancelMomentum() {
    this.momentum?.cancel();
    this.momentum = null;
  }

  private readonly onCanvasDblClick = (e: MouseEvent) => {
    // Only fit on background dblclick — clicks on a box already focus that
    // person and shouldn't also reset the view.
    const path = e.composedPath();
    if (
      path.some((n) => n instanceof Element && n.classList.contains('node'))
    ) {
      return;
    }
    const canvas = this.queryCanvas();
    const vbo = this.viewBoxOrigin();
    if (canvas === null || vbo === null || this.chartExtents === null) return;
    this.cancelMomentum();
    const next = fitTo(
      this.chartExtents,
      vbo,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      FIT_OPTIONS
    );
    this.pan = next.pan;
    this.scale = next.scale;
  };

  private readonly onWheel = (e: WheelEvent) => {
    if (this.wheelTarget === null) return;
    e.preventDefault();
    this.cancelMomentum();
    const rect = this.wheelTarget.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_K);
    const next = zoomAt(
      { pan: this.pan, scale: this.scale },
      cursor,
      factor,
      SCALE_BOUNDS
    );
    this.pan = next.pan;
    this.scale = next.scale;
  };

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
        if (this.dragMoved) return;
        this.setFocus(box.personId, this.pinFromNode(box.pos));
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
                      this.setFocus(p.id, this.pinFromCanvasCenter());
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
    return html`
      <div
        class="canvas ${this.dragging ? 'dragging' : ''}"
        @mousedown=${this.onCanvasMouseDown}
        @dblclick=${this.onCanvasDblClick}
      >
        ${this.panReady
          ? html`<div
              class="pan"
              style="transform: translate(${Math.round(
                this.pan.x
              )}px, ${Math.round(this.pan.y)}px)"
            >
              <svg
                viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
                width=${vbW * this.scale}
                height=${vbH * this.scale}
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
