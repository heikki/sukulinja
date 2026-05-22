// FamilyNode construction in two modes:
//   buildCenteredFamily — both adults owned here, Tie at tieXLocal.
//     Used for the chart-root parent FN and ancestor childhood Families.
//   buildAnchoredFamily — one adult (anchorId) anchored at localX=0, spouse
//     fans to placement.xSpouse. Used for Focus's marriages, descendant
//     marriages, and the parent-row Step-fam fan.

import type { FamilyRow } from '@common/types';

import { isPersonKnown, otherSpouseOf } from '../helpers';
import type { LayoutIndices } from '../helpers';
import { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import type { AdultSlot, ChildAnchor, KidSlot, TieKind } from '../nodes/types';
import { buildSibship } from './sibship';
import type { Sibship } from './sibship';

export interface SpousePlacement {
  xSpouse: number;
  childAnchor: ChildAnchor;
  tieKind: TieKind;
}

export interface CenteredFamilyArgs {
  famId: number;
  husband: PersonNode | null;
  wife: PersonNode | null;
  kids: readonly KidSlot[];
  // Family-local Tie X. Defaults to 0.
  tieXLocal?: number;
}

export function buildCenteredFamily(args: CenteredFamilyArgs) {
  const tieXLocal = args.tieXLocal ?? 0;
  const placed = placeCenteredCouple(args.husband, args.wife, tieXLocal);
  return new FamilyNode({
    famId: args.famId,
    husband: placed.husband,
    wife: placed.wife,
    kids: args.kids,
    childAnchor: placed.childAnchor,
    tieKind: 'centered'
  });
}

interface CenteredCouplePlacement {
  husband: AdultSlot;
  wife: AdultSlot;
  childAnchor: ChildAnchor;
}

function placeCenteredCouple(
  husbandNode: PersonNode | null,
  wifeNode: PersonNode | null,
  tieXLocal: number
): CenteredCouplePlacement {
  if (husbandNode !== null && wifeNode !== null) {
    return {
      husband: { node: husbandNode, localX: tieXLocal - 0.5 },
      wife: { node: wifeNode, localX: tieXLocal + 0.5 },
      childAnchor: { x: tieXLocal, kind: 'tie-midpoint' }
    };
  }
  // Lone parent: drop from the present adult's box bottom so the sibship
  // Bar lines up vertically with their column.
  return {
    husband: husbandNode === null ? null : { node: husbandNode, localX: 0 },
    wife: wifeNode === null ? null : { node: wifeNode, localX: 0 },
    childAnchor: {
      x: 0,
      kind:
        husbandNode !== null || wifeNode !== null
          ? 'box-bottom'
          : 'tie-midpoint'
    }
  };
}

export interface AnchoredFamilyArgs {
  anchorId: number;
  fam: FamilyRow;
  kidNodes: readonly PersonNode[];
  placement: SpousePlacement;
  ix: LayoutIndices;
  // Pre-packed sibship when the caller measured first to size the row.
  packed?: Sibship;
}

export function buildAnchoredFamily(args: AnchoredFamilyArgs) {
  const packed =
    args.packed ?? buildSibship(args.kidNodes.map((k) => k.extents));
  const kidXs = packed.kidXs(args.placement.childAnchor.x);
  const kids: KidSlot[] = args.kidNodes.map((node, i) => ({
    node,
    localX: kidXs[i]!
  }));

  const anchorIsHusband = args.fam.husband_id === args.anchorId;
  const otherId = otherSpouseOf(args.fam, args.anchorId);
  const anchorAdult: AdultSlot = { personId: args.anchorId, localX: 0 };
  const spouseAdult = resolveSpouseSlot(
    otherId,
    args.placement.xSpouse,
    args.ix
  );

  return new FamilyNode({
    famId: args.fam.id,
    husband: anchorIsHusband ? anchorAdult : spouseAdult,
    wife: anchorIsHusband ? spouseAdult : anchorAdult,
    kids,
    childAnchor: args.placement.childAnchor,
    tieKind: args.placement.tieKind
  });
}

// Spouse-side: no upstream PersonNode exists. Promote to a bare PersonNode
// when known (so a box draws); otherwise keep position-only.
function resolveSpouseSlot(
  spouseId: number | null,
  localX: number,
  ix: LayoutIndices
): AdultSlot {
  if (spouseId === null) return null;
  if (isPersonKnown(spouseId, ix)) {
    return { node: new PersonNode(spouseId, null, [], null), localX };
  }
  return { personId: spouseId, localX };
}
