// Step-fam handling for ancestor PersonBlocks (Fa and Mo).
//
// Fa.PB.marriages keeps every non-bloodline spouseFams entry as a step-fam
// FamilyBlock, in chronological order, with `null` at the bloodline slot
// (the active marriage is rendered by the parent FB above).
//
// Each step-fam FB is placed at PB(parent)-local (0, 0). The step-spouse's
// FB-local X is sized so the step-fam clears the bloodline kid row's chart
// extents. Sibship drops from the step-spouse box bottom, and Tie Y is
// offset slightly above/below the bloodline Tie for visual distinction.

import type { AdultPlacement, FamilyBlock, KidPlacement } from './block-family';
import { PersonBlock } from './block-person';
import {
  buildMarriageFamilyBlock,
  packBlocks,
  type PackedBlocks
} from './build-marriages';
import {
  BOX_H,
  BOX_W,
  isHusbandIn,
  otherSpouseOf,
  presentChildren,
  SIBLING_GAP
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

const NONPRIMARY_TIE_Y_OFFSET = 6;

export interface BuildAncestorWithStepFamsArgs {
  personId: number;
  childhoodFamily: FamilyBlock | null;
  bloodlineFamId: number;
  parentChartX: number;
  side: 'left' | 'right';
  bloodlineLeftChart: number;
  bloodlineRightChart: number;
  ix: LayoutIndices;
}

export function buildAncestorPBWithStepFams(
  args: BuildAncestorWithStepFamsArgs
): PersonBlock {
  const { personId, childhoodFamily, bloodlineFamId, side, ix } = args;
  const allFams = ix.spouseFamsByPerson.get(personId) ?? [];
  const bloodlineIdx = allFams.findIndex((f) => f.id === bloodlineFamId);
  if (bloodlineIdx === -1) {
    return new PersonBlock(personId, childhoodFamily, [], null);
  }

  const marriages: Array<FamilyBlock | null> = Array.from(
    { length: allFams.length },
    () => null
  );

  // All non-bloodline marriages fan outward on the parent's own side
  // (Fa's step-spouses to Fa's left; Mo's to Mo's right). They sit past
  // the bloodline footprint — the union of Aunts/Uncles at parent row
  // and Focus's sibship at the kid row. Sitting past the Aunts/Uncles
  // ensures the GP couple's vertical drop doesn't cross the step-spouse's
  // column; sitting past the focus row keeps the half-sibship clear of
  // Focus's full siblings.
  const startEdge =
    side === 'right' ? args.bloodlineRightChart : args.bloodlineLeftChart;
  let outer = startEdge;
  for (const i of nonBloodlineFanOrder(allFams.length, bloodlineIdx)) {
    const fam = allFams[i]!;
    if (!isMeaningful(fam, personId, ix)) continue;
    const built = buildSidedStepFamFB({
      personId,
      fam,
      side,
      parentChartX: args.parentChartX,
      outerEdge: outer,
      ix
    });
    marriages[i] = built.fb;
    outer = built.newOuter;
  }

  return new PersonBlock(personId, childhoodFamily, marriages, bloodlineIdx);
}

// Fan order: the bloodline marriage's immediate chronological neighbours
// land adjacent to the parent, then progressively further out.
function nonBloodlineFanOrder(
  n: number,
  bloodlineIdx: number
): readonly number[] {
  const out: number[] = [];
  for (let step = 1; step < n; step += 1) {
    const post = bloodlineIdx + step;
    const pre = bloodlineIdx - step;
    if (post < n) out.push(post);
    if (pre >= 0) out.push(pre);
  }
  return out;
}

interface BuildSidedStepFamArgs {
  personId: number;
  fam: FamilyRow;
  side: 'left' | 'right';
  parentChartX: number;
  outerEdge: number;
  ix: LayoutIndices;
}

interface StepFamExtents {
  extentLeft: number;
  extentRight: number;
}

function stepFamExtents(
  packed: PackedBlocks,
  kidBlocks: readonly PersonBlock[]
): StepFamExtents {
  if (kidBlocks.length === 0) {
    return { extentLeft: BOX_W / 2, extentRight: BOX_W / 2 };
  }
  const extentLeft = Math.max(
    BOX_W / 2,
    packed.barMid - packed.positions[0]! + kidBlocks[0]!.leftWidth
  );
  const extentRight = Math.max(
    BOX_W / 2,
    packed.positions[packed.positions.length - 1]! -
      packed.barMid +
      kidBlocks[kidBlocks.length - 1]!.rightWidth
  );
  return { extentLeft, extentRight };
}

function buildSidedStepFamFB(args: BuildSidedStepFamArgs): {
  fb: FamilyBlock;
  newOuter: number;
} {
  const { personId, fam, side, parentChartX, outerEdge, ix } = args;
  const halfSibIds = presentChildren(fam, ix);
  const kidBlocks: PersonBlock[] = halfSibIds.map(
    (cid) => new PersonBlock(cid, null, [], null)
  );
  const packed = packBlocks(kidBlocks);
  const { extentLeft, extentRight } = stepFamExtents(packed, kidBlocks);

  const xSpouse =
    side === 'right'
      ? outerEdge + SIBLING_GAP - parentChartX + extentLeft
      : outerEdge - SIBLING_GAP - parentChartX - extentRight;
  const newOuter =
    side === 'right'
      ? parentChartX + xSpouse + extentRight
      : parentChartX + xSpouse - extentLeft;

  const placement = {
    xSpouse,
    anchorX: xSpouse,
    anchorY: BOX_H / 2,
    tieY: xSpouse >= 0 ? -NONPRIMARY_TIE_Y_OFFSET : NONPRIMARY_TIE_Y_OFFSET
  };

  const otherId = otherSpouseOf(fam, personId);
  const externalIsHusband = isHusbandIn(fam, personId);
  const externalAdult: AdultPlacement = {
    id: personId,
    external: true,
    x: 0,
    block: null
  };
  const renderedSpouseId =
    otherId !== null && ix.persons.has(otherId) ? otherId : null;
  const spouseAdult: AdultPlacement | null =
    otherId === null
      ? null
      : {
          id: otherId,
          external: renderedSpouseId === null,
          x: xSpouse,
          block:
            renderedSpouseId === null
              ? null
              : new PersonBlock(renderedSpouseId, null, [], null)
        };

  const kidXs = packed.positions.map(
    (p) => p - packed.barMid + placement.anchorX
  );
  const kids: KidPlacement[] = kidBlocks.map((kb, i) => ({
    id: kb.personId,
    external: false,
    x: kidXs[i]!,
    block: kb
  }));

  const fb = buildMarriageFamilyBlock({
    husband: externalIsHusband ? externalAdult : spouseAdult,
    wife: externalIsHusband ? spouseAdult : externalAdult,
    kids,
    famId: fam.id,
    anchorX: placement.anchorX,
    anchorY: placement.anchorY,
    tieY: placement.tieY
  });
  return { fb, newOuter };
}

function isMeaningful(
  f: FamilyRow,
  personId: number,
  ix: LayoutIndices
): boolean {
  return (
    presentChildren(f, ix).length > 0 || otherSpouseOf(f, personId) !== null
  );
}
