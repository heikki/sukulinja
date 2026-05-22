// Parent row — chart-root parent FN and the depth-1 lateral ring (ADR-0002):
// Aunts/Uncles, Step-fam fan, Half-siblings, BloodlineFootprint clearance.

import type { FamilyRow } from '@common/types';

import {
  isMeaningfulSpouseFam,
  isPersonKnown,
  presentChildren
} from '../helpers';
import type { Extents, LayoutIndices } from '../helpers';
import type { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import type { Anchor, KidSlot } from '../nodes/types';
import { buildAncestorStack } from './ancestor-stack';
import { buildAnchoredFamily, buildCenteredFamily } from './family';
import type { SpousePlacement } from './family';
import { buildSibship } from './sibship';
import type { Sibship } from './sibship';

export function buildParentRow(
  focusNode: PersonNode,
  siblingNodes: readonly PersonNode[],
  ix: LayoutIndices
): FamilyNode {
  const focusId = focusNode.personId;
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam === undefined) {
    throw new Error(`buildParentRow: focus ${focusId} has no parent family`);
  }

  const focusRow = packFocusRow(parentFam, focusNode, siblingNodes, ix);
  const footprint = computeBloodlineFootprint(parentFam, focusRow, ix);

  const fatherNode = buildAncestorPersonAtParentRow(
    parentFam.husband_id,
    parentFam,
    footprint,
    'left',
    ix
  );
  const motherNode = buildAncestorPersonAtParentRow(
    parentFam.wife_id,
    parentFam,
    footprint,
    'right',
    ix
  );

  return buildCenteredFamily({
    famId: parentFam.id,
    husband: fatherNode,
    wife: motherNode,
    kids: focusRow.slots
  });
}

// Birth-order packing, shifted so Focus lands at family-local 0.
interface FocusRowPacking {
  slots: KidSlot[];
  packed: Sibship;
  focusIdx: number;
  focusShift: number;
}

function packFocusRow(
  parentFam: FamilyRow,
  focusNode: PersonNode,
  siblingNodes: readonly PersonNode[],
  ix: LayoutIndices
): FocusRowPacking {
  const focusId = focusNode.personId;
  const sibIds = presentChildren(parentFam, ix);
  const siblingsById = new Map<number, PersonNode>();
  for (const s of siblingNodes) siblingsById.set(s.personId, s);

  const extents: Extents[] = sibIds.map((id) =>
    id === focusId ? focusNode.extents : siblingsById.get(id)!.extents
  );
  const packed = buildSibship(extents);
  const focusIdx = sibIds.indexOf(focusId);
  const focusShift = -packed.positions[focusIdx]!;
  const slots: KidSlot[] = sibIds.map((id, i) => {
    const localX = packed.positions[i]! + focusShift;
    return id === focusId
      ? { personId: id, localX }
      : { node: siblingsById.get(id)!, localX };
  });
  return { slots, packed, focusIdx, focusShift };
}

// ─────────────────────────────────────────────────────────────────────────
// Bloodline footprint
// ─────────────────────────────────────────────────────────────────────────

// Fa/Mo chart-X and the leftmost/rightmost reach of {focus row sibship,
// Fa box, Mo box}. Aunts/Uncles and Step-fam fans must clear the outer
// edges. Focus is pinned at chart X = 0.
class BloodlineFootprint {
  constructor(
    private readonly fatherChartX: number,
    private readonly motherChartX: number,
    private readonly bloodlineEdges: Extents
  ) {}

  parentChartX(side: 'left' | 'right') {
    return side === 'left' ? this.fatherChartX : this.motherChartX;
  }

  outerEdge(side: 'left' | 'right') {
    return this.bloodlineEdges[side];
  }

  parentBoxEdge(side: 'left' | 'right') {
    const x = this.parentChartX(side);
    return side === 'left' ? x - 0.5 : x + 0.5;
  }
}

function computeBloodlineFootprint(
  parentFam: FamilyRow,
  focusRow: FocusRowPacking,
  ix: LayoutIndices
): BloodlineFootprint {
  const fatherPresent = isPersonKnown(parentFam.husband_id, ix);
  const motherPresent = isPersonKnown(parentFam.wife_id, ix);
  // Parents are one slot (= one couple-pitch) apart when both present.
  const sep = fatherPresent && motherPresent ? 1 : 0;
  const fatherChartX = sep > 0 ? -sep / 2 : 0;
  const motherChartX = sep > 0 ? sep / 2 : 0;

  const focusSibshipEdges: Extents = {
    left: focusRow.focusShift,
    right: focusRow.packed.totalWidth + focusRow.focusShift
  };
  const parentCoupleEdges: Extents = {
    left: fatherPresent ? fatherChartX - 0.5 : Infinity,
    right: motherPresent ? motherChartX + 0.5 : -Infinity
  };
  return new BloodlineFootprint(fatherChartX, motherChartX, {
    left: Math.min(focusSibshipEdges.left, parentCoupleEdges.left),
    right: Math.max(focusSibshipEdges.right, parentCoupleEdges.right)
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Fa / Mo PersonNode at Parent row
// ─────────────────────────────────────────────────────────────────────────

function buildAncestorPersonAtParentRow(
  personId: number | null,
  parentFam: FamilyRow,
  footprint: BloodlineFootprint,
  side: 'left' | 'right',
  ix: LayoutIndices
): PersonNode | null {
  if (!isPersonKnown(personId, ix)) return null;
  const ancestorChartX = footprint.parentChartX(side);
  const stepFamSpacer = computeAuntShift(
    personId,
    parentFam.id,
    footprint,
    side,
    ix
  );
  const childhood = buildChildhoodFor(
    personId,
    ancestorChartX,
    side,
    stepFamSpacer,
    ix
  );
  const stepFams = buildStepFamFan(personId, parentFam.id, footprint, side, ix);
  return new PersonNode(
    personId,
    childhood,
    stepFams.marriages,
    stepFams.bloodlineIdx
  );
}

// Aunts/Uncles must clear the footprint outer edge (focus row may reach past
// the parent's box, esp. with descendants) plus the Step-fam fan reservation.
function computeAuntShift(
  parentId: number,
  bloodlineFamId: number,
  footprint: BloodlineFootprint,
  side: 'left' | 'right',
  ix: LayoutIndices
): number {
  const stepFams = measureStepFamsExtent(parentId, bloodlineFamId, ix);
  const parentBoxEdge = footprint.parentBoxEdge(side);
  const outerEdge = footprint.outerEdge(side);
  const extentPastBox =
    side === 'left'
      ? Math.max(0, parentBoxEdge - outerEdge)
      : Math.max(0, outerEdge - parentBoxEdge);
  return extentPastBox + stepFams;
}

function buildChildhoodFor(
  parentId: number,
  ancestorChartX: number,
  side: 'left' | 'right',
  stepFamSpacer: number,
  ix: LayoutIndices
): FamilyNode | null {
  const gpFam = ix.parentFamByPerson.get(parentId);
  if (gpFam === undefined) return null;
  const kids = buildChildhoodKids(parentId, gpFam, side, stepFamSpacer, ix);
  return buildAncestorStack(parentId, 1, ancestorChartX, kids, ix);
}

// Bloodline kid at the inward end; Aunts/Uncles fan outward in birth order,
// past the step-fam reservation so step-spouses + Focus's Half-siblings fit
// between bloodline parent and Aunts/Uncles. See CONTEXT.md.
function buildChildhoodKids(
  bloodlineId: number,
  gpFam: FamilyRow,
  side: 'left' | 'right',
  stepFamSpacer: number,
  ix: LayoutIndices
): KidSlot[] {
  const bloodlineSlot: Anchor = { personId: bloodlineId, localX: 0 };
  const sibIds = presentChildren(gpFam, ix);
  const auntIds = sibIds.filter((sid) => sid !== bloodlineId);
  if (auntIds.length === 0) return [bloodlineSlot];

  const auntNodes = auntIds.map((sid) => new PersonNode(sid, null, [], null));
  const fanLeft = side === 'left';
  // `null` = bloodline slot — rendered upstream but still packed for width.
  const ordered: Array<PersonNode | null> = fanLeft
    ? [...auntNodes, null]
    : [null, ...auntNodes];
  const extents: Extents[] = ordered.map((b) =>
    b === null ? BARE_ANCHOR_EXTENTS : b.extents
  );
  const packed = buildSibship(extents);
  const bloodlineIdx = fanLeft ? ordered.length - 1 : 0;
  const shift = -packed.positions[bloodlineIdx]!;
  const auntShift = stepFamSpacer * (fanLeft ? -1 : 1);

  return ordered.map((node, i) => {
    if (node === null) return bloodlineSlot;
    return {
      node,
      localX: packed.positions[i]! + shift + auntShift
    };
  });
}

const BARE_ANCHOR_EXTENTS: Extents = { left: 0.5, right: 0.5 };

// ─────────────────────────────────────────────────────────────────────────
// Step-fam fan (ADR-0002 — depth-1 only)
// ─────────────────────────────────────────────────────────────────────────

interface StepFamFanResult {
  marriages: Array<FamilyNode | null>;
  bloodlineIdx: number;
}

function buildStepFamFan(
  personId: number,
  bloodlineFamId: number,
  footprint: BloodlineFootprint,
  side: 'left' | 'right',
  ix: LayoutIndices
): StepFamFanResult {
  const allFams = ix.spouseFamsByPerson.get(personId) ?? [];
  const bloodlineIdx = allFams.findIndex((f) => f.id === bloodlineFamId);
  if (bloodlineIdx === -1) {
    return { marriages: [], bloodlineIdx: -1 };
  }

  const marriages: Array<FamilyNode | null> = Array.from(
    { length: allFams.length },
    () => null
  );

  const parentChartX = footprint.parentChartX(side);
  let outer = footprint.outerEdge(side);
  for (const i of nonBloodlineFanOrder(allFams.length, bloodlineIdx)) {
    const fam = allFams[i]!;
    if (!isMeaningfulSpouseFam(fam, personId, ix)) continue;
    const built = buildSidedStepFam(
      personId,
      fam,
      side,
      parentChartX,
      outer,
      ix
    );
    marriages[i] = built.familyNode;
    outer = built.newOuter;
  }

  return { marriages, bloodlineIdx };
}

// Bloodline marriage's chronological neighbours land closest to the parent;
// progressively-distant marriages fan further out.
function nonBloodlineFanOrder(n: number, bloodlineIdx: number): number[] {
  const out: number[] = [];
  for (let step = 1; step < n; step += 1) {
    const post = bloodlineIdx + step;
    const pre = bloodlineIdx - step;
    if (post < n) out.push(post);
    if (pre >= 0) out.push(pre);
  }
  return out;
}

interface StepFamBuilt {
  familyNode: FamilyNode;
  newOuter: number;
}

function buildSidedStepFam(
  personId: number,
  fam: FamilyRow,
  side: 'left' | 'right',
  parentChartX: number,
  outerEdge: number,
  ix: LayoutIndices
): StepFamBuilt {
  const halfSibIds = presentChildren(fam, ix);
  const kidNodes: PersonNode[] = halfSibIds.map(
    (cid) => new PersonNode(cid, null, [], null)
  );
  const halfSibExtents = stepFamSpouseExtents(kidNodes.length);

  // xSpouse is in the parent PersonNode's local frame; chart-X of the
  // step-spouse = parentChartX + xSpouse. No explicit gap: adjacent slot
  // footprints share their half-gap padding.
  const xSpouse =
    side === 'right'
      ? outerEdge - parentChartX + halfSibExtents.left
      : outerEdge - parentChartX - halfSibExtents.right;
  const newOuter =
    side === 'right'
      ? parentChartX + xSpouse + halfSibExtents.right
      : parentChartX + xSpouse - halfSibExtents.left;

  const placement: SpousePlacement = {
    xSpouse,
    childAnchor: { x: xSpouse, kind: 'box-bottom' },
    tieKind: side === 'right' ? 'nonprimary-right' : 'nonprimary-left'
  };

  const familyNode = buildAnchoredFamily({
    anchorId: personId,
    fam,
    kidNodes,
    placement,
    ix
  });
  return { familyNode, newOuter };
}

// Symmetric half-width in slot units: at least one box (= 1 slot), wider
// if the half-sib row demands (each kid is a 1-slot footprint).
function stepFamSpouseExtents(kidCount: number): Extents {
  const half = Math.max(0.5, kidCount / 2);
  return { left: half, right: half };
}

function measureStepFamsExtent(
  personId: number,
  bloodlineFamId: number,
  ix: LayoutIndices
): number {
  const allFams = ix.spouseFamsByPerson.get(personId) ?? [];
  let total = 0;
  for (const fam of allFams) {
    if (fam.id === bloodlineFamId) continue;
    if (!isMeaningfulSpouseFam(fam, personId, ix)) continue;
    const extents = stepFamSpouseExtents(presentChildren(fam, ix).length);
    // No +gap: each step-fam contributes a slot footprint whose padding
    // is implicit; adjacent step-fams share their half-gap padding.
    total += extents.left + extents.right;
  }
  return total;
}
