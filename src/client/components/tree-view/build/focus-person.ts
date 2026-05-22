// Focus's PersonNode (chart root) and its downward subtree.

import type { FamilyRow } from '@common/types';

import {
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isMeaningfulSpouseFam,
  presentChildren
} from '../helpers';
import type { LayoutIndices } from '../helpers';
import type { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import { buildAnchoredFamily } from './family';
import type { SpousePlacement } from './family';
import { buildParentRow } from './parent-row';
import { buildSibship } from './sibship';
import type { Sibship } from './sibship';

export function buildFocusPerson(
  focusId: number,
  ix: LayoutIndices
): PersonNode {
  const downward = buildOwnedMarriages(focusId, 0, ix.levels >= 1, ix);
  const focus = new PersonNode(
    focusId,
    null,
    downward.marriages,
    downward.activeIdx
  );

  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam === undefined || ix.levels < 1) return focus;

  const sibIds = presentChildren(parentFam, ix);
  const siblings = sibIds
    .filter((id) => id !== focusId)
    .map((id) => buildSibling(id, ix));

  // childhoodFamily is still null here, so focus.extents reflects only the
  // downward subtree — what parent-row wants for sibship packing.
  focus.childhoodFamily = buildParentRow(focus, siblings, ix);
  return focus;
}

// First spouseFam only, no kids — per CONTEXT.md "Spouse".
function buildSibling(personId: number, ix: LayoutIndices): PersonNode {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonNode(personId, null, [], null);
  const primary = fams[0]!;
  const fanDir = fanDirOfPerson(personId, fams, ix);
  const familyNode = buildAnchoredFamily({
    anchorId: personId,
    fam: primary,
    kidNodes: [],
    placement: primaryPlacement(fanDir),
    ix
  });
  return new PersonNode(personId, null, [familyNode], 0);
}

function buildDescendantKid(
  personId: number,
  depth: number,
  ix: LayoutIndices
): PersonNode {
  const { marriages, activeIdx } = buildOwnedMarriages(
    personId,
    depth,
    depth < ix.levels,
    ix
  );
  return new PersonNode(personId, null, marriages, activeIdx);
}

interface OwnedMarriagesResult {
  marriages: ReadonlyArray<FamilyNode | null>;
  activeIdx: number | null;
}

// Active (= most recent) marriage gets primary placement; earlier marriages
// fan outward in fanDir using accumulated outerEdge.
function buildOwnedMarriages(
  personId: number,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
): OwnedMarriagesResult {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return { marriages: [], activeIdx: null };

  const fanDir = fanDirOfPerson(personId, fams, ix);
  const activeIdx = fams.length - 1;
  const marriages: Array<FamilyNode | null> = Array.from(
    { length: fams.length },
    () => null
  );

  let outerEdge = BOX_W / 2;
  for (let off = 0; off < fams.length; off += 1) {
    const i = activeIdx - off;
    const fam = fams[i]!;
    const kidNodes = ownedKidNodes(fam, depth, includeChildren, ix);
    const packed = buildSibship(kidNodes.map((k) => k.extents));
    const isActive = off === 0;
    const placement = isActive
      ? primaryPlacement(fanDir)
      : nonPrimaryPlacement(fanDir, outerEdge, packed);
    const familyNode = buildAnchoredFamily({
      anchorId: personId,
      fam,
      kidNodes,
      placement,
      ix,
      packed
    });
    marriages[i] = familyNode;
    outerEdge = Math.max(
      outerEdge,
      fanDir === 1 ? familyNode.extents.right : familyNode.extents.left
    );
  }
  return { marriages, activeIdx };
}

function ownedKidNodes(
  fam: FamilyRow,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
): PersonNode[] {
  if (!includeChildren) return [];
  return presentChildren(fam, ix).map((cid) =>
    buildDescendantKid(cid, depth + 1, ix)
  );
}

function meaningfulSpouseFams(personId: number, ix: LayoutIndices) {
  const fams = ix.spouseFamsByPerson.get(personId) ?? [];
  return fams.filter((f) => isMeaningfulSpouseFam(f, personId, ix));
}

function fanDirOfPerson(
  personId: number,
  fams: readonly FamilyRow[],
  ix: LayoutIndices
): 1 | -1 {
  if (fams.some((f) => f.husband_id === personId)) return 1;
  if (fams.some((f) => f.wife_id === personId)) return -1;
  return ix.persons.get(personId)?.sex === 'M' ? 1 : -1;
}

function primaryPlacement(fanDir: 1 | -1): SpousePlacement {
  const xSpouse = fanDir * COUPLE_PITCH;
  return {
    xSpouse,
    childAnchor: { x: xSpouse / 2, kind: 'tie-midpoint' },
    tieKind: 'centered'
  };
}

function nonPrimaryPlacement(
  fanDir: 1 | -1,
  outerEdge: number,
  packed: Sibship
): SpousePlacement {
  const sibInner =
    fanDir === 1 ? packed.barMid : packed.totalWidth - packed.barMid;
  const innerClear = Math.max(BOX_W / 2, sibInner);
  const xSpouse = fanDir * (outerEdge + COUPLE_GAP + innerClear);
  return {
    xSpouse,
    childAnchor: { x: xSpouse, kind: 'box-bottom' },
    tieKind: fanDir === 1 ? 'nonprimary-right' : 'nonprimary-left'
  };
}
