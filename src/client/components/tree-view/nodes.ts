// LayoutNode is the abstract base for the layout tree. Concrete nodes are
// PersonNode (one person box) and FamilyNode (one Couple Tie + sibship).
// Each LayoutNode carries its own `offset` relative to its parent — set by
// the parent during construction. Extents bubble up the tree via the
// `extents` getter, which composes children's extents with `selfHalfWidth`.
// The tree is consumed by the emit pass (see emit.ts), which walks once
// and produces a flat ID-keyed EmitOutput for rendering.

import { BOX_H, BOX_W, ROW_PITCH, translatePoint } from './helpers';
import type { Extents, Point } from './helpers';

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

export abstract class LayoutNode {
  // Position relative to this node's parent. A FamilyNode sets its owned
  // PersonNodes' offsets from the slot's localX; a PersonNode sets its
  // FamilyNode children's offsets from their row position.
  offset: Point = { x: 0, y: 0 };

  abstract readonly children: readonly LayoutNode[];

  // How far this node's own box reaches from its pivot.
  abstract readonly selfHalfWidth: number;

  personLocalPos(personId: number): Point | null {
    for (const child of this.children) {
      const inner = child.personLocalPos(personId);
      if (inner !== null) return translatePoint(child.offset, inner);
    }
    return null;
  }

  private cachedExtents: Extents | null = null;
  get extents(): Extents {
    if (this.cachedExtents !== null) return this.cachedExtents;
    let left = this.selfHalfWidth;
    let right = this.selfHalfWidth;
    for (const c of this.children) {
      left = Math.max(left, c.extents.left - c.offset.x);
      right = Math.max(right, c.offset.x + c.extents.right);
    }
    this.cachedExtents = { left, right };
    return this.cachedExtents;
  }
}

// PersonNode — exactly one person. Recursion through the chart happens
// here: `childhoodFamily` (the Family this person is a child in) is placed
// above; each non-null entry in `marriages` (Families this person is a
// spouse in) is placed below.
//
// Marriages are stored in chronological order. `activeMarriageIndex` marks
// which one is rendered in "primary couple" style — the marriage adjacent
// to this person in the chart. A `null` entry at the active slot means
// the active marriage is owned by an outer FamilyNode (the bloodline-
// ancestor case: Fa.marriages has a null at the bloodline slot because
// the bloodline FamilyNode lives in the parent FamilyNode above). Roles:
//
//   - focus:    marriages = [...all, primary at the last slot], activeIdx = last
//   - sibling:  marriages = [primary],                          activeIdx = 0
//   - ancestor: marriages = [...stepFams, null at bloodline,...] (chronological),
//               activeIdx = bloodline position in spouseFams
//   - bare:     marriages = [], activeIdx = null
export class PersonNode extends LayoutNode {
  readonly selfHalfWidth = BOX_W / 2;
  readonly children: readonly LayoutNode[];

  constructor(
    readonly personId: number,
    readonly childhoodFamily: FamilyNode | null,
    readonly marriages: ReadonlyArray<FamilyNode | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    const placed: LayoutNode[] = [];
    for (const m of marriages) {
      // Marriage FamilyNodes are built fresh by their PersonNode owner and
      // their default offset (0, 0) is already what we want here.
      if (m !== null) placed.push(m);
    }
    const cf = childhoodFamily;
    if (cf !== null) {
      cf.offset = { x: 0, y: -ROW_PITCH };
      placed.push(cf);
    }
    this.children = placed;
  }

  override personLocalPos(personId: number) {
    if (personId === this.personId) return { x: 0, y: 0 };
    return super.personLocalPos(personId);
  }
}

// FamilyNode — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonNodes, not this node; anchor members (whose
// PersonNode lives in an upstream node) appear as an `Anchor` carrying
// only the local x needed for line geometry.
//
// Pivot conventions, set by the builder, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

// Position-only slot for a person whose PersonNode lives in an upstream
// node. Carries the personId (for line keys) and the local x in this family's
// frame (for tie/sibship geometry).
export interface Anchor {
  personId: number;
  localX: number;
}

// Slot for a PersonNode owned by this family — placed as one of its children
// at the recorded local x.
interface OwnedPersonSlot {
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
    const placed: LayoutNode[] = [];
    for (const adult of [args.husband, args.wife]) {
      const node = placeOwned(adult, 0);
      if (node !== null) placed.push(node);
    }
    for (const kid of args.kids) {
      const node = placeOwned(kid, ROW_PITCH);
      if (node !== null) placed.push(node);
    }
    this.children = placed;
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
