// FamilyNode — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonNodes, not this node; anchor members (whose
// PersonNode lives in an upstream node) appear as an `Anchor` carrying
// only the local x needed for line geometry.
//
// Pivot conventions, set by the builder, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

import { BOX_H, BOX_W, ROW_PITCH } from '../helpers';
import type { Point } from '../helpers';
import { LayoutNode } from './layout-node';
import type {
  AdultSlot,
  Anchor,
  KidSlot,
  Line,
  OwnedPersonSlot
} from './types';

function isOwned(slot: OwnedPersonSlot | Anchor): slot is OwnedPersonSlot {
  return 'node' in slot;
}

function slotPersonId(slot: OwnedPersonSlot | Anchor) {
  return isOwned(slot) ? slot.node.personId : slot.personId;
}

// Returns null when the slot is empty or an Anchor (nothing to place).
function placeOwned(slot: AdultSlot | KidSlot, y: number) {
  if (slot === null || !isOwned(slot)) return null;
  const { node, localX } = slot;
  node.offset = { x: localX, y };
  return node;
}

interface FamilyNodeArgs {
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
  readonly famId: number;
  readonly husband: AdultSlot;
  readonly wife: AdultSlot;
  readonly kids: readonly KidSlot[];
  readonly tieY: number;
  readonly childAnchor: Point;

  constructor(args: FamilyNodeArgs) {
    super();
    this.famId = args.famId;
    this.husband = args.husband;
    this.wife = args.wife;
    this.kids = args.kids;
    this.tieY = args.tieY;
    this.childAnchor = args.childAnchor;
    const children: LayoutNode[] = [];
    for (const adult of [args.husband, args.wife]) {
      const node = placeOwned(adult, 0);
      if (node !== null) children.push(node);
    }
    for (const kid of args.kids) {
      const node = placeOwned(kid, ROW_PITCH);
      if (node !== null) children.push(node);
    }
    this.children = children;
  }

  lines() {
    const out: Line[] = [];
    if (this.husband !== null && this.wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(this.husband.localX, this.wife.localX);
      const rightX = Math.max(this.husband.localX, this.wife.localX);
      out.push({
        key: `tie-${this.famId}`,
        from: { x: leftX + BOX_W / 2, y: this.tieY },
        to: { x: rightX - BOX_W / 2, y: this.tieY }
      });
    }
    if (this.kids.length > 0) {
      this.appendSibshipLines(out);
    }
    return out;
  }

  private appendSibshipLines(out: Line[]) {
    const { famId, kids, childAnchor } = this;
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
