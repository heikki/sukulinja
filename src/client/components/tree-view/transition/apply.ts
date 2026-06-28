// The impure edge of the Transition: run a MovePlan against the live DOM via Web
// Animations + the `d`-morph, each endpoint sliding from its old spot to its new
// over the Move's duration/easing. Kept thin so the Planner stays pure — this
// layer only queries elements and starts animations.

import { dims } from '../renderer';
import type { MovePlan } from './planner';
import type { PhaseTiming } from './schedule';

// Below half a pixel a card/edge hasn't really moved — skip it so it neither
// animates nor paints behind the stationary cards.
const MOVE_EPS = 0.5;
// Below this the zoom is effectively unchanged, so the slide stays a pure
// translate (and a card that only sits still is skipped entirely).
const SCALE_EPS = 1e-3;

function moved(ox: number, oy: number) {
  return Math.hypot(ox, oy) >= MOVE_EPS;
}

// A back/forward step can restore a different zoom; ease each card's size from
// the old scale to the new alongside its slide. The card's <g> origin is its
// top-left, so scale about its centre (boxW/2, boxH/2) to keep the centre — which
// the translate already lands — fixed. Edges are points, so their endpoint slide
// already tracks the zoom; only boxes carry an extent that must scale.
function scaleAboutCentre(k: number) {
  const cx = dims.boxW / 2;
  const cy = dims.boxH / 2;
  return `translate(${cx}px, ${cy}px) scale(${k}) translate(${-cx}px, ${-cy}px)`;
}

function cardKeyframes(ox: number, oy: number, k: number, scales: boolean) {
  // Pure-pan steps keep the original translate-only keyframes. When the zoom
  // changes, both ends carry the centre-pivot scale so WAAPI interpolates the
  // transform components rather than falling back to matrix decomposition.
  if (!scales) {
    return [
      { transform: `translate(${ox}px, ${oy}px)` },
      { transform: 'translate(0px, 0px)' }
    ];
  }
  return [
    { transform: `translate(${ox}px, ${oy}px) ${scaleAboutCentre(k)}` },
    { transform: `translate(0px, 0px) ${scaleAboutCentre(1)}` }
  ];
}

// Index the live (non-ghost) elements by their key attribute in one DOM pass,
// so each mover looks its target up in O(1) rather than querying per item. The
// :not(.ghost) selector excludes a leaving card from a prior relayout that can
// share a key with a live mover (e.g. gen 4→5→4) while its fade overlaps.
function liveElements(root: ParentNode, selector: string, attr: string) {
  const map = new Map<string, Element>();
  root.querySelectorAll(selector).forEach((el) => {
    const key = el.getAttribute(attr);
    if (key !== null) map.set(key, el);
  });
  return map;
}

// Everything the slide needs beyond the plan: the DOM root, the viewport scale,
// and the Move's delay / duration / easing.
export interface MoveCtx {
  root: ParentNode;
  // The new (settled) viewport scale; fromScale is the scale at capture. They
  // differ only when a back/forward step restored a different zoom.
  scale: number;
  fromScale: number;
  timing: PhaseTiming;
}

export interface ApplyResult {
  // Started animations, so the controller can cancel them on the next relayout
  // and watch them finish.
  anims: Animation[];
  // Keys of the sliding cards, so the controller paints them behind the
  // stationary ones for the move.
  movingKeys: Set<string>;
}

export function applyMove(plan: MovePlan, ctx: MoveCtx): ApplyResult {
  const cards = slideCards(plan, ctx);
  const edges = morphEdges(plan, ctx);
  return { anims: [...cards.anims, ...edges], movingKeys: cards.keys };
}

// The <g> transform lives in SVG user space, so the screen delta is divided by
// scale and the slide runs in user units, added on top of the card's base
// translate (composite: 'add').
function slideCards(plan: MovePlan, ctx: MoveCtx) {
  const { root, scale, fromScale, timing } = ctx;
  const elements = liveElements(
    root,
    '[data-box-key]:not(.ghost)',
    'data-box-key'
  );
  const k = fromScale / scale;
  const scales = Math.abs(k - 1) >= SCALE_EPS;
  const anims: Animation[] = [];
  const keys = new Set<string>();
  for (const b of plan.boxes) {
    const ox = (b.from.x - b.to.x) / scale;
    const oy = (b.from.y - b.to.y) / scale;
    // A zoom change animates every survivor even if its centre held still.
    if (!moved(ox, oy) && !scales) continue;
    const el = elements.get(b.key);
    if (el === undefined) continue;
    keys.add(b.key);
    anims.push(
      el.animate(cardKeyframes(ox, oy, k, scales), {
        delay: timing.delay,
        duration: timing.duration,
        easing: timing.easing,
        // Hold the start through the delay, else the card snaps when it fires.
        fill: 'backwards',
        composite: 'add'
      })
    );
  }
  return { anims, keys };
}

// Each endpoint slides from where it visually was (newLocal + (oldScreen −
// newScreen) / scale) to its new local spot, so the line tracks the cards.
function morphEdges(plan: MovePlan, ctx: MoveCtx) {
  const { root, scale, timing } = ctx;
  const elements = liveElements(root, '.edge:not(.ghost)', 'data-edge-key');
  const anims: Animation[] = [];
  for (const e of plan.edges) {
    const el = elements.get(e.key);
    if (el === undefined) continue;
    const fx = (e.from.from.x - e.to.from.x) / scale;
    const fy = (e.from.from.y - e.to.from.y) / scale;
    const tx = (e.from.to.x - e.to.to.x) / scale;
    const ty = (e.from.to.y - e.to.to.y) / scale;
    // Skip the edge only when both endpoints are at rest.
    if (!moved(fx, fy) && !moved(tx, ty)) continue;
    const a0 = { x: e.local.from.x + fx, y: e.local.from.y + fy };
    const b0 = { x: e.local.to.x + tx, y: e.local.to.y + ty };
    anims.push(
      el.animate(
        [
          { d: `path("M ${a0.x} ${a0.y} L ${b0.x} ${b0.y}")` },
          {
            d: `path("M ${e.local.from.x} ${e.local.from.y} L ${e.local.to.x} ${e.local.to.y}")`
          }
        ],
        {
          delay: timing.delay,
          duration: timing.duration,
          easing: timing.easing,
          fill: 'backwards'
        }
      )
    );
  }
  return anims;
}
