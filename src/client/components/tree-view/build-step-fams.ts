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

import type { FamilyBlock } from './block-family';
import { PersonBlock } from './block-person';
import type { BloodlineFootprint } from './bloodline-footprint';
import { buildAnchorAdultFB, packBlocks } from './build-marriages';
import {
  BARE_PB_EXTENTS,
  BOX_H,
  isMeaningfulSpouseFam,
  NONPRIMARY_TIE_Y_OFFSET,
  presentChildren,
  SIBLING_GAP
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

interface BuildAncestorWithStepFamsArgs {
  personId: number;
  childhoodFamily: FamilyBlock | null;
  bloodlineFamId: number;
  footprint: BloodlineFootprint;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

export function buildAncestorPBWithStepFams(
  args: BuildAncestorWithStepFamsArgs
) {
  const { personId, childhoodFamily, bloodlineFamId, footprint, side, ix } =
    args;
  const allFams = ix.spouseFamsByPerson.get(personId) ?? [];
  const bloodlineIdx = allFams.findIndex((f) => f.id === bloodlineFamId);
  if (bloodlineIdx === -1) {
    return new PersonBlock(personId, childhoodFamily, [], null);
  }

  const marriages: Array<FamilyBlock | null> = Array.from(
    { length: allFams.length },
    () => null
  );

  // All non-bloodline marriages fan outward on the parent's own side (Fa's
  // step-spouses to Fa's left; Mo's to Mo's right), past the footprint's
  // outer edge — the union of the kid row's reach and Fa/Mo's own boxes.
  // Aunts/Uncles in turn fan past the step-fams. Together these ensure the
  // GP couple's vertical drop doesn't cross the step-spouse's column and
  // the half-sibship stays clear of Focus's full siblings.
  const parentChartX = footprint.parentChartX(side);
  let outer = footprint.outerEdge(side);
  for (const i of nonBloodlineFanOrder(allFams.length, bloodlineIdx)) {
    const fam = allFams[i]!;
    if (!isMeaningfulSpouseFam(fam, personId, ix)) continue;
    const built = buildSidedStepFamFB({
      personId,
      fam,
      side,
      parentChartX,
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
function nonBloodlineFanOrder(n: number, bloodlineIdx: number) {
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

// Step-fam kids are always bare PBs (half-siblings render as boxes only —
// no marriages, no ancestry, no children), so the extent is fully
// determined by the kid count.
function stepFamExtents(kidCount: number) {
  if (kidCount === 0) return BARE_PB_EXTENTS;
  const packed = packBlocks(
    Array.from({ length: kidCount }, () => BARE_PB_EXTENTS)
  );
  return {
    left: packed.barMid - packed.positions[0]! + BARE_PB_EXTENTS.left,
    right:
      packed.positions[packed.positions.length - 1]! -
      packed.barMid +
      BARE_PB_EXTENTS.right
  };
}

function buildSidedStepFamFB(args: BuildSidedStepFamArgs) {
  const { personId, fam, side, parentChartX, outerEdge, ix } = args;
  const halfSibIds = presentChildren(fam, ix);
  const kidBlocks: PersonBlock[] = halfSibIds.map(
    (cid) => new PersonBlock(cid, null, [], null)
  );
  const packed = packBlocks(kidBlocks.map((k) => k.extents));
  const extents = stepFamExtents(kidBlocks.length);

  const xSpouse =
    side === 'right'
      ? outerEdge + SIBLING_GAP - parentChartX + extents.left
      : outerEdge - SIBLING_GAP - parentChartX - extents.right;
  const newOuter =
    side === 'right'
      ? parentChartX + xSpouse + extents.right
      : parentChartX + xSpouse - extents.left;

  const fb = buildAnchorAdultFB({
    anchorAdultId: personId,
    fam,
    kidBlocks,
    packed,
    placement: {
      xSpouse,
      childAnchor: { x: xSpouse, y: BOX_H / 2 },
      tieY: xSpouse >= 0 ? -NONPRIMARY_TIE_Y_OFFSET : NONPRIMARY_TIE_Y_OFFSET
    },
    ix
  });
  return { fb, newOuter };
}

export function measureStepFamsExtent(
  personId: number,
  bloodlineFamId: number,
  ix: LayoutIndices
) {
  const allFams = ix.spouseFamsByPerson.get(personId) ?? [];
  let total = 0;
  for (const fam of allFams) {
    if (fam.id === bloodlineFamId) continue;
    if (!isMeaningfulSpouseFam(fam, personId, ix)) continue;
    const extents = stepFamExtents(presentChildren(fam, ix).length);
    total += extents.left + extents.right + SIBLING_GAP;
  }
  return total;
}
