// Top-level chart assembly. Composes the focus row with the ancestor stack,
// adds cross-Block edges (parent Couple Tie, step ties), and walks the
// Block tree to produce a structured RenderOutput (nested transform groups
// for boxes + flat absolute-coord lines for edges).
//
// The Block-tree architecture and the asymmetric sibship rule are documented
// in docs/adr/0001-tree-view-layout-architecture.md.
//
// Couples (bloodline parents) separate by the union of their sub-trees'
// widths so a deep ancestor branch on one side can't crash into the other
// side's branch. COUPLE_PITCH is the floor for shallow trees.

import { buildAncestorBranchBlock, renderChartBlocks } from './block';
import type { AncestorBranchBlock, PlacedBlock, RenderOutput } from './block';
import { layoutFocusRow } from './focus-row';
import { BOX_W, COUPLE_GAP, COUPLE_PITCH, ROW_H } from './helpers';
import type { LayoutIndices, Line } from './helpers';

export type { LayoutIndices } from './helpers';

// Y offset for step-parent ties off the bloodline Couple Tie at y=-ROW_H,
// so the two are visually distinguishable when they cross. Step ties on the
// right of their bloodline parent sit below; ties on the left sit above.
const STEP_TIE_Y_OFFSET = 6;

interface AncestorTrees {
  paternalBlock: AncestorBranchBlock | null;
  maternalBlock: AncestorBranchBlock | null;
  parentFamId: number | null;
  sep: number;
}

function ancestorBranchOrNull(
  parentId: number | null,
  ix: LayoutIndices
): AncestorBranchBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  return buildAncestorBranchBlock(parentId, 1, ix);
}

function computeAncestorTrees(
  focusId: number,
  ix: LayoutIndices
): AncestorTrees {
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam === undefined || ix.levels < 1) {
    return {
      paternalBlock: null,
      maternalBlock: null,
      parentFamId: null,
      sep: 0
    };
  }
  const paternalBlock = ancestorBranchOrNull(parentFam.husband_id, ix);
  const maternalBlock = ancestorBranchOrNull(parentFam.wife_id, ix);
  const sep =
    paternalBlock !== null && maternalBlock !== null
      ? Math.max(
          COUPLE_PITCH,
          paternalBlock.rightWidth + maternalBlock.leftWidth + COUPLE_GAP
        )
      : 0;
  return { paternalBlock, maternalBlock, parentFamId: parentFam.id, sep };
}

interface ParentPlacement {
  fatherX: number | null;
  motherX: number | null;
}

function placeAncestorBranches(
  trees: AncestorTrees,
  anchorX: number,
  out: PlacedBlock[]
): ParentPlacement {
  if (trees.paternalBlock !== null && trees.maternalBlock !== null) {
    const fatherX = anchorX - trees.sep / 2;
    const motherX = anchorX + trees.sep / 2;
    out.push(
      { block: trees.paternalBlock, offsetX: fatherX, offsetY: -ROW_H },
      { block: trees.maternalBlock, offsetX: motherX, offsetY: -ROW_H }
    );
    return { fatherX, motherX };
  }
  if (trees.paternalBlock !== null) {
    out.push({
      block: trees.paternalBlock,
      offsetX: anchorX,
      offsetY: -ROW_H
    });
    return { fatherX: anchorX, motherX: null };
  }
  if (trees.maternalBlock !== null) {
    out.push({
      block: trees.maternalBlock,
      offsetX: anchorX,
      offsetY: -ROW_H
    });
    return { fatherX: null, motherX: anchorX };
  }
  return { fatherX: null, motherX: null };
}

interface StepTieEndpoints {
  bloodlineX: number;
  stepX: number;
  famId: number;
}

function appendStepTies(
  endpoints: readonly StepTieEndpoints[],
  out: Line[]
): void {
  for (const ep of endpoints) {
    const onRight = ep.stepX > ep.bloodlineX;
    const tieY = -ROW_H - STEP_TIE_Y_OFFSET * (onRight ? 1 : -1);
    const left = onRight ? ep.bloodlineX + BOX_W / 2 : ep.stepX + BOX_W / 2;
    const right = onRight ? ep.stepX - BOX_W / 2 : ep.bloodlineX - BOX_W / 2;
    out.push({
      key: `tie-${ep.famId}`,
      x1: left,
      y1: tieY,
      x2: right,
      y2: tieY
    });
  }
}

export function buildChart(
  focusId: number,
  ix: LayoutIndices
): RenderOutput | null {
  if (!ix.persons.has(focusId)) return null;

  const trees = computeAncestorTrees(focusId, ix);
  const focusRow = layoutFocusRow(focusId, ix, { sep: trees.sep });

  const placedBlocks: PlacedBlock[] = [...focusRow.placedSlots];
  const flatLines: Line[] = [...focusRow.lines];

  const anchorX = focusRow.parentAnchorX ?? 0;
  const parents = placeAncestorBranches(trees, anchorX, placedBlocks);

  // Parent Couple Tie between Father and Mother at parent row.
  if (
    trees.parentFamId !== null &&
    parents.fatherX !== null &&
    parents.motherX !== null
  ) {
    flatLines.push({
      key: `tie-${trees.parentFamId}`,
      x1: parents.fatherX + BOX_W / 2,
      y1: -ROW_H,
      x2: parents.motherX - BOX_W / 2,
      y2: -ROW_H
    });
  }

  // Cross-Block step ties.
  const stepEndpoints: StepTieEndpoints[] = [];
  for (const step of focusRow.stepFams) {
    const bloodlineX =
      step.side === 'mother' ? parents.motherX : parents.fatherX;
    if (bloodlineX === null) continue;
    stepEndpoints.push({
      bloodlineX,
      stepX: step.stepX,
      famId: step.famId
    });
  }
  appendStepTies(stepEndpoints, flatLines);

  return renderChartBlocks(placedBlocks, flatLines);
}
