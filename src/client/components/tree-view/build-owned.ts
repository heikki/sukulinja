// PersonBlock builders for "owned marriages" — focus, descendants, siblings.
// These PBs own their marriages directly (active marriage's FB is in their
// PB.children), unlike bloodline-ancestor PBs whose active marriage is
// rendered by the parent FB above.
//
// Active = chronologically most recent marriage — drawn adjacent to the
// person; earlier marriages fan further outward in fanDir. Siblings only
// ever render their first meaningful spouseFam.

import type { FamilyBlock } from './block-family';
import { PersonBlock } from './block-person';
import { buildExternalAdultFB, packBlocks } from './build-marriages';
import type { PackedBlocks } from './build-marriages';
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isHusbandIn,
  isMeaningfulSpouseFam,
  NONPRIMARY_TIE_Y_OFFSET,
  presentChildren
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

export function buildFocusPB(personId: number, ix: LayoutIndices) {
  return buildOwnedMarriagesPB(personId, 0, ix.levels >= 1, ix);
}

export function buildDescendantKidPB(
  personId: number,
  depth: number,
  ix: LayoutIndices
) {
  return buildOwnedMarriagesPB(personId, depth, depth < ix.levels, ix);
}

export function buildSiblingPB(personId: number, ix: LayoutIndices) {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonBlock(personId, null, [], null);
  const primary = fams[0]!;
  const fanDir = fanDirOfPerson(personId, fams, ix);
  const placement = primarySpousePlacement(fanDir);
  const fb = buildExternalAdultFB({
    externalAdultId: personId,
    fam: primary,
    kidBlocks: [],
    packed: packBlocks([]),
    placement,
    ix
  });
  return new PersonBlock(personId, null, [fb], 0);
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
  if (fams.some((f) => isHusbandIn(f, personId))) return 1;
  if (fams.some((f) => f.wife_id === personId)) return -1;
  return ix.persons.get(personId)?.sex === 'M' ? 1 : -1;
}

function buildOwnedMarriagesPB(
  personId: number,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
) {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonBlock(personId, null, [], null);
  const fanDir = fanDirOfPerson(personId, fams, ix);
  const activeIdx = fams.length - 1;
  const marriages: Array<FamilyBlock | null> = Array.from(
    { length: fams.length },
    () => null
  );
  let outerEdge = BOX_W / 2;
  for (let off = 0; off < fams.length; off += 1) {
    const i = activeIdx - off;
    const fam = fams[i]!;
    const isActive = off === 0;
    const kidBlocks = ownedKidBlocks(fam, depth, includeChildren, ix);
    const packed = packBlocks(kidBlocks.map((k) => k.extents));
    const placement = isActive
      ? primarySpousePlacement(fanDir)
      : nonPrimarySpousePlacement(fanDir, outerEdge, packed);
    const fb = buildExternalAdultFB({
      externalAdultId: personId,
      fam,
      kidBlocks,
      packed,
      placement,
      ix
    });
    marriages[i] = fb;
    outerEdge = Math.max(
      outerEdge,
      fanDir === 1 ? fb.extents.right : fb.extents.left
    );
  }
  return new PersonBlock(personId, null, marriages, activeIdx);
}

function ownedKidBlocks(
  fam: FamilyRow,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
) {
  if (!includeChildren) return [];
  return presentChildren(fam, ix).map((cid) =>
    buildDescendantKidPB(cid, depth + 1, ix)
  );
}

function primarySpousePlacement(fanDir: 1 | -1) {
  const xSpouse = fanDir * COUPLE_PITCH;
  return { xSpouse, childAnchor: { x: xSpouse / 2, y: 0 }, tieY: 0 };
}

function nonPrimarySpousePlacement(
  fanDir: 1 | -1,
  outerEdge: number,
  packed: PackedBlocks
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
