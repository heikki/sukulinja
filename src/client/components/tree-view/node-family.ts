// FamilyNode — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonNodes, not this node; anchor members (whose
// PersonNode lives in an upstream node) appear in the spec as an `Anchor`
// carrying only the local x needed for line geometry.
//
// Pivot conventions, set by the spec, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

import { BOX_H, BOX_W, ROW_PITCH } from './helpers';
import type { Point } from './helpers';
import { LayoutNode } from './node';
import type { Line } from './node';
import type { PersonNode } from './node-person';

// Position-only slot for a person whose PersonNode lives in an upstream
// node. Carries the personId (for line keys) and the local x in this family's
// frame (for tie/sibship geometry).
export interface Anchor {
  personId: number;
  localX: number;
}

// Slot for a PersonNode owned by this family — placed as one of its children
// at the recorded local x.
export interface OwnedPersonSlot {
  node: PersonNode;
  localX: number;
}

export type AdultSlot = OwnedPersonSlot | Anchor | null;
export type KidSlot = OwnedPersonSlot | Anchor;

function isOwned(slot: OwnedPersonSlot | Anchor): slot is OwnedPersonSlot {
  return 'node' in slot;
}

function slotPersonId(slot: OwnedPersonSlot | Anchor) {
  return isOwned(slot) ? slot.node.personId : slot.personId;
}

// Place an owned slot's PersonNode at the slot's localX and the given row
// y; returns the node (for adding to children) or null when the slot is
// empty or an Anchor.
function placeOwned(slot: AdultSlot | KidSlot, y: number) {
  if (slot === null || !isOwned(slot)) return null;
  const { node, localX } = slot;
  node.offset = { x: localX, y };
  return node;
}

export interface FamilyNodeSpec {
  famId: number;
  husband: AdultSlot;
  wife: AdultSlot;
  kids: readonly KidSlot[];
  // Couple-Tie Y in the local frame. Adults sit at y=0; kids at y=ROW_PITCH.
  tieY: number;
  // Sibship drop origin in the local frame.
  childAnchor: Point;
}

export class FamilyNode extends LayoutNode {
  readonly selfHalfWidth = 0;
  readonly children: readonly LayoutNode[];

  constructor(readonly spec: FamilyNodeSpec) {
    super();
    const placed: LayoutNode[] = [];
    for (const adult of [spec.husband, spec.wife]) {
      const node = placeOwned(adult, 0);
      if (node !== null) placed.push(node);
    }
    for (const kid of spec.kids) {
      const node = placeOwned(kid, ROW_PITCH);
      if (node !== null) placed.push(node);
    }
    this.children = placed;
  }

  lines() {
    const out: Line[] = [];
    const { husband, wife, kids, famId, tieY } = this.spec;
    if (husband !== null && wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(husband.localX, wife.localX);
      const rightX = Math.max(husband.localX, wife.localX);
      out.push({
        key: `tie-${famId}`,
        from: { x: leftX + BOX_W / 2, y: tieY },
        to: { x: rightX - BOX_W / 2, y: tieY }
      });
    }
    if (kids.length > 0) {
      this.appendSibshipLines(out);
    }
    return out;
  }

  private appendSibshipLines(out: Line[]) {
    const { famId, kids, childAnchor } = this.spec;
    const busY = ROW_PITCH / 2;
    // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
    // The bar spans the union of childAnchor.x and the kid Xs — so a
    // one-kid sibship where the Tie sits off the kid's column (depth ≥ 2)
    // still connects via a horizontal bar from the drop to the kid's leg.
    out.push({
      key: `sib-${famId}-drop`,
      from: childAnchor,
      to: { x: childAnchor.x, y: busY }
    });
    let minX = childAnchor.x;
    let maxX = childAnchor.x;
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
}
