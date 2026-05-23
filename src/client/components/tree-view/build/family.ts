// FamilyNode construction in two modes:
//   buildCenteredFamily — both adults owned here, Tie at tieXLocal.
//     Used for the chart-root parent FN and ancestor childhood Families.
//   buildAnchoredFamily — one adult (anchorId) anchored at localX=0, spouse
//     fans to placement.xSpouse. Used for Focus's marriages, descendant
//     marriages, and the parent-row Step-fam fan.

import type { FamilyRow } from '@common/types';

import { FamilyNode } from '../nodes/family-node';
import type {
  AdultSlot,
  ChildAnchor,
  PersonSlot,
  TieKind
} from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import { isPersonKnown, otherSpouseOf } from './indices';
import type { LayoutIndices } from './indices';
import { buildSibship } from './sibship';
import type { Sibship } from './sibship';

export interface SpousePlacement {
  xSpouse: number;
  childAnchor: ChildAnchor;
  tieKind: TieKind;
}

interface CenteredFamilyArgs {
  famId: number;
  husband: PersonNode | null;
  wife: PersonNode | null;
  kids: readonly PersonSlot[];
  // Family-local Tie X. Defaults to 0.
  tieXLocal?: number;
}

export function buildCenteredFamily(args: CenteredFamilyArgs) {
  const tieXLocal = args.tieXLocal ?? 0;
  const bothPresent = args.husband !== null && args.wife !== null;
  let husband: AdultSlot;
  let wife: AdultSlot;
  let childAnchor: ChildAnchor;
  if (bothPresent) {
    husband = ownedSlot(args.husband!, tieXLocal - 0.5);
    wife = ownedSlot(args.wife!, tieXLocal + 0.5);
    childAnchor = { x: tieXLocal, kind: 'tie-midpoint' };
  } else {
    // Lone parent: drop from the present adult's box bottom so the sibship
    // Bar lines up vertically with their column.
    husband = args.husband === null ? null : ownedSlot(args.husband, 0);
    wife = args.wife === null ? null : ownedSlot(args.wife, 0);
    childAnchor = {
      x: 0,
      kind:
        args.husband !== null || args.wife !== null
          ? 'box-bottom'
          : 'tie-midpoint'
    };
  }
  return new FamilyNode({
    famId: args.famId,
    husband,
    wife,
    kids: args.kids,
    childAnchor,
    tieKind: 'centered'
  });
}

function ownedSlot(node: PersonNode, localX: number): PersonSlot {
  return { node, personId: node.personId, localX };
}

interface AnchoredFamilyArgs {
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
  const kids: PersonSlot[] = args.kidNodes.map((node, i) =>
    ownedSlot(node, kidXs[i]!)
  );

  const anchorIsHusband = args.fam.husband_id === args.anchorId;
  const otherId = otherSpouseOf(args.fam, args.anchorId);
  // Anchor adult: PersonNode lives upstream — slot carries position only.
  const anchorAdult: PersonSlot = {
    node: null,
    personId: args.anchorId,
    localX: 0
  };
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
    return ownedSlot(new PersonNode(spouseId, null, [], null), localX);
  }
  return { node: null, personId: spouseId, localX };
}
