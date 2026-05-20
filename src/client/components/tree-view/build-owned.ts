// PersonBlock builders for "owned marriages" — focus, descendants, siblings.
// These PBs own their marriages directly (active marriage's FB is in their
// PB.children), unlike bloodline-ancestor PBs whose active marriage is
// rendered by the parent FB above (see build-step-fams.ts).
//
// Active = chronologically most recent marriage — drawn adjacent to the
// person; earlier marriages fan further outward in fanDir. Siblings only
// ever render their first meaningful spouseFam.

import type { AdultPlacement, FamilyBlock, KidPlacement } from './block-family';
import { PersonBlock } from './block-person';
import {
  buildMarriageFamilyBlock,
  kidXsFromPacked,
  packBlocks,
  type PackedBlocks
} from './build-marriages';
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isHusbandIn,
  isMeaningfulSpouseFam,
  NONPRIMARY_TIE_Y_OFFSET,
  otherSpouseOf,
  presentChildren
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

export function buildFocusPersonBlock(
  personId: number,
  ix: LayoutIndices
): PersonBlock {
  return buildOwnedMarriagesPB(personId, 0, ix.levels >= 1, ix);
}

export function buildDescendantKidPersonBlock(
  personId: number,
  depth: number,
  ix: LayoutIndices
): PersonBlock {
  return buildOwnedMarriagesPB(personId, depth, depth < ix.levels, ix);
}

export function buildSiblingPersonBlock(
  personId: number,
  ix: LayoutIndices
): PersonBlock {
  const fams = meaningfulSpouseFams(personId, ix);
  if (fams.length === 0) return new PersonBlock(personId, null, [], null);
  const primary = fams[0]!;
  const fanDir = fanDirOfPerson(personId, fams, ix);
  const placement = primarySpousePlacement(fanDir);
  const fb = buildOwnedMarriageFB({
    externalAdultId: personId,
    fam: primary,
    kidBlocks: [],
    packed: packBlocks([]),
    placement,
    ix
  });
  return new PersonBlock(personId, null, [fb], 0);
}

export function meaningfulSpouseFams(
  personId: number,
  ix: LayoutIndices
): FamilyRow[] {
  const fams = ix.spouseFamsByPerson.get(personId) ?? [];
  return fams.filter((f) => isMeaningfulSpouseFam(f, personId, ix));
}

export function fanDirOfPerson(
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
): PersonBlock {
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
    const packed = packBlocks(kidBlocks);
    const placement = isActive
      ? primarySpousePlacement(fanDir)
      : nonPrimarySpousePlacement(fanDir, outerEdge, packed);
    const fb = buildOwnedMarriageFB({
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
      fanDir === 1 ? fb.rightWidth : fb.leftWidth
    );
  }
  return new PersonBlock(personId, null, marriages, activeIdx);
}

function ownedKidBlocks(
  fam: FamilyRow,
  depth: number,
  includeChildren: boolean,
  ix: LayoutIndices
): PersonBlock[] {
  if (!includeChildren) return [];
  return presentChildren(fam, ix).map((cid) =>
    buildDescendantKidPersonBlock(cid, depth + 1, ix)
  );
}

interface SpousePlacement {
  xSpouse: number;
  anchorX: number;
  anchorY: number;
  tieY: number;
}

function primarySpousePlacement(fanDir: 1 | -1): SpousePlacement {
  const xSpouse = fanDir * COUPLE_PITCH;
  return { xSpouse, anchorX: xSpouse / 2, anchorY: 0, tieY: 0 };
}

function nonPrimarySpousePlacement(
  fanDir: 1 | -1,
  outerEdge: number,
  packed: PackedBlocks
): SpousePlacement {
  const sibInner =
    fanDir === 1 ? packed.barMid : packed.totalWidth - packed.barMid;
  const innerClear = Math.max(BOX_W / 2, sibInner);
  const xSpouse = fanDir * (outerEdge + COUPLE_GAP + innerClear);
  return {
    xSpouse,
    anchorX: xSpouse,
    anchorY: BOX_H / 2,
    tieY: -NONPRIMARY_TIE_Y_OFFSET * fanDir
  };
}

interface BuildOwnedMarriageArgs {
  externalAdultId: number;
  fam: FamilyRow;
  kidBlocks: PersonBlock[];
  packed: PackedBlocks;
  placement: SpousePlacement;
  ix: LayoutIndices;
}

function buildOwnedMarriageFB(args: BuildOwnedMarriageArgs): FamilyBlock {
  const { externalAdultId, fam, kidBlocks, packed, placement, ix } = args;
  const otherId = otherSpouseOf(fam, externalAdultId);
  const renderedSpouseId =
    otherId !== null && ix.persons.has(otherId) ? otherId : null;

  const externalIsHusband = isHusbandIn(fam, externalAdultId);
  const externalAdult: AdultPlacement = {
    id: externalAdultId,
    external: true,
    x: 0,
    block: null
  };
  const spouseAdult: AdultPlacement | null =
    otherId === null
      ? null
      : {
          id: otherId,
          external: renderedSpouseId === null,
          x: placement.xSpouse,
          block:
            renderedSpouseId === null
              ? null
              : new PersonBlock(renderedSpouseId, null, [], null)
        };

  const kidXs = kidXsFromPacked(packed, placement.anchorX);
  const kids: KidPlacement[] = kidBlocks.map((kb, i) => ({
    id: kb.personId,
    external: false,
    x: kidXs[i]!,
    block: kb
  }));

  return buildMarriageFamilyBlock({
    famId: fam.id,
    husband: externalIsHusband ? externalAdult : spouseAdult,
    wife: externalIsHusband ? spouseAdult : externalAdult,
    kids,
    anchorX: placement.anchorX,
    anchorY: placement.anchorY,
    tieY: placement.tieY
  });
}
