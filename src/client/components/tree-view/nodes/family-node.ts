// FamilyNode — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonNodes, not this node; anchor members (whose
// PersonNode lives in an upstream node) appear as an `Anchor` carrying
// only the local x needed for line geometry.
//
// Pivot conventions, set by the builder, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

import { ROW_PITCH } from '../helpers';
import type { Point } from '../helpers';
import { LayoutNode } from './layout-node';
import type { AdultSlot, Anchor, KidSlot, OwnedPersonSlot } from './types';

function isOwned(slot: OwnedPersonSlot | Anchor): slot is OwnedPersonSlot {
  return 'node' in slot;
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
}
