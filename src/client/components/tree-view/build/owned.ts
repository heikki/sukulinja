// PersonNode builders for "owned marriages" — focus, descendants, siblings.
// These PersonNodes own their marriages directly (the active marriage's
// FamilyNode is in PersonNode.children), unlike bloodline-ancestor
// PersonNodes whose active marriage is rendered by the parent FamilyNode
// above.
//
// Active = chronologically most recent marriage — drawn adjacent to the
// person; earlier marriages fan further outward in fanDir. Siblings only
// ever render their first meaningful spouseFam.

import type { FamilyRow } from '@common/types';

import { buildAnchorAdultFam, packRow } from './marriages';
import type { PackedRow } from './marriages';
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isMeaningfulSpouseFam,
  NONPRIMARY_TIE_Y_OFFSET,
  presentChildren
} from '../helpers';
import type { LayoutIndices } from '../helpers';
import type { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';

export function buildFocusNode(personId: number, ix: LayoutIndices) {
  return buildOwnedMarriagesNode(personId, 0, ix.levels >= 1, ix);
}

function buildDescendantKidNode(
  personId: number,
  depth: number,
  ix: LayoutIndices
) {
  return buildOwnedMarriagesNode(personId, depth, depth < ix.levels, ix);
}

export function buildSiblingNode(personId: number, ix: LayoutIndices) {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonNode(personId, null, [], null);
  const primary = fams[0]!;
  const fanDir = fanDirOfPerson(personId, fams, ix);
  const placement = primarySpousePlacement(fanDir);
  const familyNode = buildAnchorAdultFam({
    anchorAdultId: personId,
    fam: primary,
    kidNodes: [],
    packed: packRow([]),
    placement,
    ix
  });
  return new PersonNode(personId, null, [familyNode], 0);
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

function buildOwnedMarriagesNode(
  personId: number,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
) {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonNode(personId, null, [], null);
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
    const isActive = off === 0;
    const kidNodes = ownedKidNodes(fam, depth, includeChildren, ix);
    const packed = packRow(kidNodes.map((k) => k.extents));
    const placement = isActive
      ? primarySpousePlacement(fanDir)
      : nonPrimarySpousePlacement(fanDir, outerEdge, packed);
    const familyNode = buildAnchorAdultFam({
      anchorAdultId: personId,
      fam,
      kidNodes,
      packed,
      placement,
      ix
    });
    marriages[i] = familyNode;
    outerEdge = Math.max(
      outerEdge,
      fanDir === 1 ? familyNode.extents.right : familyNode.extents.left
    );
  }
  return new PersonNode(personId, null, marriages, activeIdx);
}

function ownedKidNodes(
  fam: FamilyRow,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
) {
  if (!includeChildren) return [];
  return presentChildren(fam, ix).map((cid) =>
    buildDescendantKidNode(cid, depth + 1, ix)
  );
}

function primarySpousePlacement(fanDir: 1 | -1) {
  const xSpouse = fanDir * COUPLE_PITCH;
  return { xSpouse, childAnchor: { x: xSpouse / 2, y: 0 }, tieY: 0 };
}

function nonPrimarySpousePlacement(
  fanDir: 1 | -1,
  outerEdge: number,
  packed: PackedRow
) {
  const sibInner =
    fanDir === 1 ? packed.barMid : packed.totalWidth - packed.barMid;
  const innerClear = Math.max(BOX_W / 2, sibInner);
  const xSpouse = fanDir * (outerEdge + COUPLE_GAP + innerClear);
  return {
    xSpouse,
    childAnchor: { x: xSpouse, y: BOX_H / 2 },
    tieY: -NONPRIMARY_TIE_Y_OFFSET * fanDir
  };
}
