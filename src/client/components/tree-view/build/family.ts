// FamilyNode construction. anchorSide picks the mode:
//   omitted → centered (both adults owned here, Tie at family-local 0)
//   'husband'/'wife' → anchored (named side lives upstream as an Anchor)

import { BOX_H, COUPLE_PITCH, HALF_PITCH, isPersonKnown } from '../helpers';
import type { LayoutIndices, Point } from '../helpers';
import { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import type { AdultSlot, KidSlot } from '../nodes/types';

export interface SpousePlacement {
  xSpouse: number;
  childAnchor: Point;
  tieY: number;
}

export type AdultArg = PersonNode | { personId: number } | null;

export interface FamilyArgs {
  famId: number;
  husband: AdultArg;
  wife: AdultArg;
  kids: readonly KidSlot[];
  anchorSide?: 'husband' | 'wife';
  // Centered-mode: Tie's family-local X. Defaults to 0.
  tieXLocal?: number;
  // Anchored-mode: spouse placement. Defaults to primary (husband-left).
  placement?: SpousePlacement;
  // Anchored-mode: lets a non-anchor `{ personId }` resolve to a rendered
  // bare PersonNode when known; otherwise it stays a position-only Anchor.
  ix?: LayoutIndices;
}

export function buildFamily(args: FamilyArgs): FamilyNode {
  return args.anchorSide === undefined
    ? buildCentered(args)
    : buildAnchored(args, args.anchorSide);
}

function buildCentered(args: FamilyArgs): FamilyNode {
  const husbandNode = args.husband instanceof PersonNode ? args.husband : null;
  const wifeNode = args.wife instanceof PersonNode ? args.wife : null;
  const tieXLocal = args.tieXLocal ?? 0;
  const placed = placeCenteredCouple(husbandNode, wifeNode, tieXLocal);
  return new FamilyNode({
    famId: args.famId,
    husband: placed.husband,
    wife: placed.wife,
    kids: args.kids,
    childAnchor: placed.childAnchor,
    tieY: 0
  });
}

function placeCenteredCouple(
  husbandNode: PersonNode | null,
  wifeNode: PersonNode | null,
  tieXLocal: number
) {
  if (husbandNode !== null && wifeNode !== null) {
    return {
      husband: { node: husbandNode, localX: tieXLocal - HALF_PITCH },
      wife: { node: wifeNode, localX: tieXLocal + HALF_PITCH },
      childAnchor: { x: tieXLocal, y: 0 }
    };
  }
  // Lone parent: drop from the present adult's box bottom so the sibship
  // Bar lines up vertically with their column.
  const anyPresent = husbandNode !== null || wifeNode !== null;
  return {
    husband: husbandNode === null ? null : { node: husbandNode, localX: 0 },
    wife: wifeNode === null ? null : { node: wifeNode, localX: 0 },
    childAnchor: { x: 0, y: anyPresent ? BOX_H / 2 : 0 }
  };
}

function buildAnchored(
  args: FamilyArgs,
  anchorSide: 'husband' | 'wife'
): FamilyNode {
  const placement = args.placement ?? defaultPrimaryPlacement(anchorSide);
  const anchorAdult: AdultSlot = anchorAdultSlot(
    anchorSide === 'husband' ? args.husband : args.wife,
    0
  );
  const spouseAdult: AdultSlot = spouseAdultSlot(
    anchorSide === 'husband' ? args.wife : args.husband,
    placement.xSpouse,
    args.ix
  );
  return new FamilyNode({
    famId: args.famId,
    husband: anchorSide === 'husband' ? anchorAdult : spouseAdult,
    wife: anchorSide === 'husband' ? spouseAdult : anchorAdult,
    kids: args.kids,
    childAnchor: placement.childAnchor,
    tieY: placement.tieY
  });
}

function defaultPrimaryPlacement(
  anchorSide: 'husband' | 'wife'
): SpousePlacement {
  // Husband-left: anchor-on-husband → spouse fans right; anchor-on-wife → left.
  const fanDir = anchorSide === 'husband' ? 1 : -1;
  const xSpouse = fanDir * COUPLE_PITCH;
  return { xSpouse, childAnchor: { x: xSpouse / 2, y: 0 }, tieY: 0 };
}

// Anchor side: the PersonNode lives upstream (e.g. the sibling's outer node
// owns the FamilyNode), so the slot must stay position-only here — promoting
// it again would emit a duplicate Box for the same personId.
function anchorAdultSlot(arg: AdultArg, localX: number): AdultSlot {
  if (arg === null) return null;
  if (arg instanceof PersonNode) return { node: arg, localX };
  return { personId: arg.personId, localX };
}

// Spouse side: no upstream PersonNode exists for this person. Promote to a
// bare PersonNode when known so a box draws; otherwise keep position-only.
function spouseAdultSlot(
  arg: AdultArg,
  localX: number,
  ix: LayoutIndices | undefined
): AdultSlot {
  if (arg === null) return null;
  if (arg instanceof PersonNode) return { node: arg, localX };
  if (ix !== undefined && isPersonKnown(arg.personId, ix)) {
    return { node: new PersonNode(arg.personId, null, [], null), localX };
  }
  return { personId: arg.personId, localX };
}
