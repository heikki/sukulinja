// FamilyNode — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonNodes, not this node; slots whose PersonNode lives
// in an upstream node (or doesn't exist, e.g. unknown spouse) carry node=null
// and contribute only their position to line geometry.
//
// Pivot conventions, set by the builder, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

import { LayoutNode } from './layout-node';
import type { PersonNode } from './person-node';

// Position of a person in this family's frame. `node` is non-null when this
// FamilyNode owns the PersonNode (and places it as a child during construction);
// null when the PersonNode lives in an upstream node or doesn't exist. `personId`
// is always populated for line keys and `node`-less lookups; when `node` is
// non-null it must equal `node.personId`.
export interface PersonSlot {
  node: PersonNode | null;
  personId: number;
  localX: number;
}

// Adult slot; null = no adult present (lone parent).
export type AdultSlot = PersonSlot | null;

// Semantic position of a FamilyNode's Couple Tie. Resolved to a y by emit.
//   centered          → primary marriages and the chart-root parent FN
//   nonprimary-left   → non-primary marriage fanning to the left side
//   nonprimary-right  → non-primary marriage fanning to the right side
export type TieKind = 'centered' | 'nonprimary-left' | 'nonprimary-right';

// Semantic position of the Child anchor (see CONTEXT.md). y is determined by
// kind; x is the local pivot to drop from.
//   tie-midpoint  → Couple Tie midpoint (primary / centered marriages)
//   box-bottom    → bottom edge of an adult's box (non-primary, lone parent)
export interface ChildAnchor {
  x: number;
  kind: 'tie-midpoint' | 'box-bottom';
}

// Returns the owned PersonNode (after setting its offset) or null when the
// slot is empty or its PersonNode lives upstream.
function placeOwned(slot: PersonSlot | null, y: number) {
  if (slot === null) return null;
  const { node, localX } = slot;
  if (node === null) return null;
  node.offset = { x: localX, y };
  return node;
}

interface FamilyNodeArgs {
  famId: number;
  husband: AdultSlot;
  wife: AdultSlot;
  kids: readonly PersonSlot[];
  // Couple-Tie position (semantic). Resolved to a pixel y by emit.
  tieKind: TieKind;
  // Sibship drop origin in the local frame.
  childAnchor: ChildAnchor;
}

export class FamilyNode extends LayoutNode {
  readonly selfHalfWidth = 0;
  readonly children: readonly LayoutNode[];
  readonly famId: number;
  readonly husband: AdultSlot;
  readonly wife: AdultSlot;
  readonly kids: readonly PersonSlot[];
  readonly tieKind: TieKind;
  readonly childAnchor: ChildAnchor;

  constructor(args: FamilyNodeArgs) {
    super();
    this.famId = args.famId;
    this.husband = args.husband;
    this.wife = args.wife;
    this.kids = args.kids;
    this.tieKind = args.tieKind;
    this.childAnchor = args.childAnchor;
    const children: LayoutNode[] = [];
    for (const adult of [args.husband, args.wife]) {
      const node = placeOwned(adult, 0);
      if (node !== null) children.push(node);
    }
    for (const kid of args.kids) {
      const node = placeOwned(kid, 1);
      if (node !== null) children.push(node);
    }
    this.children = children;
  }
}
