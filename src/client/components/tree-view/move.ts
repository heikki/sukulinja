// Refocus / level-change motion: surviving cards FLIP-slide to their new spot
// and surviving edges morph their geometry to track them, both on one timeline.
// The host captures screen positions before the layout changes
// (captureFirstScreen), then plays the animation once the pinned layout has
// settled (animateMove).
//
// Boxes and edges are addressed by a unique per-instance id (`uid`, the box/edge
// `key`) so pedigree-collapse duplicates are kept apart. Matching an item across
// the relayout uses a separate *match key*: a pure levels change keeps the tree
// rooted, so the uid is stable and used directly (`byKey`); a refocus re-roots
// the tree, so we fall back to the relayout-invariant personId / family baseKey.

import type { Point } from './emit';

// Matches --sl-anim-move / --sl-ease: how long a card slides and an edge morphs.
const MOVE_MS = 350;
const MOVE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export interface BoxGeom {
  pos: Point;
  personId: number;
}

export interface EdgeGeom {
  from: Point;
  to: Point;
  baseKey: string;
}

// Maps a chart-local point to a screen pixel under the *current* viewport
// (pan/extents/scale). Returns null before the viewport can resolve it.
export type ToScreen = (p: Point) => Point | null;

// Old screen positions keyed by match key (uid for a levels change, personId /
// baseKey for a refocus). Edge endpoints are kept as a screen-space segment.
export interface FirstScreen {
  boxes: Map<string, Point>;
  edges: Map<string, { from: Point; to: Point }>;
}

// The settled new layout the move plays against: where to find the elements
// (root), their new chart-local geometry keyed by uid, and the current mapping.
export interface MoveCtx {
  root: ParentNode;
  boxPos: Map<string, BoxGeom>;
  edgeGeom: Map<string, EdgeGeom>;
  toScreen: ToScreen;
  scale: number;
}

function boxMatchKey(uid: string, geom: BoxGeom, byKey: boolean) {
  return byKey ? uid : `p${geom.personId}`;
}

function edgeMatchKey(uid: string, geom: EdgeGeom, byKey: boolean) {
  return byKey ? uid : geom.baseKey;
}

// FLIP "First": snapshot every on-screen card and edge endpoint in screen
// space, read through the old viewport before the layout changes.
export function captureFirstScreen(
  boxPos: Map<string, BoxGeom>,
  edgeGeom: Map<string, EdgeGeom>,
  toScreen: ToScreen,
  byKey: boolean
): FirstScreen {
  const boxes = new Map<string, Point>();
  for (const [uid, geom] of boxPos) {
    const s = toScreen(geom.pos);
    if (s !== null) boxes.set(boxMatchKey(uid, geom, byKey), s);
  }
  const edges = new Map<string, { from: Point; to: Point }>();
  for (const [uid, geom] of edgeGeom) {
    const fromS = toScreen(geom.from);
    const toS = toScreen(geom.to);
    if (fromS !== null && toS !== null) {
      edges.set(edgeMatchKey(uid, geom, byKey), { from: fromS, to: toS });
    }
  }
  return { boxes, edges };
}

export interface MoveResult {
  // Every started animation, so the caller can cancel them on the next relayout
  // and watch them finish.
  anims: Animation[];
  // uids of the cards that are actually sliding, so the caller can paint them
  // behind the stationary cards for the duration of the move.
  movingBoxKeys: Set<string>;
}

// FLIP "Last" + "Play": now that the pinned layout has settled, slide each
// surviving card from old → new and morph each surviving edge to match.
export function animateMove(
  ctx: MoveCtx,
  first: FirstScreen,
  byKey: boolean
): MoveResult {
  const cards = slideCards(ctx, first.boxes, byKey);
  const edges = morphEdges(ctx, first.edges, byKey);
  return { anims: [...cards.anims, ...edges], movingBoxKeys: cards.keys };
}

// The <g> transform lives in SVG user space, so the screen delta is divided by
// scale and added on top of the card's base translate (composite: 'add').
function slideCards(
  ctx: MoveCtx,
  first: Map<string, Point>,
  byKey: boolean
): { anims: Animation[]; keys: Set<string> } {
  const { root, boxPos, toScreen, scale } = ctx;
  const anims: Animation[] = [];
  const keys = new Set<string>();
  for (const [uid, geom] of boxPos) {
    const from = first.get(boxMatchKey(uid, geom, byKey));
    if (from === undefined) continue; // a new card — it fades in instead
    const to = toScreen(geom.pos);
    if (to === null) continue;
    const dx = (from.x - to.x) / scale;
    const dy = (from.y - to.y) / scale;
    if (Math.hypot(dx, dy) < 0.5) continue; // didn't really move
    const el = root.querySelector(`[data-box-key="${uid}"]`);
    if (el === null) continue;
    keys.add(uid);
    anims.push(
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' }
        ],
        { duration: MOVE_MS, easing: MOVE_EASING, composite: 'add' }
      )
    );
  }
  return { anims, keys };
}

// The start path places each old endpoint (in screen space) back into the new
// SVG user frame — newLocal + (oldScreen − newScreen) / scale — so the line
// animates from exactly where it was to where it now belongs.
function morphEdges(
  ctx: MoveCtx,
  first: Map<string, { from: Point; to: Point }>,
  byKey: boolean
): Animation[] {
  const { root, edgeGeom, toScreen, scale } = ctx;
  const elements = new Map<string, Element>();
  root.querySelectorAll('.edge').forEach((el) => {
    const key = el.getAttribute('data-edge-key');
    if (key !== null) elements.set(key, el);
  });
  const anims: Animation[] = [];
  for (const [uid, geom] of edgeGeom) {
    const old = first.get(edgeMatchKey(uid, geom, byKey));
    const el = elements.get(uid);
    if (old === undefined || el === undefined) continue;
    const fromTo = toScreen(geom.from);
    const toTo = toScreen(geom.to);
    if (fromTo === null || toTo === null) continue;
    const sfx = geom.from.x + (old.from.x - fromTo.x) / scale;
    const sfy = geom.from.y + (old.from.y - fromTo.y) / scale;
    const stx = geom.to.x + (old.to.x - toTo.x) / scale;
    const sty = geom.to.y + (old.to.y - toTo.y) / scale;
    if (
      Math.hypot(sfx - geom.from.x, sfy - geom.from.y) < 0.5 &&
      Math.hypot(stx - geom.to.x, sty - geom.to.y) < 0.5
    ) {
      continue; // endpoints didn't really move
    }
    anims.push(
      el.animate(
        [
          { d: `path("M ${sfx} ${sfy} L ${stx} ${sty}")` },
          {
            d: `path("M ${geom.from.x} ${geom.from.y} L ${geom.to.x} ${geom.to.y}")`
          }
        ],
        { duration: MOVE_MS, easing: MOVE_EASING }
      )
    );
  }
  return anims;
}
