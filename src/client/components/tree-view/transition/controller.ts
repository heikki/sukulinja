// Owns the chart-to-chart Transition's three phases. Move: capture the FLIP
// "First" before the relayout, play the slide once the Pin has settled, cancel an
// in-flight Move when a newer relayout supersedes it. Enter: flag boxes/edges new
// since the last layout so they fade in. Leave: render departing boxes/edges as
// ghosts and fade them out. The pure Planner decides *what*; this decides *when*,
// driving the Move via apply.ts and Enter/Leave via CSS classes. It never owns the
// Pin (ADR-0004): the element sequences applyPendingPin() then settle().

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Box, DrawnLine, EmitOutput, Point } from '../emit';
import { applyMove } from './apply';
import {
  captureFirst,
  chartIds,
  emptyChartIds,
  planEnter,
  planLeave,
  planMove
} from './planner';
import type { ChartIds, FirstScreen, RelayoutKind, ToScreen } from './planner';
import { transitionSchedule } from './schedule';
import type { Schedule } from './schedule';

export interface TransitionPort {
  // chart→screen under the *current* viewport — the old viewport at capture, the
  // new one at settle.
  toScreen: ToScreen;
  scale: () => number;
  root: () => ParentNode;
  // False before the first pan lands; capture no-ops until then.
  panReady: () => boolean;
}

// The Ghost layer: the relayout's departing boxes/edges at their old chart-local
// geometry, plus the offset and scale that land a ghost back at its last screen
// spot. Scale is the old-over-new zoom ratio — 1 unless a back/forward step
// restored a different zoom — applied about LEAVE_REF so the offset still lands.
export interface LeaveLayer {
  boxes: Box[];
  edges: DrawnLine[];
  offset: Point;
  scale: number;
}

function emptyLeaveLayer(): LeaveLayer {
  return { boxes: [], edges: [], offset: { x: 0, y: 0 }, scale: 1 };
}

// Frame-shift reference: any fixed chart point works; the origin is convenient.
const LEAVE_REF: Point = { x: 0, y: 0 };

// A phase's full span: once delay + duration has elapsed, its fade is done.
function fadeLifespan(timing: { delay: number; duration: number }) {
  return timing.delay + timing.duration;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// Captured before the new layout renders (through the *old* viewport) and consumed
// once by settle(): the FLIP "First" positions, the old chart and a reference
// point for the Leave phase, and the Relayout kind. One unit, so the lifecycle is
// a single null-check.
interface Pending {
  first: FirstScreen;
  prevChart: EmitOutput;
  captureRef: Point | null;
  // The viewport scale at capture. A back/forward step can restore a different
  // zoom, so the Move eases each card's size from this old scale to the new one.
  captureScale: number;
  kind: RelayoutKind;
}

export class TransitionController implements ReactiveController {
  // The timing policy: Move reads it; the element mirrors Enter/Leave timings into
  // CSS custom properties.
  private readonly _schedule: Schedule = transitionSchedule;

  // The chart currently painted on screen, so the next relayout can read each
  // card's old spot. The new chart commits between capture and settle.
  private chart: EmitOutput | null = null;
  // The capture snapshot, consumed by settle(); null when no relayout is in flight.
  private pending: Pending | null = null;
  private anims: Animation[] = [];
  // Keys of the sliding cards. They render behind the stationary ones so movers
  // pass under them.
  private _movingKeys = new Set<string>();
  // Guards the async clear against a superseding move.
  private moveGen = 0;

  // Enter phase. prevIds is the last layout's identity set — the baseline the next
  // change diffs against. The entering sets are the new items currently fading,
  // dropped by a timer once the fade is done; CSS owns the fade, its delay, and
  // reduced-motion suppression.
  private prevIds: ChartIds = emptyChartIds();
  private _enteringBoxIds: ReadonlySet<number> = new Set();
  private _enteringEdgeKeys: ReadonlySet<string> = new Set();
  private enterClearTimer: ReturnType<typeof setTimeout> | null = null;

  // Leave phase. The Ghost layer the element renders, dropped by a timer once the
  // fade is done. playLeave cancels that timer before installing a fresh layer, so
  // no generation guard is needed (unlike the Move, whose finish Promise can't be
  // cancelled).
  private _leaving: LeaveLayer = emptyLeaveLayer();
  private leaveClearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly port: TransitionPort
  ) {
    host.addController(this);
  }

  get movingKeys(): ReadonlySet<string> {
    return this._movingKeys;
  }

  get enteringBoxIds(): ReadonlySet<number> {
    return this._enteringBoxIds;
  }

  get enteringEdgeKeys(): ReadonlySet<string> {
    return this._enteringEdgeKeys;
  }

  get leaving(): LeaveLayer {
    return this._leaving;
  }

  get schedule(): Schedule {
    return this._schedule;
  }

  hostDisconnected() {
    for (const anim of this.anims) anim.cancel();
    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    if (this.leaveClearTimer !== null) clearTimeout(this.leaveClearTimer);
  }

  // Each render hands over the painted chart, so the next capture can read its
  // on-screen geometry.
  retainChart(chart: EmitOutput) {
    this.chart = chart;
  }

  // Flag boxes/edges new since the last layout so they alone fade in. No-ops when
  // the identity set is unchanged (pin re-render, drags) so an in-flight fade keeps
  // running. Call only once nodes actually paint.
  refreshEntering(chart: EmitOutput) {
    const ids = chartIds(chart);
    if (
      sameSet(ids.boxIds, this.prevIds.boxIds) &&
      sameSet(ids.edgeKeys, this.prevIds.edgeKeys)
    ) {
      return;
    }
    const entering = planEnter(ids, this.prevIds);
    this._enteringBoxIds = entering.boxIds;
    this._enteringEdgeKeys = entering.edgeKeys;
    this.prevIds = ids;
    this.scheduleEnterClear();
  }

  // Drop the entering flags once the fade has fully run, so the next change starts
  // clean. Reset whenever the entering set changes.
  private scheduleEnterClear() {
    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    if (this._enteringBoxIds.size === 0 && this._enteringEdgeKeys.size === 0) {
      this.enterClearTimer = null;
      return;
    }
    this.enterClearTimer = setTimeout(() => {
      this.enterClearTimer = null;
      this._enteringBoxIds = new Set();
      this._enteringEdgeKeys = new Set();
      this.host.requestUpdate();
    }, fadeLifespan(this._schedule.enter));
  }

  // FLIP "First": snapshot the on-screen positions through the old viewport before
  // the new layout renders. No-ops with no chart, no pan yet, or reduced motion,
  // leaving `pending` null so settle() does nothing.
  capture(kind: RelayoutKind) {
    if (
      this.chart === null ||
      !this.port.panReady() ||
      prefersReducedMotion()
    ) {
      return;
    }
    this.pending = {
      kind,
      first: captureFirst(this.chart, kind, this.port.toScreen),
      prevChart: this.chart,
      captureRef: this.port.toScreen(LEAVE_REF),
      captureScale: this.port.scale()
    };
  }

  // FLIP "Last" + "Play": with the pinned layout settled, slide each survivor from
  // where it was to where it landed (edges morph to match). Cancels any in-flight
  // move so a rapid relayout doesn't stack.
  settle() {
    const pending = this.pending;
    this.pending = null;
    if (pending === null || this.chart === null) return;
    for (const anim of this.anims) anim.cancel();
    const plan = planMove(
      pending.first,
      this.chart,
      pending.kind,
      this.port.toScreen
    );
    const result = applyMove(plan, {
      root: this.port.root(),
      scale: this.port.scale(),
      fromScale: pending.captureScale,
      timing: this._schedule.move
    });
    this.anims = result.anims;
    this._movingKeys = result.movingKeys;
    this.playLeave(pending);
    const gen = ++this.moveGen;
    if (this._movingKeys.size === 0) return;
    // Re-render so the sliders sort behind the stationary cards, then clear once
    // the move ends (unless a newer one took over).
    this.host.requestUpdate();
    void Promise.allSettled(this.anims.map((a) => a.finished)).then(() => {
      if (this.moveGen !== gen) return;
      this._movingKeys = new Set();
      this.host.requestUpdate();
    });
  }

  // Render the dropped items as Ghosts at their last screen spot and schedule the
  // layer to clear once the fade is done. Always installs a fresh layer (possibly
  // empty) and cancels any prior timer, so a superseding relayout replaces cleanly.
  private playLeave(pending: Pending) {
    const { boxes, edges } = planLeave(
      pending.prevChart,
      this.chart!,
      pending.kind
    );
    this._leaving = {
      boxes,
      edges,
      offset: this.frameShift(pending.captureRef),
      scale: pending.captureScale / this.port.scale()
    };
    if (this.leaveClearTimer !== null) clearTimeout(this.leaveClearTimer);
    this.leaveClearTimer = null;
    this.host.requestUpdate();
    if (boxes.length === 0 && edges.length === 0) return;
    this.leaveClearTimer = setTimeout(() => {
      this.leaveClearTimer = null;
      this._leaving = emptyLeaveLayer();
      this.host.requestUpdate();
    }, fadeLifespan(this._schedule.leave));
  }

  // How far the old frame's origin (LEAVE_REF) moved (user units) under the
  // relayout + pin. Added to a ghost's old local position, it lands LEAVE_REF back
  // at its last screen spot; the layer's scale (applied about LEAVE_REF) carries
  // any zoom change, so this offset stays a pure translation.
  private frameShift(captureRef: Point | null) {
    const now = this.port.toScreen(LEAVE_REF);
    if (captureRef === null || now === null) return { x: 0, y: 0 };
    const scale = this.port.scale();
    return {
      x: (captureRef.x - now.x) / scale,
      y: (captureRef.y - now.y) / scale
    };
  }
}
