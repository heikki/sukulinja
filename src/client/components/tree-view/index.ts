import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { apiUrl } from '@client/api';
import type { FamilyRow, PersonRow } from '@common/types';

import { onAvatarReady } from './avatar-cache';
import { buildChart } from './build';
import type { EmitOutput, Extents, Point } from './emit';
import {
  dims,
  formatDates,
  formatName,
  renderBox,
  renderEdge
} from './renderer';
import { treeViewStyles } from './styles';
import { TransitionController } from './transition';
import type { RelayoutKind, Schedule } from './transition';
import { buildHash, parseHashView } from './url-state';
import type { Bounds, Defaults, ParsedView } from './url-state';
import { ViewportController } from './viewport';
import type { ViewportOptions } from './viewport';

const SVG_MARGIN_PX = 24;
const DEFAULT_FOCUS_ID = 1;
const DEFAULT_GEN = 2;
const MAX_GEN = 5;
const VIEWPORT_OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3 },
  dragThresholdPx: 4,
  svgMarginPx: SVG_MARGIN_PX
};

const URL_BOUNDS: Bounds = {
  maxGen: MAX_GEN,
  minZoom: VIEWPORT_OPTIONS.scaleBounds.minScale,
  maxZoom: VIEWPORT_OPTIONS.scaleBounds.maxScale
};
const URL_DEFAULTS: Defaults = { gen: DEFAULT_GEN };

const SEARCH_MIN_LEN = 2;
const SEARCH_MAX_RESULTS = 50;

// Mirror the active Schedule's Enter/Leave timing into the CSS custom properties
// the fade animations read (Move timing is applied JS-side). Set on .canvas so
// it cascades into the svg's .node/.edge/.ghosts.
function scheduleVars(schedule: Schedule) {
  const { enter, leave } = schedule;
  return [
    `--sl-enter-delay:${enter.delay}ms`,
    `--sl-enter-duration:${enter.duration}ms`,
    `--sl-enter-easing:${enter.easing}`,
    `--sl-leave-delay:${leave.delay}ms`,
    `--sl-leave-duration:${leave.duration}ms`,
    `--sl-leave-easing:${leave.easing}`
  ].join(';');
}

@customElement('sl-tree-view')
export class TreeViewElement extends LitElement {
  static override styles = treeViewStyles;

  @property({ type: Number, reflect: true }) gen = DEFAULT_GEN;

  @state() private persons = new Map<number, PersonRow>();
  @state() private focusId: number | null = null;
  @state() private loading = true;
  @state() private query = '';

  private readonly parentFamByPerson = new Map<number, FamilyRow>();
  private readonly spouseFamsByPerson = new Map<number, FamilyRow[]>();

  // Captured during render so the viewport port can resolve chart-local
  // coords to canvas pixels using the same extents the SVG was sized to.
  private chartExtents: Extents | null = null;

  // Sticky flag: once the user has expressed a zoom (URL-supplied or
  // settled-after-gesture), the URL keeps emitting `zoom` even if it happens
  // to equal the auto-fit value. Avoids equality-comparing floats against
  // canvas-derived defaults.
  private hasUserZoom = false;
  private hasUserPan = false;

  // Avatars crop in-browser off-render; repaint when each lands. See avatar-cache.
  private avatarUnsub: (() => void) | null = null;

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
      canvasRect: () => this.queryCanvas()?.getBoundingClientRect() ?? null,
      onSettle: () => {
        this.hasUserZoom = true;
        this.hasUserPan = true;
        this.writeUrl();
      }
    },
    VIEWPORT_OPTIONS
  );

  private readonly transition = new TransitionController(this, {
    toScreen: (p) => this.viewport.chartToScreen(p),
    scale: () => this.viewport.scale,
    root: () => this.renderRoot,
    panReady: () => this.viewport.panReady
  });

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    this.avatarUnsub = onAvatarReady(() => {
      this.requestUpdate();
    });
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
    this.avatarUnsub?.();
    this.avatarUnsub = null;
  }

  private readonly onHashChange = () => {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    const nextGen = parsed.gen ?? DEFAULT_GEN;
    if (nextGen !== this.gen) this.gen = nextGen;
    this.restoreViewportFromHash(parsed);

    const id = parsed.focusId;
    if (id === null || !this.persons.has(id) || id === this.focusId) return;
    // No stored pan means the prior box was pinned at its click position; pin the
    // new focus at canvas center so back/forward doesn't land it at that stale
    // offset. With a stored pan the deferred restore above is authoritative.
    if (parsed.pan === null) this.viewport.beginRefocus(this.canvasCenter());
    this.focusId = id;
  };

  // Defer the URL's pan/zoom to updated() (applyPendingViewport) rather than
  // mutating the viewport now: the Transition captures its FLIP "First" through
  // the live pan/scale in willUpdate, so an eager change would snapshot the new
  // viewport and flatten the slide. The click path defers the same way via the
  // pending pin, so a back/forward focus change animates like a click.
  private restoreViewportFromHash(parsed: ParsedView) {
    const nextZoom =
      parsed.zoom !== null && parsed.zoom !== this.viewport.scale
        ? parsed.zoom
        : null;
    if (nextZoom !== null) this.hasUserZoom = true;
    if (parsed.pan !== null) this.hasUserPan = true;
    this.viewport.restoreViewportDeferred(parsed.pan, nextZoom);
  }

  override willUpdate(changed: PropertyValues) {
    // Gen change rebuilds the chart with different extents, which would drift
    // Focus on screen since chart (0,0) is mapped through extents.min.
    // Capture Focus's current screen pixel so the post-rebuild pin keeps it
    // put.
    if (
      changed.has('gen') &&
      this.viewport.panReady &&
      !this.viewport.hasPendingViewport
    ) {
      // Silent: every slider @input ticks gen, and we don't want the URL to
      // settle until the slider's @change fires on release.
      this.viewport.beginRefocus(this.viewport.chartToScreen({ x: 0, y: 0 }), {
        silent: true
      });
    }
    if (changed.has('focusId') || changed.has('gen')) {
      this.captureRelayout(changed);
    }
  }

  // Snapshot the on-screen chart before a Focus or Generation Relayout so the
  // Transition can animate from it. A levels change keeps the chart rooted (a
  // Generation Relayout; match by unique key); any focus change re-roots (a
  // Focus Relayout; match by personId/baseKey). Skip the very first focus — no
  // previous chart to move from. The DOM and viewport still reflect the old
  // chart here (render commits in update(), the pin lands in updated()), so the
  // controller's capture maps through the old pan/extents.
  private captureRelayout(changed: PropertyValues) {
    const firstFocus =
      changed.has('focusId') && changed.get('focusId') === null;
    if (firstFocus) return;
    const kind: RelayoutKind =
      changed.has('gen') && !changed.has('focusId') ? 'generation' : 'focus';
    this.transition.capture(kind);
  }

  override updated(_changed: PropertyValues) {
    if (this.loading || this.focusId === null) return;
    this.viewport.attachCanvas(this.queryCanvas());
    this.viewport.ensureInitialPan();
    // A pending viewport mutation (the click pin, or a back/forward pan/zoom
    // restore) shifts pan to land the new layout; playing the Move before it lands
    // would offset every card by that delta. Applying it here schedules one more
    // render, so defer the move to that next updated() (deferred === false) where
    // the viewport is final. settle() no-ops when there is no captured move.
    const deferred = this.viewport.hasPendingViewport;
    this.viewport.applyPendingViewport();
    if (!deferred) this.transition.settle();
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

    this.restoreFromHash();
    this.loading = false;
  }

  private restoreFromHash() {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    if (parsed.gen !== null) this.gen = parsed.gen;
    // Pre-pin: applying scale before ensureInitialPan so chart (0,0) lands at
    // canvas center using the URL-supplied zoom, not the default 1.
    if (parsed.zoom !== null) {
      this.viewport.setScale(parsed.zoom);
      this.hasUserZoom = true;
    }
    if (parsed.pan !== null) {
      this.viewport.setPan(parsed.pan);
      this.hasUserPan = true;
    }
    if (parsed.focusId !== null && this.persons.has(parsed.focusId)) {
      this.focusId = parsed.focusId;
      return;
    }
    const def = this.pickDefaultFocus();
    this.focusId = def;
    if (def !== null) {
      history.replaceState(null, '', this.buildCurrentHash(def));
    }
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

  private setFocus(id: number, pinScreen: Point | null) {
    if (id === this.focusId) {
      this.query = '';
      return;
    }
    this.viewport.beginRefocus(pinScreen);
    this.focusId = id;
    // Two-step: push carries focus+gen+zoom only. The pin lands in updated()
    // and onSettle's writeUrl follows up with a replaceState that adds pan.
    history.pushState(
      null,
      '',
      buildHash(
        {
          focusId: id,
          gen: this.gen,
          pan: null,
          zoom: this.hasUserZoom ? this.viewport.scale : null
        },
        URL_DEFAULTS
      )
    );
    this.query = '';
  }

  private writeUrl() {
    if (this.focusId === null) return;
    history.replaceState(null, '', this.buildCurrentHash(this.focusId));
  }

  private buildCurrentHash(focusId: number) {
    return buildHash(
      {
        focusId,
        gen: this.gen,
        pan: this.hasUserPan ? this.viewport.pan : null,
        zoom: this.hasUserZoom ? this.viewport.scale : null
      },
      URL_DEFAULTS
    );
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

  private renderToolbar(results: PersonRow[]) {
    return html`
      <div class="toolbar">
        <slot name="brand"></slot>
        <div class="search">
          <input
            type="search"
            placeholder="Find person…"
            .value=${this.query}
            @input=${(e: InputEvent) => {
              this.query = (e.target as HTMLInputElement).value;
            }}
          />
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
        <label class="gen">
          Levels
          <input
            type="range"
            min="1"
            max=${MAX_GEN}
            step="1"
            .value=${String(this.gen)}
            @input=${(e: InputEvent) => {
              this.gen = parseInt((e.target as HTMLInputElement).value, 10);
            }}
            @change=${async () => {
              // Wait for the silent gen-change pin to land in updated()
              // before snapshotting pan into the URL.
              await this.updateComplete;
              this.writeUrl();
            }}
          />
          <span class="meta">${this.gen}</span>
        </label>
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
    // Hand the on-screen chart to the Transition so the next relayout can read
    // each card's and edge's old spot before it is replaced, and mark new
    // boxes/edges as entering. The pin's extra render and drag re-renders keep
    // the same ids, so an in-flight fade is preserved rather than restarted.
    this.transition.retainChart(chart);
    if (panReady) this.transition.refreshEntering(chart);
    // Entering cards render as a stable trailing block the paint-order sort
    // never reorders — reordering an SVG node restarts its CSS fade, so a
    // sorted entering card would flash each time a Move starts and ends. The
    // rest sort the sliders first (painted behind) so stationary cards stay on
    // top as movers pass under them; those carry no fade, and movers slide via
    // Web Animations, which survive a same-parent reorder. A stable sort keeps
    // each group's order otherwise.
    const movingKeys = this.transition.movingKeys;
    const enteringIds = this.transition.enteringBoxIds;
    const entering = chart.boxes.filter((b) => enteringIds.has(b.personId));
    const rest = chart.boxes.filter((b) => !enteringIds.has(b.personId));
    const sortedRest =
      movingKeys.size === 0
        ? rest
        : [...rest].sort(
            (a, b) =>
              (movingKeys.has(a.key) ? 0 : 1) - (movingKeys.has(b.key) ? 0 : 1)
          );
    const boxes = [...sortedRest, ...entering];
    const leaving = this.transition.leaving;
    return html`
      <div
        class="canvas ${dragging ? 'dragging' : ''}"
        style=${scheduleVars(this.transition.schedule)}
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
                ${this.renderGhosts(leaving)}
                <g class="edges">
                  ${repeat(
                    chart.lines,
                    (l) => l.key,
                    (l) =>
                      renderEdge(
                        l,
                        this.transition.enteringEdgeKeys.has(l.baseKey)
                      )
                  )}
                </g>
                ${repeat(
                  boxes,
                  (b) => b.key,
                  (b) => {
                    const person = this.persons.get(b.personId);
                    if (person === undefined) return nothing;
                    return renderBox(
                      b,
                      person,
                      {
                        focus: b.personId === this.focusId,
                        entering: this.transition.enteringBoxIds.has(b.personId)
                      },
                      () => {
                        if (this.viewport.dragMoved) return;
                        // Pin from layout coords rather than
                        // getBoundingClientRect — label widths vary by
                        // name length and would drift the captured
                        // "center" across back-and-forth toggles.
                        this.setFocus(
                          b.personId,
                          this.viewport.chartToScreen(b.pos)
                        );
                      }
                    );
                  }
                )}
              </svg>
            </div>`
          : nothing}
      </div>
    `;
  }

  // Departing boxes/edges, drawn through the normal renderers so they look
  // identical to live cards, in a non-interactive layer translated so each lands
  // back at its last screen spot while it fades out.
  private renderGhosts(leaving: TransitionController['leaving']) {
    if (leaving.boxes.length === 0 && leaving.edges.length === 0) {
      return nothing;
    }
    const { x, y } = leaving.offset;
    // Scale about the SVG user origin (chart 0,0 = LEAVE_REF) the offset lands, so
    // a zoom-changing back/forward step fades the ghosts at their old size.
    return svg`
      <g
        class="ghosts"
        style="transform: translate(${x}px, ${y}px) scale(${leaving.scale}); transform-origin: 0 0"
      >
        ${leaving.edges.map((l) => renderEdge(l, false, true))}
        ${leaving.boxes.map((b) => {
          const person = this.persons.get(b.personId);
          if (person === undefined) return nothing;
          return renderBox(b, person, {
            focus: false,
            entering: false,
            ghost: true
          });
        })}
      </g>
    `;
  }

  override render() {
    // The toolbar always renders so the dataset name / home link (slot="brand")
    // stays visible through the loading and empty states; the body below swaps.
    const results = this.loading ? [] : this.filteredSearch();
    return html`${this.renderToolbar(results)}${this.renderBody()}`;
  }

  private renderBody() {
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
        levels: this.gen
      },
      dims
    );
    if (chart === null) {
      return html`<div class="empty">No data for selected focus.</div>`;
    }
    this.chartExtents = chart.extents;
    return this.renderCanvas(chart);
  }
}
