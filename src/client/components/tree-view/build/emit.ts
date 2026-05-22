// Emit pass — walks the layout tree once with an accumulated absolute
// offset and produces a flat ID-keyed output for rendering. PersonNodes
// contribute Box records; FamilyNodes contribute Line records. Anchor
// slots inside a FamilyNode participate in line geometry but don't appear
// in the layout tree, so they emit no Box — the box belongs to the
// upstream PersonNode that owns this FamilyNode.
//
// Emit is also the seam where the layout's structural units resolve to
// absolute pixel coordinates. LayoutOffset is in slot units on both
// axes — sub-slot x (sibship packing), integer-generation y.
//   x  — pitch is PITCH_PX. Each PersonNode's footprint is 1 slot wide,
//        with implicit half-gap padding on each side. Multiplied by
//        PITCH_PX at the leaf; tie endpoints clip to box edges via
//        BOX_W_PX.
//   y  — pitch is ROW_PITCH. Multiplied by ROW_PITCH in accumulate;
//        intra-family endpoints come in as pixels from familyLines via
//        FamilyNode.tieKind and ChildAnchor.kind.

import {
  BOX_H,
  BOX_W_PX,
  NONPRIMARY_TIE_Y_OFFSET,
  PITCH_PX,
  ROW_PITCH
} from '../helpers';
import type { Point } from '../helpers';
import { FamilyNode } from '../nodes/family-node';
import type { LayoutNode } from '../nodes/layout-node';
import { PersonNode } from '../nodes/person-node';
import type {
  Anchor,
  ChildAnchor,
  KidSlot,
  LayoutOffset,
  OwnedPersonSlot,
  TieKind
} from '../nodes/types';

// Half-box-width in slot units. Used for tie-endpoint clipping: the tie
// stops at each adult's box edge, which sits BOX_HALF_SLOT inside the
// adult's slot-footprint edge.
const BOX_HALF_SLOT = BOX_W_PX / PITCH_PX / 2;

export interface Box {
  personId: number;
  pos: Point;
}

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

export interface EmitOutput {
  boxes: Box[];
  lines: Line[];
}

export function emitLayout(root: LayoutNode, startAbs: Point): EmitOutput {
  const boxes: Box[] = [];
  const lines: Line[] = [];
  walk(root, startAbs, boxes, lines);
  return { boxes, lines };
}

function walk(node: LayoutNode, abs: Point, boxes: Box[], lines: Line[]) {
  if (node instanceof PersonNode) {
    boxes.push({
      personId: node.personId,
      pos: { x: abs.x * PITCH_PX, y: abs.y }
    });
  } else if (node instanceof FamilyNode) {
    for (const line of familyLines(node)) {
      lines.push({
        key: line.key,
        from: { x: (line.from.x + abs.x) * PITCH_PX, y: line.from.y + abs.y },
        to: { x: (line.to.x + abs.x) * PITCH_PX, y: line.to.y + abs.y }
      });
    }
  }
  for (const child of node.children) {
    walk(child, accumulate(abs, child.offset), boxes, lines);
  }
}

function accumulate(abs: Point, offset: LayoutOffset): Point {
  return { x: abs.x + offset.x, y: abs.y + offset.y * ROW_PITCH };
}

function familyLines(node: FamilyNode): Line[] {
  // X is in slot units (walk multiplies by PITCH_PX at the leaf); Y is in
  // pixels. Tie endpoints clip to box edges via BOX_HALF_SLOT.
  const out: Line[] = [];
  if (node.husband !== null && node.wife !== null) {
    // Husband-left convention can be violated by ancestor step-fams (the
    // step-spouse may sit on Fa's "wrong" side to match chronological
    // placement) — pick endpoints by X order, not by husband/wife roles.
    const leftX = Math.min(node.husband.localX, node.wife.localX);
    const rightX = Math.max(node.husband.localX, node.wife.localX);
    const ty = tieY(node.tieKind);
    out.push({
      key: `tie-${node.famId}`,
      from: { x: leftX + BOX_HALF_SLOT, y: ty },
      to: { x: rightX - BOX_HALF_SLOT, y: ty }
    });
  }
  if (node.kids.length > 0) {
    appendSibshipLines(node, out);
  }
  return out;
}

function appendSibshipLines(node: FamilyNode, out: Line[]) {
  const { famId, kids, childAnchor } = node;
  const busY = ROW_PITCH / 2;
  const anchorPoint: Point = {
    x: childAnchor.x,
    y: childAnchorY(childAnchor.kind)
  };
  // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
  // The bar spans the union of childAnchor.x and the kid Xs — so a
  // one-kid sibship where the Tie sits off the kid's column (depth ≥ 2)
  // still connects via a horizontal bar from the drop to the kid's leg.
  out.push({
    key: `sib-${famId}-drop`,
    from: anchorPoint,
    to: { x: anchorPoint.x, y: busY }
  });
  let minX = anchorPoint.x;
  let maxX = anchorPoint.x;
  for (const k of kids) {
    if (k.localX < minX) minX = k.localX;
    if (k.localX > maxX) maxX = k.localX;
  }
  if (maxX > minX) {
    out.push({
      key: `sib-${famId}-bar`,
      from: { x: minX, y: busY },
      to: { x: maxX, y: busY }
    });
  }
  for (const k of kids) {
    out.push({
      key: `sib-${famId}-leg-${slotPersonId(k)}`,
      from: { x: k.localX, y: busY },
      to: { x: k.localX, y: ROW_PITCH - BOX_H / 2 }
    });
  }
}

function tieY(kind: TieKind): number {
  switch (kind) {
    case 'centered':
      return 0;
    case 'nonprimary-left':
      return NONPRIMARY_TIE_Y_OFFSET;
    case 'nonprimary-right':
      return -NONPRIMARY_TIE_Y_OFFSET;
  }
}

function childAnchorY(kind: ChildAnchor['kind']): number {
  switch (kind) {
    case 'tie-midpoint':
      return 0;
    case 'box-bottom':
      return BOX_H / 2;
  }
}

function slotPersonId(slot: KidSlot): number {
  return isOwned(slot) ? slot.node.personId : slot.personId;
}

function isOwned(slot: OwnedPersonSlot | Anchor): slot is OwnedPersonSlot {
  return 'node' in slot;
}
