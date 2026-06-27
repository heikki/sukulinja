import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { apiUrl } from '@client/api';
import type { FamilyRow, PersonRow } from '@common/types';

import { buildChart } from './build';
import type { EmitOutput, Extents, Point } from './emit';
import { animateMove, captureFirstScreen } from './move';
import type { BoxGeom, EdgeGeom, FirstScreen } from './move';
import {
  dims,
  formatDates,
  formatName,
  renderBox,
  renderEdge
} from './renderer';
import { treeViewStyles } from './styles';
import { buildHash, parseHashView } from './url-state';
import type { Bounds, Defaults } from './url-state';
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

// Matches --sl-anim-fade; after this the enter-fade is done and the .enter
// class can be dropped so the next layout change starts clean.
const ENTER_FADE_MS = 200;

function sameSet<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  // Ids/keys on screen at the last *layout change*, so the next change can tell
  // which boxes/edges are genuinely new. Existing cards must not re-animate, so
  // only the ones absent here get the enter-fade. Empty until the first paint,
  // so the initial chart fades in.
  private prevBoxIds = new Set<number>();
  private prevEdgeKeys = new Set<string>();

  // The boxes/edges currently playing the enter-fade. Held across the extra
  // render the pin triggers (applyPendingPin → requestUpdate) so the fade isn't
  // cut off, then cleared by a timer once it has run its course.
  private enteringBoxIds = new Set<number>();
  private enteringEdgeKeys = new Set<string>();
  private enterClearTimer: ReturnType<typeof setTimeout> | null = null;

  // FLIP move state. boxPos / edgeGeom hold the on-screen chart's geometry so
  // the next refocus can read each surviving card's and edge's old screen spot
  // before the layout changes; flipFirst stashes those spots until the pinned
  // layout has settled, when runMoveAnimation slides each card and morphs each
  // edge from old → new. moveAnims tracks the in-flight Web Animations so a
  // rapid refocus can cancel them.
  private boxPos = new Map<string, BoxGeom>();
  private edgeGeom = new Map<string, EdgeGeom>();
  private flipFirst: FirstScreen | null = null;
  private movePending = false;
  // True when the pending move matches items by uid (a pure levels change keeps
  // the tree rooted); false when it must fall back to personId/baseKey (refocus
  // re-roots, so uids change). Set with flipFirst in captureFlipFirst.
  private moveByKey = false;
  private moveAnims: Animation[] = [];
  // uids of the cards currently sliding. They render first (painted behind) so
  // stationary cards stay on top as movers pass under them. A move generation
  // guards the async clear against a superseding move.
  private movingKeys = new Set<string>();
  private moveGen = 0;

  // Sticky flag: once the user has expressed a zoom (URL-supplied or
  // settled-after-gesture), the URL keeps emitting `zoom` even if it happens
  // to equal the auto-fit value. Avoids equality-comparing floats against
  // canvas-derived defaults.
  private hasUserZoom = false;
  private hasUserPan = false;

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

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    for (const anim of this.moveAnims) anim.cancel();
  }

  private readonly onHashChange = () => {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    const nextGen = parsed.gen ?? DEFAULT_GEN;
    if (nextGen !== this.gen) this.gen = nextGen;
    if (parsed.zoom !== null && parsed.zoom !== this.viewport.scale) {
      this.viewport.setScale(parsed.zoom);
      this.hasUserZoom = true;
    }
    if (parsed.pan !== null) {
      this.viewport.setPan(parsed.pan);
      this.hasUserPan = true;
    }
    const id = parsed.focusId;
    if (id === null || !this.persons.has(id) || id === this.focusId) return;
    // Pan was last set to pin the previously-focused box at click position;
    // without a fresh pin, back/forward would land the new focus at a stale
    // offset. Recenter on the canvas — unless the URL itself supplies a pan,
    // in which case the stored pan is authoritative and recentering would
    // clobber it.
    if (parsed.pan === null) this.viewport.beginRefocus(this.canvasCenter());
    this.focusId = id;
  };

  override willUpdate(changed: PropertyValues) {
    // Gen change rebuilds the chart with different extents, which would drift
    // Focus on screen since chart (0,0) is mapped through extents.min.
    // Capture Focus's current screen pixel so the post-rebuild pin keeps it
    // put.
    if (
      changed.has('gen') &&
      this.viewport.panReady &&
      !this.viewport.hasPendingPin
    ) {
      // Silent: every slider @input ticks gen, and we don't want the URL to
      // settle until the slider's @change fires on release.
      this.viewport.beginRefocus(this.viewport.chartToScreen({ x: 0, y: 0 }), {
        silent: true
      });
    }
    if (changed.has('focusId') || changed.has('gen')) {
      this.captureFlipFirst(changed);
    }
  }

  // FLIP "First": before the new layout renders, record each on-screen card's
  // current screen position. The DOM and viewport still reflect the old chart
  // here (render commits in update(), the pin lands in updated()), so
  // chartToScreen maps through the old pan/extents. Runs for both refocus and a
  // levels (gen) change; skipped on the very first focus (no previous chart).
  private captureFlipFirst(changed: PropertyValues) {
    if (changed.has('focusId') && changed.get('focusId') === null) return;
    if (
      !this.viewport.panReady ||
      this.boxPos.size === 0 ||
      prefersReducedMotion()
    ) {
      return;
    }
    // A pure levels change keeps the chart rooted, so uids are stable and match
    // exactly; any focus change re-roots, so match by personId/baseKey instead.
    this.moveByKey = changed.has('gen') && !changed.has('focusId');
    this.flipFirst = captureFirstScreen(
      this.boxPos,
      this.edgeGeom,
      (p) => this.viewport.chartToScreen(p),
      this.moveByKey
    );
    this.movePending = true;
  }

  override updated(_changed: PropertyValues) {
    if (this.loading || this.focusId === null) return;
    this.viewport.attachCanvas(this.queryCanvas());
    this.viewport.ensureInitialPan();
    // The pin shifts pan to keep the focused card fixed; capturing FLIP "Last"
    // before it lands would offset every card by the pin delta. When a pin was
    // pending it applies here and schedules one more render, so defer the move
    // to that next updated() (hadPin === false) where the DOM is final.
    const hadPin = this.viewport.hasPendingPin;
    this.viewport.applyPendingPin();
    if (this.movePending && !hadPin) this.runMoveAnimation();
  }

  // FLIP "Last" + "Play": now that the pinned layout has settled, slide each
  // surviving card from where it was (flipFirst) to where it landed and morph
  // each surviving edge to match. New cards/edges fade in instead (no entry in
  // flipFirst). Cancel any in-flight move so a rapid refocus doesn't stack.
  private runMoveAnimation() {
    const first = this.flipFirst;
    this.flipFirst = null;
    this.movePending = false;
    if (first === null) return;
    for (const anim of this.moveAnims) anim.cancel();
    const result = animateMove(
      {
        root: this.renderRoot,
        boxPos: this.boxPos,
        edgeGeom: this.edgeGeom,
        toScreen: (p) => this.viewport.chartToScreen(p),
        scale: this.viewport.scale
      },
      first,
      this.moveByKey
    );
    this.moveAnims = result.anims;
    this.movingKeys = result.movingBoxKeys;
    if (this.movingKeys.size === 0) return;
    // Re-render so the sliders sort behind the stationary cards, then clear once
    // the move ends (unless a newer move has taken over).
    const gen = ++this.moveGen;
    this.requestUpdate();
    void Promise.allSettled(this.moveAnims.map((a) => a.finished)).then(() => {
      if (this.moveGen !== gen) return;
      this.movingKeys = new Set();
      this.requestUpdate();
    });
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

  // Marks boxes/edges that appeared since the last layout as "entering" so they
  // alone get the fade. No-ops when the id-set is unchanged (the pin's extra
  // render, drags), keeping any in-flight fade running rather than restarting
  // it. A timer drops the class once the fade is done.
  private refreshEntering(chart: EmitOutput) {
    // Track "new person / new family" by personId / baseKey (relayout-invariant)
    // so a refocus, which changes every uid, doesn't fade the whole chart.
    const boxIds = new Set(chart.boxes.map((b) => b.personId));
    const edgeKeys = new Set(chart.lines.map((l) => l.baseKey));
    if (
      sameSet(boxIds, this.prevBoxIds) &&
      sameSet(edgeKeys, this.prevEdgeKeys)
    ) {
      return;
    }
    this.enteringBoxIds = new Set(
      [...boxIds].filter((id) => !this.prevBoxIds.has(id))
    );
    // Genuinely new edges fade in; surviving ones morph their geometry in
    // runMoveAnimation rather than fading.
    this.enteringEdgeKeys = new Set(
      [...edgeKeys].filter((k) => !this.prevEdgeKeys.has(k))
    );
    this.prevBoxIds = boxIds;
    this.prevEdgeKeys = edgeKeys;

    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    if (this.enteringBoxIds.size === 0 && this.enteringEdgeKeys.size === 0) {
      this.enterClearTimer = null;
      return;
    }
    this.enterClearTimer = setTimeout(() => {
      this.enterClearTimer = null;
      this.enteringBoxIds = new Set();
      this.enteringEdgeKeys = new Set();
      this.requestUpdate();
    }, ENTER_FADE_MS);
  }

  private renderCanvas(chart: EmitOutput) {
    const { min, max } = chart.extents;
    const vbX = min.x - SVG_MARGIN_PX;
    const vbY = min.y - SVG_MARGIN_PX;
    const vbW = max.x - min.x + SVG_MARGIN_PX * 2;
    const vbH = max.y - min.y + SVG_MARGIN_PX * 2;
    const { pan, scale, panReady, dragging } = this.viewport;
    // Keep the on-screen chart's geometry, keyed by unique uid, so the next
    // relayout can read each card's and edge's old spot (captureFlipFirst)
    // before it is replaced.
    this.boxPos = new Map(
      chart.boxes.map((b) => [b.key, { pos: b.pos, personId: b.personId }])
    );
    this.edgeGeom = new Map(
      chart.lines.map((l) => [
        l.key,
        { from: l.from, to: l.to, baseKey: l.baseKey }
      ])
    );
    // Refresh the entering sets only once nodes actually paint and only when
    // the layout has changed — the pin's extra render and drag re-renders keep
    // the same ids, so the in-flight fade is preserved rather than restarted.
    if (panReady) this.refreshEntering(chart);
    // While a move runs, paint the sliders first (behind) so the stationary
    // cards stay on top as movers pass under them. Stable sort keeps each
    // group's order otherwise.
    const boxes =
      this.movingKeys.size === 0
        ? chart.boxes
        : [...chart.boxes].sort(
            (a, b) =>
              (this.movingKeys.has(a.key) ? 0 : 1) -
              (this.movingKeys.has(b.key) ? 0 : 1)
          );
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
                <g class="edges">
                  ${repeat(
                    chart.lines,
                    (l) => l.key,
                    (l) => renderEdge(l, this.enteringEdgeKeys.has(l.baseKey))
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
                        entering: this.enteringBoxIds.has(b.personId)
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
