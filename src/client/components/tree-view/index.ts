import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { preferredGenerations } from '@/client/generations';
import { reportView } from '@/client/last-view';
import { appState } from '@/client/state';
import type { AppState, ChartView, UrlView } from '@/client/state';

import '../person-panel';
import '../scan-viewer';

import { detailsWidth, setDetailsWidth } from '../person-panel/helpers';

import '../person-search';
import '../reminder-dialog/shown';
import '../reminders-dialog/button';
import '../settings';

import type { PickEvent } from '../person-search';
import type { GenerationsChangeEvent } from '../settings';
import { RAIL_PX, SLIDE_MS } from '../side-dock';
import type { OpenChangeEvent, WidthChangeEvent } from '../side-dock';
import { avatarHref, onAvatarReady } from './avatar-cache';
import { buildChart } from './build';
import { otherSpouseOf } from './build/indices';
import { cardMenuAt, renderCardMenu } from './card-menu';
import type { CardMenu } from './card-menu';
import { comfortOf } from './comfort';
import { cardsByPerson } from './emit';
import type { EmitOutput, Extents, Point } from './emit';
import { cardHalf, dims, formatName, renderBox, renderEdge } from './renderer';
import { treeViewStyles } from './styles';
import { TransitionController } from './transition';
import { paintOrder, renderGhosts, scheduleVars } from './transition/paint';
import { buildHash, parseHashView } from './url-state';
import type { Bounds, ParsedView } from './url-state';
import { ViewportController } from './viewport';
import type { Comfort, ViewportOptions } from './viewport';

const SVG_MARGIN_PX = 24;
const VIEWPORT_OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
  dragThresholdPx: 4,
  svgMarginPx: SVG_MARGIN_PX
};

const URL_BOUNDS: Bounds = {
  minZoom: VIEWPORT_OPTIONS.scaleBounds.minScale,
  maxZoom: VIEWPORT_OPTIONS.scaleBounds.maxScale
};

// Root and the Selected person as the URL gives them.
function urlView(parsed: ParsedView): UrlView {
  return {
    rootId: parsed.rootId,
    selectedId: parsed.selectedId,
    panned: parsed.pan !== null
  };
}

@customElement('sl-tree-view')
export class TreeViewElement extends SignalWatcher(LitElement) {
  static override styles = treeViewStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ type: Number, reflect: true }) gen = preferredGenerations();
  // The dataset's name, for the Settings popover's way back to the chooser.
  @property({ attribute: false }) datasetName: string | null = null;

  // Closed on entering a dataset; selecting someone opens it.
  @state() private details = false;
  @state() private detailsWidth = detailsWidth();
  @state() private menu: CardMenu | null = null;

  // Captured during render so the viewport port can resolve chart-local
  // coords to canvas pixels using the same extents the SVG was sized to.
  private chartExtents: Extents | null = null;
  private chartComfort: Comfort | null = null;
  // Who the chart draws, so selecting anyone else rebuilds it around them.
  private drawnAt = new Map<number, Point[]>();
  // Root as last drawn, to tell a Relayout from the first chart.
  private drawnRoot: number | null = null;
  private detach: (() => void) | null = null;

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

  // What the chart store moves: the viewport, the dock and the URL.
  private readonly chartView: ChartView = {
    draws: (id) => this.drawnAt.has(id),
    show: (id, at) => {
      const cards = at ?? this.drawnAt.get(id) ?? [];
      const opening = this.details ? 0 : this.detailsWidth - RAIL_PX;
      this.viewport.showCard(cards, cardHalf, opening, SLIDE_MS);
      this.details = true;
    },
    rerooting: (pin, open) => {
      // No pin from a click puts the new Root at the canvas centre, so it
      // doesn't land at the last one's stale offset.
      this.viewport.beginReroot(pin ?? this.canvasCenter(), { nudge: true });
      if (open) this.details = true;
    },
    writeUrl: (push) => {
      if (!push) {
        this.writeUrl();
        return;
      }
      // Two-step: push carries root+zoom only. The pin lands in updated()
      // and onSettle's writeUrl follows up with a replaceState that adds
      // pan.
      history.pushState(
        null,
        '',
        buildHash({
          rootId: this.rootId!,
          pan: null,
          zoom: this.hasUserZoom ? this.viewport.scale : null
        })
      );
      reportView();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    this.avatarUnsub = onAvatarReady(() => {
      this.requestUpdate();
    });
    this.detach = this.state.chart.attach(this.chartView);
    void this.state.chart.load(this.arrive);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
    this.avatarUnsub?.();
    this.avatarUnsub = null;
    this.detach?.();
    this.detach = null;
  }

  // Back or forward waits on a change pending in the Scan viewer; editing
  // on puts the URL back.
  private readonly onHashChange = () => {
    const back =
      this.rootId === null ? null : this.buildCurrentHash(this.rootId);
    this.state.chart.follow(this.followHash, () => {
      if (back !== null) history.replaceState(null, '', back);
    });
    reportView();
  };

  // The URL's view, its pan and zoom restored as the chart moves; with a
  // stored pan, the deferred restore is authoritative.
  private readonly followHash = () => {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    this.restoreViewportFromHash(parsed);
    return urlView(parsed);
  };

  // The URL's view on arriving, its zoom and pan applied before the chart
  // is first pinned, so chart (0,0) lands at canvas center using the
  // URL-supplied zoom, not the default 1.
  private readonly arrive = () => {
    const parsed = parseHashView(location.hash, URL_BOUNDS);
    if (parsed.zoom !== null) {
      this.viewport.setScale(parsed.zoom);
      this.hasUserZoom = true;
    }
    if (parsed.pan !== null) {
      this.viewport.setPan(parsed.pan);
      this.hasUserPan = true;
    }
    return urlView(parsed);
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
    // A Root or Generation Relayout snapshots the on-screen chart first, so
    // the Transition can animate from it: a Generation limit change keeps
    // the chart rooted (matched by unique key), any root change re-roots
    // (matched by personId/baseKey). The very first root has no previous
    // chart to move from. The DOM and viewport still reflect the old chart
    // here (render commits in update(), the pin lands in updated()), so the
    // capture maps through the old pan/extents.
    const root = this.rootId;
    const rerooted = root !== this.drawnRoot;
    const firstRoot = rerooted && this.drawnRoot === null;
    this.drawnRoot = root;
    if (!firstRoot && (rerooted || changed.has('gen'))) {
      this.transition.capture(rerooted ? 'root' : 'generation');
    }
  }

  override updated(_changed: PropertyValues) {
    if (this.state.chart.loading.get() || this.rootId === null) return;
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
    for (const fam of this.state.chart.people
      .get()
      .spouseFamsByPerson.get(rootId) ?? []) {
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

  private get persons() {
    return this.state.chart.people.get().persons;
  }

  private get rootId() {
    return this.state.chart.root.get();
  }

  // The persons and families the chart reads.
  private get indices() {
    return { ...this.state.chart.people.get(), levels: this.gen };
  }

  private get selectedId() {
    return this.state.selected.id.get();
  }

  private writeUrl() {
    if (this.rootId === null) return;
    history.replaceState(null, '', this.buildCurrentHash(this.rootId));
    reportView();
  }

  private buildCurrentHash(rootId: number) {
    return buildHash({
      rootId,
      selectedId: this.selectedId,
      pan: this.hasUserPan ? this.viewport.pan : null,
      zoom: this.hasUserZoom ? this.viewport.scale : null
    });
  }

  // Search, Reminders and Settings, floating over the chart's top-right
  // corner. Away while the Scan viewer covers the chart: its own row ends
  // in Close there.
  private renderCorner() {
    if (this.state.viewer.opened.get() !== null) return nothing;
    return html`
      <div class="corner">
        <sl-person-search
          .persons=${this.persons}
          @pick=${(e: PickEvent) => {
            this.state.chart.select(e.detail.id);
          }}
        ></sl-person-search>
        <sl-reminders-button
          @dock-open=${() => {
            this.details = true;
          }}
        ></sl-reminders-button>
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
        <sl-person-panel ?docked=${this.details}></sl-person-panel>
      </sl-side-dock>
    `;
  }

  // Over the chart while it shows a source or an Image; it belongs to the Selected
  // person (ADR-0011).
  private renderScanViewer() {
    if (this.state.viewer.opened.get() === null) return nothing;
    return html`<sl-scan-viewer></sl-scan-viewer>`;
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
    const enteringKeys = this.transition.enteringBoxKeys;
    const movingKeys = this.transition.movingKeys;
    const boxes = paintOrder(chart.boxes, movingKeys, enteringKeys);
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
                            // A Ctrl-click is the Mac's right-click.
                            if (this.viewport.dragMoved || e.ctrlKey) return;
                            if (b.personId !== this.selectedId) {
                              this.state.chart.select(b.personId, [b.pos]);
                            } else if (e.detail <= 1) {
                              // The selected card shows or hides the dock;
                              // a quick second click, as a double-click's,
                              // doesn't.
                              this.details = !this.details;
                            }
                          },
                          contextmenu: (e: MouseEvent) => {
                            this.menu = cardMenuAt(e, b, this.rootId);
                          }
                        }
                      );
                    }
                  )}
                </svg>
              </div>`
            : nothing
        }
        ${renderCardMenu(this.menu, this.persons, {
          // The card's person's pin is where their card is drawn, from
          // layout coords: label widths vary by name length and would
          // drift it across back-and-forth re-roots.
          makeRoot: (menu) => {
            this.state.chart.makeRoot(
              menu.personId,
              this.viewport.chartToScreen(menu.pos)
            );
          },
          close: () => {
            this.menu = null;
          }
        })}
      </div>
    `;
  }

  override render() {
    // The corner renders through the loading and empty states too, so the
    // way back to the chooser (in Settings) is always there. A Reminder
    // clicked anywhere opens over it all.
    return html`${this.renderBody()}${this.renderCorner()}
      <sl-reminder-shown></sl-reminder-shown>`;
  }

  private renderBody() {
    const { loading, error } = this.state.chart;
    if (error.get() !== null) {
      return html`<div class="empty">Couldn't load: ${error.get()}</div>`;
    }
    if (loading.get()) return html`<div class="empty">Loading…</div>`;
    if (this.rootId === null) {
      return html`<div class="empty">No people in database.</div>`;
    }
    const chart = buildChart(this.rootId, this.indices, dims);
    if (chart === null) {
      return html`<div class="empty">No data for this person.</div>`;
    }
    this.chartExtents = chart.extents;
    this.drawnAt = cardsByPerson(chart.boxes);
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
