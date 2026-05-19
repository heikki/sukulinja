// Top-level chart assembly. Composes the focus row with the ancestor stack
// and returns the flat list of nodes + edges ready for rendering.
//
// The Sub-layout calculus and the asymmetric sibship rule are documented in
// docs/adr/0001-tree-view-layout-architecture.md.
//
// Couples (bloodline parents at every depth) separate by the union of their
// sub-trees' widths so a deep ancestor branch on one side can't crash into
// the other side's branch. The fixed COUPLE_PITCH still acts as a floor for
// shallow trees so the chart doesn't visually shrink when one side is small.
//
// Half-sibling families are NOT placed by this module — focus-row owns Y=0
// and assigns each non-mainFam (mother's other husbands' kids, father's
// other wives' kids) its own packed slot. composeBloodlineParents reads
// those slot positions back via `stepFams` and only draws the Tie line from
// each step-parent box (already shifted in focus-row's output) to the
// appropriate bloodline parent at parent row.

import { buildAncestorBranchBlock, flattenBlock } from './block';
import { layoutFocusRow, type StepFamPlacement } from './focus-row';
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  emptyLayout,
  linesOnly,
  ROW_H,
  shiftLayout,
  unionLayouts
} from './helpers';
import type {
  FamilyRow,
  LayoutIndices,
  Line,
  PositionedPerson,
  SubLayout
} from './helpers';

export type { LayoutIndices } from './helpers';

// Ancestor recursion is owned by block.ts (`buildAncestorBranchBlock`). The
// rest of layout still consumes the legacy SubLayout shape, so we flatten
// the Block tree into a SubLayout here at the boundary.
function ancestorOrNull(
  personId: number | null,
  depth: number,
  ix: LayoutIndices
): SubLayout | null {
  if (personId === null) return null;
  if (!ix.persons.has(personId)) return null;
  const block = buildAncestorBranchBlock(personId, depth, ix);
  const flat = flattenBlock(block, 0, -depth * ROW_H);
  return {
    leftWidth: block.leftWidth,
    rightWidth: block.rightWidth,
    nodes: flat.nodes,
    lines: flat.lines
  };
}

interface CoupleSide {
  sub: SubLayout;
  x: number;
}

interface ComposeCoupleArgs {
  fam: FamilyRow;
  father: CoupleSide | null;
  mother: CoupleSide | null;
  y: number;
  extras?: SubLayout[];
}

// Compose a (father, mother) pair into a SubLayout. When both are present the
// Tie line connects the inner box edges at y; anchorY = y. When only one is
// present, the lone sub stands alone and anchorY drops to box bottom (where
// drop lines below the Couple originate). Extras are unioned in unmodified —
// callers use this for step-parent ties at the parent row.
function composeCouple(args: ComposeCoupleArgs): {
  sub: SubLayout;
  anchorY: number;
} {
  const { fam, father, mother, y, extras = [] } = args;
  const parts: SubLayout[] = [];
  if (father !== null) parts.push(shiftLayout(father.sub, father.x));
  if (mother !== null) parts.push(shiftLayout(mother.sub, mother.x));
  if (father !== null && mother !== null) {
    parts.push(
      linesOnly([
        {
          key: `tie-${fam.id}`,
          x1: father.x + BOX_W / 2,
          y1: y,
          x2: mother.x - BOX_W / 2,
          y2: y
        }
      ])
    );
  }
  parts.push(...extras);
  const anchorY = father !== null && mother !== null ? y : y + BOX_H / 2;
  return { sub: unionLayouts(parts), anchorY };
}

// Couple sides anchored at anchorX with separation sep. Defaults (anchorX=0,
// sep derived from the two subs) give the centered local-pivot layout used
// by the ancestor recursion; explicit values give the chart-coord layout used
// by the bloodline parents at y=-ROW_H, where anchorX must match the focus
// row's sibship midpoint.
function coupleSides(
  fatherSub: SubLayout | null,
  motherSub: SubLayout | null,
  anchorX = 0,
  sep?: number
): { father: CoupleSide | null; mother: CoupleSide | null } {
  if (fatherSub !== null && motherSub !== null) {
    const s = sep ?? coupleSeparation(fatherSub, motherSub);
    return {
      father: { sub: fatherSub, x: anchorX - s / 2 },
      mother: { sub: motherSub, x: anchorX + s / 2 }
    };
  }
  if (fatherSub !== null) {
    return { father: { sub: fatherSub, x: anchorX }, mother: null };
  }
  if (motherSub !== null) {
    return { father: null, mother: { sub: motherSub, x: anchorX } };
  }
  return { father: null, mother: null };
}

// Husband–wife separation derived from each sub-tree's footprint. Each side
// reserves rightWidth (father) / leftWidth (mother) plus a COUPLE_GAP, and
// the symmetric placement keeps the Tie midpoint at the local pivot so the
// drop down to the bloodline child stays centred.
function coupleSeparation(fatherSub: SubLayout, motherSub: SubLayout): number {
  const required = fatherSub.rightWidth + motherSub.leftWidth + COUPLE_GAP;
  return Math.max(COUPLE_PITCH, required);
}

// Compose the whole chart around Focus at SVG (0,0). Returns null if Focus
// doesn't exist in the data.
interface BloodlineParentTrees {
  parentFam: FamilyRow | undefined;
  fatherSub: SubLayout | null;
  motherSub: SubLayout | null;
  sep: number;
}

function computeBloodlineParentTrees(
  focusId: number,
  ix: LayoutIndices
): BloodlineParentTrees {
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam === undefined || ix.levels < 1) {
    return { parentFam, fatherSub: null, motherSub: null, sep: 0 };
  }
  const fatherSub = ancestorOrNull(parentFam.husband_id, 1, ix);
  const motherSub = ancestorOrNull(parentFam.wife_id, 1, ix);
  const sep =
    fatherSub !== null && motherSub !== null
      ? coupleSeparation(fatherSub, motherSub)
      : 0;
  return { parentFam, fatherSub, motherSub, sep };
}

export function buildChart(
  focusId: number,
  ix: LayoutIndices
): { nodes: PositionedPerson[]; lines: Line[] } | null {
  if (!ix.persons.has(focusId)) return null;

  const trees = computeBloodlineParentTrees(focusId, ix);
  const focusAndBelow = layoutFocusRow(focusId, ix, { sep: trees.sep });

  const ancestorAbove =
    trees.parentFam === undefined ||
    (trees.fatherSub === null && trees.motherSub === null)
      ? emptyLayout()
      : composeBloodlineParents({
          parentFam: trees.parentFam,
          fatherSub: trees.fatherSub,
          motherSub: trees.motherSub,
          anchorX: focusAndBelow.parentAnchorX ?? 0,
          sep: trees.sep,
          stepFams: focusAndBelow.stepFams
        });

  const combined = unionLayouts([focusAndBelow.sub, ancestorAbove]);
  return { nodes: combined.nodes, lines: combined.lines };
}

interface ComposeBloodlineParentsArgs {
  parentFam: FamilyRow;
  fatherSub: SubLayout | null;
  motherSub: SubLayout | null;
  anchorX: number;
  sep: number;
  stepFams: StepFamPlacement[];
}

function composeBloodlineParents(args: ComposeBloodlineParentsArgs): SubLayout {
  const { parentFam, fatherSub, motherSub, anchorX, sep, stepFams } = args;
  const { father, mother } = coupleSides(fatherSub, motherSub, anchorX, sep);
  const { sub } = composeCouple({
    fam: parentFam,
    father,
    mother,
    y: -ROW_H,
    extras: [stepTies(stepFams, father?.x ?? null, mother?.x ?? null)]
  });
  return sub;
}

// Y offset for step-parent ties off the bloodline Couple Tie at y=-ROW_H,
// so the two are visually distinguishable when they cross. Step ties on the
// right of their bloodline parent sit below; ties on the left sit above.
const STEP_TIE_Y_OFFSET = 6;

// Draw a Tie line from each step-parent (already positioned at stepX by the
// focus-row pack) back to its bloodline parent (mother for mother-side fams,
// father for father-side fams).
function stepTies(
  stepFams: StepFamPlacement[],
  fatherX: number | null,
  motherX: number | null
): SubLayout {
  const lines: Line[] = [];
  for (const step of stepFams) {
    const bloodlineX = step.side === 'mother' ? motherX : fatherX;
    if (bloodlineX === null) continue;
    const onRight = step.stepX > bloodlineX;
    const tieY = -ROW_H - STEP_TIE_Y_OFFSET * (onRight ? 1 : -1);
    const left = onRight ? bloodlineX + BOX_W / 2 : step.stepX + BOX_W / 2;
    const right = onRight ? step.stepX - BOX_W / 2 : bloodlineX - BOX_W / 2;
    lines.push({
      key: `tie-${step.famId}`,
      x1: left,
      y1: tieY,
      x2: right,
      y2: tieY
    });
  }
  return linesOnly(lines);
}
