// Owns the chart-to-chart Transition's three phases. Capture the FLIP "First"
// before the relayout; once the Pin has settled, ask the Planner for one plan that
// puts every box and edge in exactly one phase, then play it. Move: slide the
// survivors, cancelling an in-flight Move a newer relayout supersedes. Enter: flag
// the newcomers so they fade in. Leave: render the departures as ghosts and fade
// them out. The pure Planner decides *what*; the Schedule decides *when*; this
// drives the Move via apply.ts and Enter/Leave via CSS classes. It never owns the
// Pin (ADR-0004): the element sequences applyPendingPin() then settle().

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Box, DrawnLine, EmitOutput, Point } from '../emit';
import { dims } from '../renderer';
import { applyMove } from './apply';
import type { ApplyResult } from './apply';
import { captureFirst, enterAll, planTransition } from './planner';
import type {
  EnterPlan,
  FirstScreen,
  LeavePlan,
  RelayoutKind,
  ToScreen
} from './planner';
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

// Captured before the new layout renders (through the *old* viewport) and consumed
// once by settle(): the FLIP "First" positions (with the old chart), a reference
// point for the Leave phase, and the Relayout kind. One unit, so the lifecycle is
// a single null-check.
interface Pending {
  first: FirstScreen;
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
  // The Move in flight, cancelled when a newer relayout supersedes it.
  private move: ApplyResult | null = null;
  // Keys of the sliding cards. They render behind the stationary ones so movers
  // pass under them.
  private _movingKeys = new Set<string>();
  // Guards the async clear against a superseding move.
  private moveGen = 0;

  // Enter phase. The instance keys of the items currently fading in, dropped by a
  // timer once the fade is done; CSS owns the fade, its delay, and reduced-motion
  // suppression.
  private _enteringBoxKeys: ReadonlySet<string> = new Set();
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

  get enteringBoxKeys(): ReadonlySet<string> {
    return this._enteringBoxKeys;
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
    this.move?.cancel();
    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    if (this.leaveClearTimer !== null) clearTimeout(this.leaveClearTimer);
  }

  // Each painted render hands over the chart, so the next capture can read its
  // on-screen geometry. The first one fades the whole chart in.
  retainChart(chart: EmitOutput) {
    if (this.chart === null) this.setEntering(enterAll(chart));
    this.chart = chart;
  }

  // Flag the items that fade in, and drop the flags once the fade has fully run so
  // the next change starts clean.
  private setEntering(entering: EnterPlan) {
    this._enteringBoxKeys = entering.boxKeys;
    this._enteringEdgeKeys = entering.edgeKeys;
    if (this.enterClearTimer !== null) clearTimeout(this.enterClearTimer);
    this.enterClearTimer = null;
    if (entering.boxKeys.size === 0 && entering.edgeKeys.size === 0) return;
    this.enterClearTimer = setTimeout(() => {
      this.enterClearTimer = null;
      this._enteringBoxKeys = new Set();
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
      first: captureFirst(this.chart, this.port.toScreen),
      captureRef: this.port.toScreen(LEAVE_REF),
      captureScale: this.port.scale()
    };
  }

  // FLIP "Last" + "Play": with the pinned layout settled, slide each survivor from
  // where it was to where it landed (edges follow their cards), fade the newcomers
  // in and the departures out. Cancels any in-flight move so a rapid relayout
  // doesn't stack.
  settle() {
    const pending = this.pending;
    this.pending = null;
    if (pending === null || this.chart === null) return;
    this.move?.cancel();
    // Overlap is judged at the larger of the two zooms, so a zoom-changing step
    // never lets a slide graze a card.
    const cardScale = Math.max(this.port.scale(), pending.captureScale);
    const plan = planTransition(pending.first, this.chart, {
      kind: pending.kind,
      toScreen: this.port.toScreen,
      card: { width: dims.boxW * cardScale, height: dims.boxH * cardScale }
    });
    this.setEntering({
      boxKeys: carryOver(
        plan.enter.boxKeys,
        this._enteringBoxKeys,
        plan.pairs.boxes
      ),
      edgeKeys: carryOver(
        plan.enter.edgeKeys,
        this._enteringEdgeKeys,
        plan.pairs.edges
      )
    });
    const move = applyMove(plan.move, {
      root: this.port.root(),
      scale: this.port.scale(),
      fromScale: pending.captureScale,
      timing: this._schedule.move
    });
    this.move = move;
    this._movingKeys = move.movingKeys;
    this.playLeave(plan.leave, pending);
    // Re-render so the entering flags and the Ghost layer paint, and the sliders
    // sort behind the stationary cards.
    this.host.requestUpdate();
    const gen = ++this.moveGen;
    if (this._movingKeys.size === 0) return;
    // Clear the sliders once the move ends (unless a newer one took over).
    void Promise.allSettled(move.anims.map((a) => a.finished)).then(() => {
      if (this.moveGen !== gen) return;
      this._movingKeys = new Set();
      this.host.requestUpdate();
    });
  }

  // Render the dropped items as Ghosts at their last screen spot and schedule the
  // layer to clear once the fade is done. Always installs a fresh layer (possibly
  // empty) and cancels any prior timer, so a superseding relayout replaces cleanly.
  private playLeave({ boxes, edges }: LeavePlan, pending: Pending) {
    this._leaving = {
      boxes,
      edges,
      offset: this.frameShift(pending.captureRef),
      scale: pending.captureScale / this.port.scale()
    };
    if (this.leaveClearTimer !== null) clearTimeout(this.leaveClearTimer);
    this.leaveClearTimer = null;
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

// The relayout's newcomers, plus any survivor whose Enter fade from an earlier
// relayout is still running (followed to its new key), so a rapid run of
// relayouts doesn't snap a half-faded card to full opacity.
function carryOver(
  entering: Set<string>,
  stillFading: ReadonlySet<string>,
  pairs: Map<string, string>
) {
  const out = new Set(entering);
  for (const key of stillFading) {
    const next = pairs.get(key);
    if (next !== undefined) out.add(next);
  }
  return out;
}
