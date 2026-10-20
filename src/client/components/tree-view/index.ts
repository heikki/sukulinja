import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { ApiError } from '@client/dataset-api';
import { preferredGenerations } from '@client/generations';
import { appState } from '@client/state';
import type { AppState } from '@client/state';
import type { PersonRow } from '@common/types';

import '../person-panel';
import '../scan-viewer';
import '../side-dock';

import { detailsWidth, setDetailsWidth } from '../person-panel/helpers';

import '../person-search';
import '../settings';

import type { PickEvent } from '../person-search';
import type { ScanPersonEvent } from '../scan-viewer';
import type { GenerationsChangeEvent } from '../settings';
import type { OpenChangeEvent, WidthChangeEvent } from '../side-dock';
import { avatarHref, onAvatarReady } from './avatar-cache';
import { buildChart } from './build';
import { familiesByPerson, otherSpouseOf } from './build/indices';
import { comfortOf } from './comfort';
import type { EmitOutput, Extents, Point } from './emit';
import { dims, formatName, renderBox, renderEdge } from './renderer';
import { treeViewStyles } from './styles';
import { TransitionController } from './transition';
import type { RelayoutKind } from './transition';
import { renderGhosts, scheduleVars } from './transition/paint';
import { buildHash, parseHashView } from './url-state';
import type { Bounds, ParsedView } from './url-state';
import { ViewportController } from './viewport';
import type { Comfort, ViewportOptions } from './viewport';

const SVG_MARGIN_PX = 24;
const DEFAULT_ROOT_ID = 1;
const VIEWPORT_OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3 },
  dragThresholdPx: 4,
  svgMarginPx: SVG_MARGIN_PX
};

const URL_BOUNDS: Bounds = {
  minZoom: VIEWPORT_OPTIONS.scaleBounds.minScale,
  maxZoom: VIEWPORT_OPTIONS.scaleBounds.maxScale
};

@customElement('sl-tree-view')
export class TreeViewElement extends SignalWatcher(LitElement) {
  static override styles = treeViewStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ type: Number, reflect: true }) gen = preferredGenerations();
  // The dataset's name, for the Settings popover's way back to the chooser.
  @property({ attribute: false }) datasetName: string | null = null;

  @state() private persons = new Map<number, PersonRow>();
  @state() private rootId: number | null = null;
  @state() private loading = true;
  // Why the dataset couldn't be loaded, in the app's words.
  @state() private loadError: string | null = null;
  // Closed on entering a dataset; opening it lasts only for this visit.
  @state() private details = false;
  @state() private detailsWidth = detailsWidth();

  private families = familiesByPerson([]);

  // Captured during render so the viewport port can resolve chart-local
  // coords to canvas pixels using the same extents the SVG was sized to.
  private chartExtents: Extents | null = null;
  private chartComfort: Comfort | null = null;
  // Who the chart draws, so selecting anyone else rebuilds it around them.
  private drawnIds = new Set<number>();

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
      comfort: () => this.chartComfort,
      onSettle: () => {
        this.hasUserZoom = true;
        this.hasUserPan = true;
        this.writeUrl();
      },
      onHold: () => {
        this.writeUrl();
      }
    },
    VIEWPORT_OPTIONS
  );

  private readonly transition = new TransitionController(this, {
    toScreen: (p) => this.viewport.chartToScreen(p),
    scale: () => this.viewport.scale,
    root: () => this.renderRoot,
    panReady: () => this.viewport.panReady,
    camera: () => this.viewport.takeNudgeShift()
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

  // Back or forward waits on a change pending in the Scan viewer; editing
  // on puts the URL back.
  private readonly onHashChange = () => {
    const back =
      this.rootId === null ? null : this.buildCurrentHash(this.rootId);
    this.state.viewer.leave(this.followHash, () => {
      if (back !== null) history.replaceState(null, '', back);
    });
  };

  private readonly followHash = () => {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    this.restoreViewportFromHash(parsed);

    const id = parsed.rootId;
    if (id === null || !this.persons.has(id)) return;
    this.state.select(this.knownOr(parsed.selectedId, id));
    if (id === this.rootId) return;
    // No stored pan means the prior box was pinned at its click position; pin the
    // new root at canvas center so back/forward doesn't land it at that stale
    // offset. With a stored pan the deferred restore above is authoritative.
    if (parsed.pan === null) {
      this.viewport.beginReroot(this.canvasCenter(), { nudge: true });
    }
    this.rootId = id;
  };

  // Defer the URL's pan/zoom to updated() (applyPendingViewport) rather than
  // mutating the viewport now: the Transition captures its FLIP "First" through
  // the live pan/scale in willUpdate, so an eager change would snapshot the new
  // viewport and flatten the slide. The click path defers the same way via the
  // pending pin, so a back/forward root change animates like a click.
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
    // Root on screen since chart (0,0) is mapped through extents.min.
    // Capture Root's current screen pixel so the post-rebuild pin keeps it
    // put.
    if (
      changed.has('gen') &&
      this.viewport.panReady &&
      !this.viewport.hasPendingViewport
    ) {
      // Silent: the Generations handler writes the URL itself once the change
      // has landed.
      this.viewport.beginReroot(this.viewport.chartToScreen({ x: 0, y: 0 }), {
        silent: true
      });
    }
    if (changed.has('rootId') || changed.has('gen')) {
      this.captureRelayout(changed);
    }
  }

  // Snapshot the on-screen chart before a Root or Generation Relayout so the
  // Transition can animate from it. A Generation limit change keeps the chart rooted (a
  // Generation Relayout; match by unique key); any root change re-roots (a
  // Root Relayout; match by personId/baseKey). Skip the very first root — no
  // previous chart to move from. The DOM and viewport still reflect the old
  // chart here (render commits in update(), the pin lands in updated()), so the
  // controller's capture maps through the old pan/extents.
  private captureRelayout(changed: PropertyValues) {
    const firstRoot = changed.has('rootId') && changed.get('rootId') === null;
    if (firstRoot) return;
    const kind: RelayoutKind =
      changed.has('gen') && !changed.has('rootId') ? 'generation' : 'root';
    this.transition.capture(kind);
  }

  override updated(_changed: PropertyValues) {
    if (this.loading || this.rootId === null) return;
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

  // Root and every spouse they have.
  private coreIds(rootId: number) {
    const ids = new Set([rootId]);
    for (const fam of this.families.spouseFamsByPerson.get(rootId) ?? []) {
      const spouse = otherSpouseOf(fam, rootId);
      if (spouse !== null) ids.add(spouse);
    }
    return ids;
  }

  private canvasCenter(): Point | null {
    const canvas = this.queryCanvas();
    if (canvas === null) return null;
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  }

  private async load() {
    try {
      const { api } = this.state;
      const [persons, families] = await Promise.all([
        api.persons(),
        api.families()
      ]);
      this.persons = new Map(persons.map((p) => [p.id, p]));
      this.families = familiesByPerson(families);
      this.restoreFromHash();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.loadError = err.message;
    }
    this.loading = false;
  }

  private restoreFromHash() {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
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
    if (parsed.rootId !== null && this.persons.has(parsed.rootId)) {
      this.rootId = parsed.rootId;
      this.state.select(this.knownOr(parsed.selectedId, parsed.rootId));
      return;
    }
    const def = this.pickDefaultRoot();
    this.rootId = def;
    if (def !== null) {
      this.state.select(def);
      history.replaceState(null, '', this.buildCurrentHash(def));
    }
  }

  // The persons and families the chart and the dock read.
  private get indices() {
    const { persons, families, gen } = this;
    return { persons, ...families, levels: gen };
  }

  // The person, if the dataset has them, or else the fallback.
  private knownOr(id: number | null, fallback: number) {
    return id !== null && this.persons.has(id) ? id : fallback;
  }

  private pickDefaultRoot() {
    if (this.persons.has(DEFAULT_ROOT_ID)) return DEFAULT_ROOT_ID;
    const first = this.persons.keys().next();
    return first.done === true ? null : first.value;
  }

  // The chart is rebuilt around them, and the dock shows them, once a
  // change pending in the Scan viewer is saved or discarded.
  private setRoot(id: number, pinScreen: Point | null) {
    this.state.viewer.leave(() => {
      this.reroot(id, pinScreen);
    });
  }

  private reroot(id: number, pinScreen: Point | null) {
    if (id === this.rootId) {
      this.select(id);
      return;
    }
    this.viewport.beginReroot(pinScreen, { nudge: true });
    this.rootId = id;
    this.state.select(id);
    // Two-step: push carries root+zoom only. The pin lands in updated()
    // and onSettle's writeUrl follows up with a replaceState that adds pan.
    history.pushState(
      null,
      '',
      buildHash({
        rootId: id,
        pan: null,
        zoom: this.hasUserZoom ? this.viewport.scale : null
      })
    );
  }

  // The dock shows them; the chart stays as it is if it draws them, and is
  // built around them if not. Waits on a change pending in the Scan
  // viewer, as `setRoot` does.
  private select(id: number) {
    if (id === this.selectedId) return;
    this.state.viewer.leave(() => {
      this.selectNow(id);
    });
  }

  private selectNow(id: number) {
    if (id === this.selectedId) return;
    if (!this.drawnIds.has(id)) {
      this.setRoot(id, this.canvasCenter());
      return;
    }
    this.state.select(id);
    this.writeUrl();
  }

  private get selectedId() {
    return this.state.selected.id.get();
  }

  private writeUrl() {
    if (this.rootId === null) return;
    history.replaceState(null, '', this.buildCurrentHash(this.rootId));
  }

  private buildCurrentHash(rootId: number) {
    return buildHash({
      rootId,
      selectedId: this.selectedId,
      pan: this.hasUserPan ? this.viewport.pan : null,
      zoom: this.hasUserZoom ? this.viewport.scale : null
    });
  }

  // Search and Settings, floating over the chart's top-right corner. Away
  // while the Scan viewer covers the chart: its own row ends in Close there.
  private renderCorner() {
    if (this.state.viewer.source.get() !== null) return nothing;
    return html`
      <div class="corner">
        <sl-person-search
          .persons=${this.persons}
          @pick=${(e: PickEvent) => {
            this.setRoot(e.detail.id, this.canvasCenter());
          }}
        ></sl-person-search>
        <sl-settings
          .generations=${this.gen}
          .datasetName=${this.datasetName}
          @generations-change=${async (e: GenerationsChangeEvent) => {
            this.gen = e.detail;
            // Wait for the silent gen-change pin to land in updated() before
            // snapshotting pan into the URL.
            await this.updateComplete;
            this.writeUrl();
          }}
        ></sl-settings>
      </div>
    `;
  }

  // Whom the dock shows: the person whose details the panel has, so the
  // header changes with the panel rather than before it; the Selected
  // person until any arrive, or when theirs couldn't load.
  private dockPerson() {
    const id = this.selectedId;
    const selected = id === null ? undefined : this.persons.get(id);
    const { details, error } = this.state.selected;
    const shownId = details.get()?.id;
    if (shownId === undefined || error.get() !== null) return selected;
    return this.persons.get(shownId) ?? selected;
  }

  private renderDock() {
    const selected = this.dockPerson();
    const { mediaUrl } = this.state.api;
    const photo =
      selected === undefined ? null : avatarHref(selected, mediaUrl);
    return html`
      <sl-side-dock
        label="details"
        heading=${selected === undefined ? '' : formatName(selected)}
        ?open=${this.details}
        .width=${this.detailsWidth}
        @open-change=${(e: OpenChangeEvent) => {
          this.details = e.detail;
        }}
        @width-change=${(e: WidthChangeEvent) => {
          this.detailsWidth = e.detail;
          setDetailsWidth(e.detail);
        }}
      >
        <sl-person-header
          slot="header"
          .person=${selected ?? null}
          .photo=${photo}
        ></sl-person-header>
        <sl-person-panel
          .indices=${this.indices}
          ?docked=${this.details}
          @pick=${(e: PickEvent) => {
            this.select(e.detail.id);
          }}
          @center=${(e: PickEvent) => {
            this.setRoot(e.detail.id, this.canvasCenter());
          }}
        ></sl-person-panel>
      </sl-side-dock>
    `;
  }

  // Over the chart while it shows a source; it belongs to the Selected
  // person (ADR-0011). A person picked in it who isn't selected is asked
  // for with `scan-person`, and selected as anyone else is.
  private renderScanViewer() {
    if (this.state.viewer.source.get() === null) return nothing;
    return html`
      <sl-scan-viewer
        .persons=${this.persons}
        @scan-person=${(e: ScanPersonEvent) => {
          this.select(e.detail.personId);
        }}
      ></sl-scan-viewer>
    `;
  }

  private renderCanvas(chart: EmitOutput) {
    const { min, max } = chart.extents;
    const vbX = min.x - SVG_MARGIN_PX;
    const vbY = min.y - SVG_MARGIN_PX;
    const vbW = max.x - min.x + SVG_MARGIN_PX * 2;
    const vbH = max.y - min.y + SVG_MARGIN_PX * 2;
    const { pan, scale, panReady, dragging } = this.viewport;
    // Hand the painted chart to the Transition so the next relayout can read
    // each card's and edge's old spot before it is replaced. Which items fade in
    // is the Transition's call, made once the relayout's pin has settled.
    if (panReady) this.transition.retainChart(chart);
    // Entering cards render as a stable trailing block the paint-order sort
    // never reorders — reordering an SVG node restarts its CSS fade, so a
    // sorted entering card would flash each time a Move starts and ends. The
    // rest sort the sliders first (painted behind) so stationary cards stay on
    // top as movers pass under them; those carry no fade, and movers slide via
    // Web Animations, which survive a same-parent reorder. A stable sort keeps
    // each group's order otherwise.
    const movingKeys = this.transition.movingKeys;
    const enteringKeys = this.transition.enteringBoxKeys;
    const entering = chart.boxes.filter((b) => enteringKeys.has(b.key));
    const rest = chart.boxes.filter((b) => !enteringKeys.has(b.key));
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
        ${
          panReady
            ? renderGhosts(leaving, this.persons, this.state.api.mediaUrl)
            : nothing
        }
        ${
          panReady
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
                      (l) =>
                        renderEdge(
                          l,
                          this.transition.enteringEdgeKeys.has(l.key)
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
                          photo: avatarHref(person, this.state.api.mediaUrl),
                          selected: b.personId === this.selectedId,
                          entering: enteringKeys.has(b.key)
                        },
                        {
                          click: (e: MouseEvent) => {
                            if (this.viewport.dragMoved) return;
                            if (b.personId !== this.selectedId) {
                              this.select(b.personId);
                            } else if (e.detail <= 1) {
                              // The selected card shows or hides the dock;
                              // a double-click's second click doesn't.
                              this.details = !this.details;
                            }
                          },
                          dblclick: () => {
                            if (this.viewport.dragMoved) return;
                            // Pin from layout coords rather than
                            // getBoundingClientRect — label widths vary by
                            // name length and would drift the captured
                            // "center" across back-and-forth toggles.
                            this.setRoot(
                              b.personId,
                              this.viewport.chartToScreen(b.pos)
                            );
                          }
                        }
                      );
                    }
                  )}
                </svg>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  override render() {
    // The corner renders through the loading and empty states too, so the
    // way back to the chooser (in Settings) is always there.
    return html`${this.renderBody()}${this.renderCorner()}`;
  }

  private renderBody() {
    if (this.loadError !== null) {
      return html`<div class="empty">Couldn't load: ${this.loadError}</div>`;
    }
    if (this.loading) return html`<div class="empty">Loading…</div>`;
    if (this.rootId === null) {
      return html`<div class="empty">No people in database.</div>`;
    }
    const chart = buildChart(this.rootId, this.indices, dims);
    if (chart === null) {
      return html`<div class="empty">No data for this person.</div>`;
    }
    this.chartExtents = chart.extents;
    this.drawnIds = new Set(chart.boxes.map((b) => b.personId));
    this.chartComfort = comfortOf(chart.boxes, this.coreIds(this.rootId));
    return html`
      <div class="main">
        ${this.renderDock()}
        <div class="chart-area">
          ${this.renderCanvas(chart)} ${this.renderScanViewer()}
        </div>
      </div>
    `;
  }
}
